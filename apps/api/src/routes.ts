import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize, hashPassword, issueTokens, revokeRefreshToken, rotateRefreshToken, verifyPassword } from "./auth.js";
import { config } from "./config.js";
import { prisma } from "./lib.js";
import { writeAudit } from "./services/audit.js";
import { matchDriver } from "./services/dispatch.js";
import { calculateFare } from "./services/fare.js";
import { markNotificationRead, queueNotification } from "./services/notifications.js";
import { adminPaymentConfiguration, mobileMoneyDisplayNumber } from "./services/payment-settings.js";
import { paymentProvider, verifyWebhookSignature } from "./services/payments.js";
import { assertTransition, type RideState } from "./services/ride-state.js";
import { logger } from "./logger.js";

export const api = Router();
const asyncRoute = (handler: (req: any, res: any) => Promise<unknown>) =>
  (req: any, res: any, next: any) => Promise.resolve(handler(req, res)).catch(next);

const registration = z.object({
  phone: z.string().min(8).max(20),
  email: z.email().optional(),
  password: z.string().min(12).max(128),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  role: z.enum(["PASSENGER", "DRIVER"])
});

api.post("/auth/register", asyncRoute(async (req, res) => {
  const input = registration.parse(req.body);
  const { password, email, ...profile } = input;
  const user = await prisma.user.create({
    data: { ...profile, ...(email ? { email } : {}), passwordHash: await hashPassword(password), status: "ACTIVE" },
    select: { id: true, phone: true, email: true, firstName: true, lastName: true, role: true }
  });
  res.status(201).json({ data: user, tokens: await issueTokens({ sub: user.id, role: user.role }) });
}));

api.post("/auth/login", asyncRoute(async (req, res) => {
  const input = z.object({ phone: z.string(), password: z.string() }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (!user || user.status !== "ACTIVE" || !(await verifyPassword(user.passwordHash, input.password))) {
    return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Phone or password is incorrect" } });
  }
  res.json({ data: { id: user.id, role: user.role }, tokens: await issueTokens({ sub: user.id, role: user.role }) });
}));

api.post("/auth/refresh", asyncRoute(async (req, res) => {
  const token = z.object({ refreshToken: z.string().min(20) }).parse(req.body).refreshToken;
  try {
    res.json({ tokens: await rotateRefreshToken(token) });
  } catch {
    res.status(401).json({ error: { code: "INVALID_REFRESH_TOKEN", message: "Refresh token is invalid or expired" } });
  }
}));

api.post("/auth/logout", asyncRoute(async (req, res) => {
  const token = z.object({ refreshToken: z.string().min(20) }).parse(req.body).refreshToken;
  await revokeRefreshToken(token);
  res.status(204).send();
}));

const tokenDigest = (value: string) => createHash("sha256").update(value).digest("hex");
async function createVerificationToken(userId: string, type: "EMAIL_VERIFY" | "PASSWORD_RESET") {
  const token = randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: { userId, type, tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + (type === "PASSWORD_RESET" ? 3_600_000 : 86_400_000)) }
  });
  return token;
}

api.post("/auth/email-verification/request", authenticate, asyncRoute(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
  if (!user.email) return res.status(422).json({ error: { code: "EMAIL_REQUIRED", message: "Add an email address first" } });
  const token = await createVerificationToken(user.id, "EMAIL_VERIFY");
  await queueNotification({ userId: user.id, channel: "EMAIL", template: "email-verification", title: "Verify your LibSwiftRide email", body: `Verification token: ${token}` });
  res.status(202).json({ data: { accepted: true } });
}));

api.post("/auth/email-verification/confirm", asyncRoute(async (req, res) => {
  const token = z.object({ token: z.string().min(32) }).parse(req.body).token;
  const record = await prisma.verificationToken.findUnique({ where: { tokenHash: tokenDigest(token) } });
  if (!record || record.type !== "EMAIL_VERIFY" || record.usedAt || record.expiresAt < new Date()) return res.status(400).json({ error: { code: "INVALID_TOKEN", message: "Verification token is invalid or expired" } });
  await prisma.$transaction([
    prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } })
  ]);
  res.json({ data: { verified: true } });
}));

api.post("/auth/password-reset/request", asyncRoute(async (req, res) => {
  const email = z.object({ email: z.email() }).parse(req.body).email;
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = await createVerificationToken(user.id, "PASSWORD_RESET");
    await queueNotification({ userId: user.id, channel: "EMAIL", template: "password-reset", title: "Reset your LibSwiftRide password", body: `Reset token: ${token}` });
  }
  res.status(202).json({ data: { accepted: true } });
}));

api.post("/auth/password-reset/confirm", asyncRoute(async (req, res) => {
  const input = z.object({ token: z.string().min(32), password: z.string().min(12).max(128) }).parse(req.body);
  const record = await prisma.verificationToken.findUnique({ where: { tokenHash: tokenDigest(input.token) } });
  if (!record || record.type !== "PASSWORD_RESET" || record.usedAt || record.expiresAt < new Date()) return res.status(400).json({ error: { code: "INVALID_TOKEN", message: "Reset token is invalid or expired" } });
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(input.password) } }),
    prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } })
  ]);
  res.json({ data: { reset: true } });
}));

const location = z.object({
  address: z.string().min(3).max(240),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180)
});
const quoteInput = z.object({ pickup: location, destination: location });
const mobileMoneyMethod = z.enum(["ORANGE_MONEY", "MTN_MOMO"]);

api.get("/payments/mobile-money/:method/display", authenticate, authorize("PASSENGER"), asyncRoute(async (req, res) => {
  const method = mobileMoneyMethod.parse(req.params.method);
  const paymentNumber = mobileMoneyDisplayNumber(method);
  if (!paymentNumber) {
    return res.status(503).json({ error: { code: "PAYMENT_DESTINATION_UNAVAILABLE", message: "This Mobile Money destination is not configured" } });
  }
  res.setHeader("cache-control", "private, no-store");
  res.json({ data: { method, paymentNumber } });
}));

api.post("/rides/quote", authenticate, asyncRoute(async (req, res) => {
  const input = quoteInput.extend({ promoCode: z.string().optional() }).parse(req.body);
  const promo = input.promoCode ? await prisma.promoCode.findFirst({ where: { code: input.promoCode.toUpperCase(), active: true, startsAt: { lte: new Date() }, expiresAt: { gte: new Date() } } }) : null;
  res.json({ data: calculateFare({ distanceM: 5_000, durationSec: 1_200, ...(promo ? { promo } : {}) }) });
}));

api.post("/rides", authenticate, authorize("PASSENGER"), asyncRoute(async (req, res) => {
  const input = quoteInput.extend({ paymentMethod: z.enum(["CASH", "ORANGE_MONEY", "MTN_MOMO", "STRIPE", "WALLET"]).default("CASH"), promoCode: z.string().optional() }).parse(req.body);
  const idempotencyKey = z.string().min(8).parse(req.header("idempotency-key"));
  const replay = await prisma.ride.findUnique({ where: { passengerId_idempotencyKey: { passengerId: req.user!.sub, idempotencyKey } } });
  if (replay) return res.json({ data: replay });
  const promoCandidate = input.promoCode ? await prisma.promoCode.findFirst({ where: { code: input.promoCode.toUpperCase(), active: true, startsAt: { lte: new Date() }, expiresAt: { gte: new Date() } } }) : null;
  const promo = promoCandidate && (promoCandidate.maxUses == null || promoCandidate.uses < promoCandidate.maxUses) ? promoCandidate : null;
  const { subtotalMinor: _subtotalMinor, ...pricing } = calculateFare({ distanceM: 5_000, durationSec: 1_200, ...(promo ? { promo } : {}) });
  const ride = await prisma.ride.upsert({
    where: { passengerId_idempotencyKey: { passengerId: req.user!.sub, idempotencyKey } },
    update: {},
    create: {
      passengerId: req.user!.sub, idempotencyKey, status: "SEARCHING",
      pickupAddress: input.pickup.address, pickupLatitude: input.pickup.latitude, pickupLongitude: input.pickup.longitude,
      destinationAddress: input.destination.address, destinationLatitude: input.destination.latitude,
      destinationLongitude: input.destination.longitude, paymentMethod: input.paymentMethod, ...(promo ? { promoCodeId: promo.id } : {}), ...pricing,
      events: { create: { type: "RIDE_REQUESTED", actorId: req.user!.sub } }
    }
  });
  if (promo) await prisma.promoCode.update({ where: { id: promo.id }, data: { uses: { increment: 1 } } });
  void matchDriver(ride.id).catch((error) => logger.error({ err: error, rideId: ride.id }, "automatic matching failed"));
  res.status(201).json({ data: ride });
}));

api.get("/rides", authenticate, asyncRoute(async (req, res) => {
  const limit = z.coerce.number().int().min(1).max(100).default(25).parse(req.query.limit);
  const driver = req.user!.role === "DRIVER" ? await prisma.driver.findUnique({ where: { userId: req.user!.sub } }) : null;
  const where = req.user!.role === "PASSENGER" ? { passengerId: req.user!.sub } : driver ? { driverId: driver.id } : {};
  const rides = await prisma.ride.findMany({ where, orderBy: { requestedAt: "desc" }, take: limit, include: { driver: { include: { user: true, vehicle: true } }, payment: true, ratings: true } });
  res.json({ data: rides });
}));

api.get("/rides/:id", authenticate, asyncRoute(async (req, res) => {
  const ride = await prisma.ride.findUnique({ where: { id: req.params.id }, include: { driver: { include: { user: true, vehicle: true } }, payment: true } });
  if (!ride) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ride not found" } });
  const ownsRide = ride.passengerId === req.user!.sub || ride.driver?.userId === req.user!.sub;
  if (!ownsRide && !["ADMIN", "SUPPORT"].includes(req.user!.role)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Ride access denied" } });
  res.json({ data: ride });
}));

api.post("/rides/:id/transitions", authenticate, authorize("PASSENGER", "DRIVER", "ADMIN", "SUPPORT"), asyncRoute(async (req, res) => {
  const { status } = z.object({ status: z.enum(["SEARCHING", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]) }).parse(req.body);
  const ride = await prisma.ride.findUnique({ where: { id: req.params.id }, include: { driver: true } });
  if (!ride) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ride not found" } });
  const participant = ride.passengerId === req.user!.sub || ride.driver?.userId === req.user!.sub;
  if (!participant && !["ADMIN", "SUPPORT"].includes(req.user!.role)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Ride access denied" } });
  assertTransition(ride.status as RideState, status);
  if (status === "IN_PROGRESS" && ride.driver?.userId !== req.user!.sub && req.user!.role !== "ADMIN") return res.status(403).json({ error: { code: "DRIVER_REQUIRED", message: "Only the assigned driver can start this ride" } });
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.ride.update({ where: { id: ride.id, status: ride.status }, data: { status, ...(status === "IN_PROGRESS" ? { startedAt: new Date() } : {}), ...(status === "COMPLETED" ? { completedAt: new Date() } : {}) } });
    await tx.rideEvent.create({ data: { rideId: ride.id, type: `RIDE_${status}`, actorId: req.user!.sub } });
    if (ride.driverId && ["COMPLETED", "CANCELLED"].includes(status)) await tx.driver.update({ where: { id: ride.driverId }, data: { status: "AVAILABLE" } });
    if (status === "COMPLETED" && ride.driver) {
      const wallet = await tx.wallet.upsert({ where: { userId: ride.driver.userId }, update: {}, create: { userId: ride.driver.userId } });
      await tx.wallet.update({ where: { id: wallet.id }, data: { balanceMinor: { increment: ride.driverEarningsMinor }, transactions: { create: { type: "CREDIT", amountMinor: ride.driverEarningsMinor, balanceMinor: wallet.balanceMinor + ride.driverEarningsMinor, reference: `ride:${ride.id}`, idempotencyKey: `ride-earnings:${ride.id}`, description: "Driver ride earnings" } } } });
    }
    return result;
  });
  res.json({ data: updated });
}));

api.post("/rides/:id/ratings", authenticate, asyncRoute(async (req, res) => {
  const input = z.object({ score: z.number().int().min(1).max(5), comment: z.string().max(500).optional() }).parse(req.body);
  const ride = await prisma.ride.findUnique({ where: { id: req.params.id }, include: { driver: true } });
  if (!ride || ride.status !== "COMPLETED" || !ride.driver) return res.status(422).json({ error: { code: "RIDE_NOT_RATEABLE", message: "Only completed rides can be rated" } });
  const subjectId = ride.passengerId === req.user!.sub ? ride.driver.userId : ride.driver.userId === req.user!.sub ? ride.passengerId : null;
  if (!subjectId) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Only ride participants can rate" } });
  const { comment, ...ratingInput } = input;
  const rating = await prisma.rating.create({ data: { rideId: ride.id, authorId: req.user!.sub, subjectId, ...ratingInput, ...(comment ? { comment } : {}) } });
  res.status(201).json({ data: rating });
}));

api.get("/wallet", authenticate, asyncRoute(async (req, res) => {
  const wallet = await prisma.wallet.upsert({ where: { userId: req.user!.sub }, update: {}, create: { userId: req.user!.sub }, include: { transactions: { orderBy: { createdAt: "desc" }, take: 50 } } });
  res.json({ data: wallet });
}));

api.post("/rides/:id/payments", authenticate, asyncRoute(async (req, res) => {
  const input = z.object({ method: z.enum(["CASH", "ORANGE_MONEY", "MTN_MOMO", "STRIPE"]), phone: z.string().optional(), returnUrl: z.url().optional() }).parse(req.body);
  const ride = await prisma.ride.findUnique({ where: { id: req.params.id } });
  if (!ride || ride.passengerId !== req.user!.sub) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ride not found" } });
  const idempotencyKey = z.string().min(8).parse(req.header("idempotency-key"));
  const existing = await prisma.payment.findFirst({ where: { OR: [{ idempotencyKey }, { rideId: ride.id }] } });
  if (existing) return res.json({ data: existing });
  const provider = paymentProvider(input.method);
  const result = await provider.createPayment({ amountMinor: ride.fareMinor, currency: ride.currency, idempotencyKey, ...(input.phone ? { phone: input.phone } : {}), ...(input.returnUrl ? { returnUrl: input.returnUrl } : {}) });
  const payment = await prisma.payment.create({ data: { rideId: ride.id, provider: input.method, providerRef: result.providerRef, idempotencyKey, amountMinor: ride.fareMinor, currency: ride.currency, method: input.method, status: result.status, ...(result.checkoutUrl ? { providerPayload: { checkoutUrl: result.checkoutUrl } } : {}) } });
  res.status(201).json({ data: payment, checkoutUrl: result.checkoutUrl });
}));

api.get("/notifications", authenticate, asyncRoute(async (req, res) => {
  res.json({ data: await prisma.notification.findMany({ where: { userId: req.user!.sub }, orderBy: { createdAt: "desc" }, take: 50 }) });
}));

api.post("/notifications/:id/read", authenticate, asyncRoute(async (req, res) => {
  await markNotificationRead(req.user!.sub, req.params.id);
  res.status(204).send();
}));

api.post("/drivers/onboarding", authenticate, authorize("DRIVER"), asyncRoute(async (req, res) => {
  const input = z.object({ licenseNumber: z.string().min(4), nationalIdRef: z.string().min(4) }).parse(req.body);
  const driver = await prisma.driver.upsert({ where: { userId: req.user!.sub }, update: { ...input, onboardingStep: "DOCUMENTS" }, create: { userId: req.user!.sub, ...input, onboardingStep: "DOCUMENTS" } });
  await prisma.kycCase.upsert({ where: { driverId: driver.id }, update: {}, create: { driverId: driver.id } });
  res.json({ data: driver });
}));

api.put("/drivers/kyc/documents/:type", authenticate, authorize("DRIVER"), asyncRoute(async (req, res) => {
  const type = z.enum(["NATIONAL_ID", "DRIVER_LICENSE", "VEHICLE_REGISTRATION", "INSURANCE", "INSPECTION", "PROFILE_PHOTO"]).parse(req.params.type);
  const input = z.object({ storageKey: z.string().min(10).max(500), mimeType: z.enum(["image/jpeg", "image/png", "application/pdf"]), checksum: z.string().regex(/^[a-f0-9]{64}$/i), expiresAt: z.coerce.date().optional() }).parse(req.body);
  const driver = await prisma.driver.findUnique({ where: { userId: req.user!.sub } });
  if (!driver) return res.status(404).json({ error: { code: "DRIVER_NOT_FOUND", message: "Complete driver onboarding first" } });
  const kycCase = await prisma.kycCase.upsert({ where: { driverId: driver.id }, update: {}, create: { driverId: driver.id } });
  if (!["DRAFT", "REJECTED"].includes(kycCase.status)) return res.status(409).json({ error: { code: "KYC_LOCKED", message: "Documents cannot be changed during review" } });
  const { expiresAt, ...documentInput } = input;
  const documentData = { ...documentInput, ...(expiresAt ? { expiresAt } : {}) };
  const document = await prisma.kycDocument.upsert({ where: { kycCaseId_type: { kycCaseId: kycCase.id, type } }, update: documentData, create: { kycCaseId: kycCase.id, type, ...documentData } });
  res.json({ data: document });
}));

api.post("/drivers/kyc/submit", authenticate, authorize("DRIVER"), asyncRoute(async (req, res) => {
  const driver = await prisma.driver.findUnique({ where: { userId: req.user!.sub }, include: { kycCase: { include: { documents: true } } } });
  if (!driver?.kycCase) return res.status(422).json({ error: { code: "KYC_NOT_STARTED", message: "Upload verification documents first" } });
  const required = ["NATIONAL_ID", "DRIVER_LICENSE", "PROFILE_PHOTO"];
  const present = new Set(driver.kycCase.documents.map((document) => document.type));
  if (required.some((type) => !present.has(type as any))) return res.status(422).json({ error: { code: "KYC_DOCUMENTS_REQUIRED", message: "National ID, driver license and profile photo are required" } });
  const submitted = await prisma.kycCase.update({ where: { id: driver.kycCase.id }, data: { status: "SUBMITTED", submittedAt: new Date(), rejectionCode: null, rejectionNotes: null } });
  await queueNotification({ userId: req.user!.sub, channel: "IN_APP", template: "kyc-submitted", title: "Verification submitted", body: "Your documents are queued for review." });
  res.json({ data: submitted });
}));

api.get("/admin/kyc", authenticate, authorize("ADMIN"), asyncRoute(async (req, res) => {
  const status = z.enum(["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "EXPIRED"]).optional().parse(req.query.status);
  const cases = await prisma.kycCase.findMany({ where: status ? { status } : {}, include: { driver: { include: { user: true, vehicle: true } }, documents: true, reviewer: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { submittedAt: "asc" }, take: 100 });
  res.json({ data: cases });
}));

api.post("/admin/kyc/:id/review", authenticate, authorize("ADMIN"), asyncRoute(async (req, res) => {
  const input = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), rejectionCode: z.string().max(80).optional(), rejectionNotes: z.string().max(500).optional() }).refine((value) => value.decision === "APPROVED" || Boolean(value.rejectionCode), "Rejection code is required").parse(req.body);
  const existing = await prisma.kycCase.findUnique({ where: { id: req.params.id }, include: { driver: true } });
  if (!existing || !["SUBMITTED", "UNDER_REVIEW"].includes(existing.status)) return res.status(409).json({ error: { code: "KYC_NOT_REVIEWABLE", message: "KYC case is not reviewable" } });
  const result = await prisma.$transaction(async (tx) => {
    const reviewed = await tx.kycCase.update({ where: { id: existing.id }, data: { status: input.decision, reviewerId: req.user!.sub, reviewedAt: new Date(), rejectionCode: input.rejectionCode ?? null, rejectionNotes: input.rejectionNotes ?? null } });
    await tx.driver.update({ where: { id: existing.driverId }, data: input.decision === "APPROVED" ? { verifiedAt: new Date(), approvedById: req.user!.sub, onboardingStep: "COMPLETE" } : { verifiedAt: null, onboardingStep: "DOCUMENTS" } });
    return reviewed;
  });
  await writeAudit({ actorId: req.user!.sub, action: `KYC_${input.decision}`, entityType: "KycCase", entityId: existing.id, ipAddress: req.ip, ...(input.rejectionCode ? { metadata: { rejectionCode: input.rejectionCode } } : {}) });
  await queueNotification({ userId: existing.driver.userId, channel: "IN_APP", template: "kyc-reviewed", title: `Verification ${input.decision.toLowerCase()}`, body: input.decision === "APPROVED" ? "You can now go online after adding an approved vehicle." : "Review the requested changes and submit again." });
  res.json({ data: result });
}));

api.post("/devices", authenticate, asyncRoute(async (req, res) => {
  const input = z.object({ platform: z.enum(["ios", "android", "web"]), pushToken: z.string().min(20).max(500) }).parse(req.body);
  const device = await prisma.device.upsert({ where: { pushToken: input.pushToken }, update: { userId: req.user!.sub, platform: input.platform, active: true, lastSeenAt: new Date() }, create: { userId: req.user!.sub, ...input } });
  res.json({ data: device });
}));

api.post("/fleet/vehicles", authenticate, authorize("FLEET_MANAGER", "ADMIN"), asyncRoute(async (req, res) => {
  const input = z.object({ fleetId: z.uuid(), make: z.string(), model: z.string(), year: z.number().int().min(1990).max(2030), color: z.string(), plateNumber: z.string().min(3) }).parse(req.body);
  const fleet = await prisma.fleet.findUnique({ where: { id: input.fleetId } });
  if (!fleet || (req.user!.role !== "ADMIN" && fleet.managerId !== req.user!.sub)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Fleet access denied" } });
  const vehicle = await prisma.vehicle.create({ data: input });
  await writeAudit({ actorId: req.user!.sub, action: "VEHICLE_CREATED", entityType: "Vehicle", entityId: vehicle.id, ipAddress: req.ip });
  res.status(201).json({ data: vehicle });
}));

api.get("/fleet/overview", authenticate, authorize("FLEET_MANAGER", "ADMIN"), asyncRoute(async (req, res) => {
  const fleets = await prisma.fleet.findMany({ where: req.user!.role === "ADMIN" ? {} : { managerId: req.user!.sub }, include: { drivers: { include: { user: true, vehicle: true } }, vehicles: true } });
  res.json({ data: fleets });
}));

api.get("/dispatch/rides", authenticate, authorize("DISPATCHER", "ADMIN", "SUPPORT"), asyncRoute(async (_req, res) => {
  const rides = await prisma.ride.findMany({ where: { status: { in: ["SEARCHING", "DRIVER_ASSIGNED", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "IN_PROGRESS"] } }, include: { passenger: { select: { id: true, firstName: true, lastName: true, phone: true } }, driver: { include: { user: { select: { firstName: true, lastName: true, phone: true } }, vehicle: true } } }, orderBy: { requestedAt: "asc" }, take: 200 });
  res.json({ data: rides });
}));

api.post("/dispatch/rides/:id/assign", authenticate, authorize("DISPATCHER", "ADMIN"), asyncRoute(async (req, res) => {
  const driverId = z.object({ driverId: z.uuid() }).parse(req.body).driverId;
  const assigned = await prisma.$transaction(async (tx) => {
    const driver = await tx.driver.updateMany({ where: { id: driverId, status: "AVAILABLE", verifiedAt: { not: null } }, data: { status: "ON_TRIP" } });
    if (!driver.count) throw new Error("Driver is unavailable or unverified");
    const ride = await tx.ride.update({ where: { id: req.params.id, status: "SEARCHING" }, data: { driverId, status: "DRIVER_ASSIGNED", events: { create: { type: "DRIVER_ASSIGNED_MANUALLY", actorId: req.user!.sub, metadata: { driverId } } } } });
    return ride;
  });
  await writeAudit({ actorId: req.user!.sub, action: "RIDE_ASSIGNED", entityType: "Ride", entityId: assigned.id, ipAddress: req.ip, metadata: { driverId } });
  res.json({ data: assigned });
}));

api.get("/reports/operations", authenticate, authorize("ADMIN", "DISPATCHER", "FLEET_MANAGER"), asyncRoute(async (req, res) => {
  const input = z.object({ from: z.coerce.date(), to: z.coerce.date() }).refine((value) => value.to > value.from && value.to.getTime() - value.from.getTime() <= 366 * 86_400_000, "Report range must be 366 days or less").parse(req.query);
  const fleet = req.user!.role === "FLEET_MANAGER" ? await prisma.fleet.findUnique({ where: { managerId: req.user!.sub } }) : null;
  const rides = await prisma.ride.findMany({ where: { requestedAt: { gte: input.from, lte: input.to }, ...(fleet ? { driver: { fleetId: fleet.id } } : {}) }, select: { status: true, fareMinor: true, driverEarningsMinor: true, companyCommissionMinor: true, requestedAt: true, completedAt: true } });
  const completed = rides.filter((ride) => ride.status === "COMPLETED");
  res.json({ data: { period: input, rides: rides.length, completedRides: completed.length, completionRate: rides.length ? completed.length / rides.length : 0, grossBookingsMinor: completed.reduce((sum, ride) => sum + ride.fareMinor, 0), driverEarningsMinor: completed.reduce((sum, ride) => sum + ride.driverEarningsMinor, 0), platformCommissionMinor: completed.reduce((sum, ride) => sum + ride.companyCommissionMinor, 0), currency: "LRD" } });
}));

api.post("/admin/promos", authenticate, authorize("ADMIN"), asyncRoute(async (req, res) => {
  const input = z.object({ code: z.string().min(3).max(30).transform((v) => v.toUpperCase()), description: z.string(), percentageOff: z.number().int().min(1).max(100).optional(), amountOffMinor: z.number().int().positive().optional(), maxDiscountMinor: z.number().int().positive().optional(), minimumFareMinor: z.number().int().min(0).default(0), startsAt: z.coerce.date(), expiresAt: z.coerce.date(), maxUses: z.number().int().positive().optional() }).refine((v) => Boolean(v.percentageOff) !== Boolean(v.amountOffMinor), "Choose percentage or fixed discount").parse(req.body);
  const { percentageOff, amountOffMinor, maxDiscountMinor, maxUses, ...promoInput } = input;
  const promo = await prisma.promoCode.create({ data: { ...promoInput, ...(percentageOff != null ? { percentageOff } : {}), ...(amountOffMinor != null ? { amountOffMinor } : {}), ...(maxDiscountMinor != null ? { maxDiscountMinor } : {}), ...(maxUses != null ? { maxUses } : {}) } });
  await writeAudit({ actorId: req.user!.sub, action: "PROMO_CREATED", entityType: "PromoCode", entityId: promo.id, ipAddress: req.ip });
  res.status(201).json({ data: promo });
}));

api.get("/drivers/me/earnings", authenticate, authorize("DRIVER"), asyncRoute(async (req, res) => {
  const driver = await prisma.driver.findUnique({ where: { userId: req.user!.sub } });
  if (!driver) return res.status(404).json({ error: { code: "DRIVER_NOT_FOUND", message: "Driver profile not found" } });
  const totals = await prisma.ride.aggregate({
    where: { driverId: driver.id, status: "COMPLETED" },
    _sum: { driverEarningsMinor: true, companyCommissionMinor: true, fareMinor: true },
    _count: true
  });
  res.json({ data: { currency: "LRD", completedRides: totals._count, ...totals._sum } });
}));

api.post("/drivers/me/availability", authenticate, authorize("DRIVER"), asyncRoute(async (req, res) => {
  const status = z.object({ status: z.enum(["AVAILABLE", "OFFLINE"]) }).parse(req.body).status;
  const driver = await prisma.driver.findUnique({ where: { userId: req.user!.sub }, include: { vehicle: true, kycCase: true } });
  if (!driver) return res.status(404).json({ error: { code: "DRIVER_NOT_FOUND", message: "Driver profile not found" } });
  if (status === "AVAILABLE" && (!driver.verifiedAt || driver.kycCase?.status !== "APPROVED" || !driver.vehicle?.active)) return res.status(422).json({ error: { code: "DRIVER_NOT_READY", message: "Approved verification and an active vehicle are required" } });
  if (driver.status === "ON_TRIP") return res.status(409).json({ error: { code: "ACTIVE_TRIP", message: "Availability cannot change during a trip" } });
  const updated = await prisma.driver.update({ where: { id: driver.id }, data: { status } });
  res.json({ data: updated });
}));

api.post("/payments/webhooks/:provider", asyncRoute(async (req, res) => {
  if (!verifyWebhookSignature(req.rawBody ?? "", req.header("x-libswiftride-signature") ?? "", config.PAYMENT_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: { code: "INVALID_SIGNATURE", message: "Webhook signature invalid" } });
  }
  const event = z.object({ providerRef: z.string(), status: z.enum(["CAPTURED", "FAILED", "REFUNDED"]) }).parse(req.body);
  const payment = await prisma.payment.findUnique({ where: { providerRef: event.providerRef } });
  if (!payment) return res.status(204).send();
  const transitions = { PENDING: ["CAPTURED", "FAILED"], AUTHORIZED: ["CAPTURED", "FAILED"], CAPTURED: ["REFUNDED"], FAILED: [], REFUNDED: [] } as const;
  if (!(transitions[payment.status] as readonly string[]).includes(event.status)) return res.status(204).send();
  await prisma.payment.update({ where: { id: payment.id }, data: { status: event.status } });
  res.status(204).send();
}));

api.get("/admin/overview", authenticate, authorize("ADMIN"), asyncRoute(async (_req, res) => {
  const [activeRides, availableDrivers, captured] = await Promise.all([
    prisma.ride.count({ where: { status: { in: ["SEARCHING", "DRIVER_ASSIGNED", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "IN_PROGRESS"] } } }),
    prisma.driver.count({ where: { status: "AVAILABLE" } }),
    prisma.payment.aggregate({ where: { status: "CAPTURED" }, _sum: { amountMinor: true } })
  ]);
  const [users, completedRides, ratings] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], _count: true }),
    prisma.ride.count({ where: { status: "COMPLETED" } }),
    prisma.rating.aggregate({ _avg: { score: true } })
  ]);
  res.json({ data: { activeRides, availableDrivers, completedRides, users, averageRating: ratings._avg.score, grossBookingsMinor: captured._sum.amountMinor ?? 0, currency: "LRD" } });
}));

api.get("/admin/settings/payments", authenticate, authorize("ADMIN"), asyncRoute(async (_req, res) => {
  res.setHeader("cache-control", "private, no-store");
  res.json({ data: adminPaymentConfiguration() });
}));
