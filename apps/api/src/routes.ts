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
import { paymentProvider, verifyWebhookSignature } from "./services/payments.js";
import { assertTransition, type RideState } from "./services/ride-state.js";

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
  await prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
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

api.post("/rides/quote", authenticate, asyncRoute(async (req, res) => {
  const input = quoteInput.extend({ promoCode: z.string().optional() }).parse(req.body);
  const promo = input.promoCode ? await prisma.promoCode.findFirst({ where: { code: input.promoCode.toUpperCase(), active: true, startsAt: { lte: new Date() }, expiresAt: { gte: new Date() } } }) : null;
  res.json({ data: calculateFare({ distanceM: 5_000, durationSec: 1_200, ...(promo ? { promo } : {}) }) });
}));

api.post("/rides", authenticate, authorize("PASSENGER"), asyncRoute(async (req, res) => {
  const input = quoteInput.extend({ paymentMethod: z.enum(["CASH", "ORANGE_MONEY", "MTN_MOMO", "STRIPE", "WALLET"]).default("CASH"), promoCode: z.string().optional() }).parse(req.body);
  const idempotencyKey = z.string().min(8).parse(req.header("idempotency-key"));
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
  void matchDriver(ride.id);
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

api.post("/rides/:id/complete", authenticate, authorize("DRIVER", "ADMIN"), asyncRoute(async (req, res) => {
  const ride = await prisma.ride.update({
    where: { id: req.params.id, status: "IN_PROGRESS" },
    data: { status: "COMPLETED", completedAt: new Date(), events: { create: { type: "RIDE_COMPLETED", actorId: req.user!.sub } } }
  });
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
  const existing = await prisma.payment.findUnique({ where: { idempotencyKey } });
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
  const driver = await prisma.driver.upsert({ where: { userId: req.user!.sub }, update: { ...input, onboardingStep: "VEHICLE" }, create: { userId: req.user!.sub, ...input, onboardingStep: "VEHICLE" } });
  res.json({ data: driver });
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

api.post("/payments/webhooks/:provider", asyncRoute(async (req, res) => {
  if (!verifyWebhookSignature(req.rawBody ?? "", req.header("x-libswiftride-signature") ?? "", config.PAYMENT_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: { code: "INVALID_SIGNATURE", message: "Webhook signature invalid" } });
  }
  const event = z.object({ providerRef: z.string(), status: z.enum(["CAPTURED", "FAILED", "REFUNDED"]) }).parse(req.body);
  await prisma.payment.update({ where: { providerRef: event.providerRef }, data: { status: event.status } });
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
