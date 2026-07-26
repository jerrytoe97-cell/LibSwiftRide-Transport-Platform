import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize, hashPassword, issueTokens, revokeRefreshToken, rotateRefreshToken, verifyPassword } from "./auth.js";
import { config } from "./config.js";
import { prisma, redis } from "./lib.js";
import { writeAudit } from "./services/audit.js";
import { matchDriver } from "./services/dispatch.js";
import { calculateFare, calculatePromoDiscount, demandMultiplierFor } from "./services/fare.js";
import { markNotificationRead, queueNotification } from "./services/notifications.js";
import { adminPaymentConfiguration, mobileMoneyDisplayNumber } from "./services/payment-settings.js";
import { paymentProvider, verifyWebhookSignature } from "./services/payments.js";
import { assertTransition, type RideState } from "./services/ride-state.js";
import { validateAvailabilityWindow, validateRideSchedule } from "./services/scheduling.js";
import { logger } from "./logger.js";
import { distanceMetres, estimateEtaSeconds } from "./services/tracking.js";

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

api.get("/auth/sessions", authenticate, asyncRoute(async (req, res) => {
  const sessions = await prisma.refreshToken.findMany({ where: { userId: req.user!.sub, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, createdAt: true, expiresAt: true }, orderBy: { createdAt: "desc" } });
  res.json({ data: sessions });
}));

api.delete("/auth/sessions/:id", authenticate, asyncRoute(async (req, res) => {
  const revoked = await prisma.refreshToken.updateMany({ where: { id: req.params.id, userId: req.user!.sub, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!revoked.count) return res.status(404).json({ error: { code: "SESSION_NOT_FOUND", message: "Session not found" } });
  await writeAudit({ actorId: req.user!.sub, action: "SESSION_REVOKED", entityType: "RefreshToken", entityId: req.params.id, ipAddress: req.ip });
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
async function currentDemandMultiplier() {
  const [searchingRides, availableDrivers] = await Promise.all([
    prisma.ride.count({ where: { status: "SEARCHING" } }),
    prisma.driver.count({ where: { status: "AVAILABLE", verifiedAt: { not: null } } })
  ]);
  return demandMultiplierFor(searchingRides, availableDrivers);
}

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
  res.json({ data: calculateFare({ distanceM: 5_000, durationSec: 1_200, demandMultiplier: await currentDemandMultiplier(), ...(promo ? { promo } : {}) }) });
}));

api.post("/rides", authenticate, authorize("PASSENGER"), asyncRoute(async (req, res) => {
  const input = quoteInput.extend({
    paymentMethod: z.enum(["CASH", "ORANGE_MONEY", "MTN_MOMO", "STRIPE", "WALLET"]).default("CASH"),
    promoCode: z.string().optional(),
    scheduledFor: z.coerce.date().optional()
  }).parse(req.body);
  if (input.scheduledFor && !validateRideSchedule(input.scheduledFor)) {
    return res.status(422).json({ error: { code: "INVALID_SCHEDULE", message: "Scheduled rides must be 15 minutes to 30 days in advance" } });
  }
  const idempotencyKey = z.string().min(8).parse(req.header("idempotency-key"));
  const replay = await prisma.ride.findUnique({ where: { passengerId_idempotencyKey: { passengerId: req.user!.sub, idempotencyKey } } });
  if (replay) return res.json({ data: replay });
  const promoCandidate = input.promoCode ? await prisma.promoCode.findFirst({ where: { code: input.promoCode.toUpperCase(), active: true, startsAt: { lte: new Date() }, expiresAt: { gte: new Date() } } }) : null;
  const promo = promoCandidate && (promoCandidate.maxUses == null || promoCandidate.uses < promoCandidate.maxUses) ? promoCandidate : null;
  const { subtotalMinor: _subtotalMinor, ...pricing } = calculateFare({ distanceM: 5_000, durationSec: 1_200, demandMultiplier: await currentDemandMultiplier(), ...(promo ? { promo } : {}) });
  const ride = await prisma.ride.upsert({
    where: { passengerId_idempotencyKey: { passengerId: req.user!.sub, idempotencyKey } },
    update: {},
    create: {
      passengerId: req.user!.sub, idempotencyKey, status: input.scheduledFor ? "REQUESTED" : "SEARCHING",
      pickupAddress: input.pickup.address, pickupLatitude: input.pickup.latitude, pickupLongitude: input.pickup.longitude,
      destinationAddress: input.destination.address, destinationLatitude: input.destination.latitude,
      destinationLongitude: input.destination.longitude, paymentMethod: input.paymentMethod, ...(promo ? { promoCodeId: promo.id } : {}), ...pricing,
      ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
      events: { create: { type: input.scheduledFor ? "RIDE_SCHEDULED" : "RIDE_REQUESTED", actorId: req.user!.sub } }
    }
  });
  if (promo) await prisma.promoCode.update({ where: { id: promo.id }, data: { uses: { increment: 1 } } });
  if (!input.scheduledFor) void matchDriver(ride.id).catch((error) => logger.error({ err: error, rideId: ride.id }, "automatic matching failed"));
  res.status(201).json({ data: ride });
}));

api.get("/rides", authenticate, asyncRoute(async (req, res) => {
  const limit = z.coerce.number().int().min(1).max(100).default(25).parse(req.query.limit);
  const cursor = z.string().uuid().optional().parse(req.query.cursor);
  const status = z.enum(["REQUESTED", "SEARCHING", "DRIVER_ASSIGNED", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "PASSENGER_BOARDED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional().parse(req.query.status);
  const driver = req.user!.role === "DRIVER" ? await prisma.driver.findUnique({ where: { userId: req.user!.sub } }) : null;
  if (req.user!.role !== "PASSENGER" && !driver && !["ADMIN", "SUPPORT"].includes(req.user!.role)) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "Ride history is unavailable for this role" } });
  }
  const participantWhere = req.user!.role === "PASSENGER" ? { passengerId: req.user!.sub } : driver ? { driverId: driver.id } : {};
  const rides = await prisma.ride.findMany({
    where: { ...participantWhere, ...(status ? { status } : {}) },
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { driver: { include: { user: { select: { id: true, firstName: true, lastName: true } }, vehicle: true } }, payment: true, ratings: true }
  });
  const hasMore = rides.length > limit;
  const page = hasMore ? rides.slice(0, limit) : rides;
  res.json({ data: page, meta: { hasMore, nextCursor: hasMore ? page.at(-1)?.id ?? null : null } });
}));

api.post("/promos/validate", authenticate, authorize("PASSENGER"), asyncRoute(async (req, res) => {
  const input = z.object({ code: z.string().trim().min(3).max(30), fareMinor: z.number().int().positive() }).parse(req.body);
  const promo = await prisma.promoCode.findFirst({
    where: { code: input.code.toUpperCase(), active: true, startsAt: { lte: new Date() }, expiresAt: { gte: new Date() } }
  });
  if (!promo || (promo.maxUses != null && promo.uses >= promo.maxUses) || input.fareMinor < promo.minimumFareMinor) {
    return res.status(404).json({ error: { code: "PROMO_NOT_AVAILABLE", message: "This promotion is invalid or unavailable" } });
  }
  const discountMinor = calculatePromoDiscount(input.fareMinor, promo);
  res.json({ data: { code: promo.code, description: promo.description, eligible: true, discountMinor } });
}));

api.get("/rides/:id", authenticate, asyncRoute(async (req, res) => {
  const ride = await prisma.ride.findUnique({ where: { id: req.params.id }, include: { driver: { include: { user: true, vehicle: true } }, payment: true } });
  if (!ride) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ride not found" } });
  const ownsRide = ride.passengerId === req.user!.sub || ride.driver?.userId === req.user!.sub;
  if (!ownsRide && !["ADMIN", "SUPPORT"].includes(req.user!.role)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Ride access denied" } });
  res.json({ data: ride });
}));

api.get("/rides/:id/receipt", authenticate, asyncRoute(async (req, res) => {
  const ride = await prisma.ride.findUnique({ where: { id: req.params.id }, include: { driver: { include: { user: { select: { firstName: true, lastName: true } }, vehicle: { select: { make: true, model: true, plateNumber: true } } } }, payment: true, refunds: { where: { status: "COMPLETED" }, select: { amountMinor: true } }, promoCode: { select: { code: true } } } });
  if (!ride || ride.status !== "COMPLETED") return res.status(404).json({ error: { code: "RECEIPT_NOT_FOUND", message: "Completed ride receipt not found" } });
  const participant = ride.passengerId === req.user!.sub || ride.driver?.userId === req.user!.sub;
  if (!participant && !["ADMIN", "SUPPORT"].includes(req.user!.role)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Receipt access denied" } });
  res.json({ data: {
    receiptNumber: `LSR-${ride.id.slice(0, 8).toUpperCase()}`, rideId: ride.id, completedAt: ride.completedAt,
    route: { pickup: ride.pickupAddress, destination: ride.destinationAddress },
    fare: { subtotalMinor: ride.fareMinor + ride.discountMinor, baseFareMinor: ride.baseFareMinor, dynamicMultiplierBps: ride.dynamicMultiplierBps, waitingTimeSec: ride.waitingTimeSec, waitingFeeMinor: ride.waitingFeeMinor, tollMinor: ride.tollMinor, discountMinor: ride.discountMinor, totalMinor: ride.fareMinor, refundedMinor: ride.refunds.reduce((sum, refund) => sum + refund.amountMinor, 0), driverEarningsMinor: ride.driverEarningsMinor, companyCommissionMinor: ride.companyCommissionMinor, currency: ride.currency },
    payment: ride.payment ? { method: ride.payment.method, status: ride.payment.status } : { method: ride.paymentMethod, status: ride.paymentMethod === "CASH" ? "AUTHORIZED" : "PENDING" },
    promoCode: ride.promoCode?.code ?? null, driver: ride.driver ? { name: `${ride.driver.user.firstName} ${ride.driver.user.lastName}`, vehicle: ride.driver.vehicle } : null
  } });
}));

api.post("/rides/:id/transitions", authenticate, authorize("PASSENGER", "DRIVER", "ADMIN", "SUPPORT"), asyncRoute(async (req, res) => {
  const input = z.object({
    status: z.enum(["SEARCHING", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "PASSENGER_BOARDED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
    cancellationReason: z.string().trim().min(3).max(240).optional(),
    waitingTimeSec: z.number().int().min(0).max(86_400).optional(),
    tollMinor: z.number().int().min(0).max(10_000_000).optional()
  }).refine((value) => value.status !== "CANCELLED" || Boolean(value.cancellationReason), "Cancellation reason is required").parse(req.body);
  const { status } = input;
  const ride = await prisma.ride.findUnique({ where: { id: req.params.id }, include: { driver: true, payment: true, promoCode: true } });
  if (!ride) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ride not found" } });
  const participant = ride.passengerId === req.user!.sub || ride.driver?.userId === req.user!.sub;
  if (!participant && !["ADMIN", "SUPPORT"].includes(req.user!.role)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Ride access denied" } });
  assertTransition(ride.status as RideState, status);
  const driverAction = ["DRIVER_ARRIVING", "DRIVER_ARRIVED", "IN_PROGRESS", "COMPLETED"].includes(status);
  if (driverAction && ride.driver?.userId !== req.user!.sub && req.user!.role !== "ADMIN") return res.status(403).json({ error: { code: "DRIVER_REQUIRED", message: "Only the assigned driver can perform this transition" } });
  if (status === "PASSENGER_BOARDED" && ride.passengerId !== req.user!.sub && req.user!.role !== "ADMIN") return res.status(403).json({ error: { code: "PASSENGER_REQUIRED", message: "Only the passenger can confirm boarding" } });
  if (status === "COMPLETED" && ride.paymentMethod !== "CASH" && ride.payment?.status !== "CAPTURED") return res.status(409).json({ error: { code: "PAYMENT_NOT_CONFIRMED", message: "Electronic payment must be confirmed before completion" } });
  const finalPricing = status === "COMPLETED" ? calculateFare({
    distanceM: ride.estimatedDistanceM, durationSec: ride.estimatedDurationSec,
    demandMultiplier: ride.dynamicMultiplierBps / 10_000,
    waitingTimeSec: input.waitingTimeSec ?? ride.waitingTimeSec, tollMinor: input.tollMinor ?? ride.tollMinor,
    ...(ride.promoCode ? { promo: ride.promoCode } : {})
  }) : null;
  if (status === "COMPLETED" && ride.paymentMethod !== "CASH" && ride.payment?.amountMinor !== finalPricing!.fareMinor) {
    return res.status(409).json({ error: { code: "PAYMENT_AMOUNT_MISMATCH", message: "Confirm the adjusted fare before completing the ride" } });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const result = await tx.ride.update({ where: { id: ride.id, status: ride.status }, data: {
      status,
      ...(status === "DRIVER_ARRIVING" ? { acceptedAt: now } : {}),
      ...(status === "DRIVER_ARRIVED" ? { arrivedAt: now } : {}),
      ...(status === "PASSENGER_BOARDED" ? { boardedAt: now } : {}),
      ...(status === "IN_PROGRESS" ? { startedAt: now } : {}),
      ...(status === "COMPLETED" ? { completedAt: now, ...finalPricing } : {}),
      ...(status === "CANCELLED" ? { cancelledAt: now, cancellationReason: input.cancellationReason! } : {})
    } });
    await tx.rideEvent.create({ data: { rideId: ride.id, type: `RIDE_${status}`, actorId: req.user!.sub, ...(status === "CANCELLED" ? { metadata: { reason: input.cancellationReason } } : {}) } });
    if (ride.driverId && ["COMPLETED", "CANCELLED"].includes(status)) await tx.driver.update({ where: { id: ride.driverId }, data: { status: "AVAILABLE" } });
    if (status === "COMPLETED" && ride.driver) {
      const earningsMinor = finalPricing!.driverEarningsMinor;
      if (ride.paymentMethod === "CASH") {
        await tx.payment.upsert({ where: { rideId: ride.id }, update: { amountMinor: finalPricing!.fareMinor, status: "CAPTURED", capturedAt: now }, create: { rideId: ride.id, provider: "CASH", providerRef: `cash:${ride.id}`, idempotencyKey: `cash:${ride.id}`, amountMinor: finalPricing!.fareMinor, currency: ride.currency, method: "CASH", status: "CAPTURED", capturedAt: now } });
      }
      const wallet = await tx.wallet.upsert({ where: { userId: ride.driver.userId }, update: {}, create: { userId: ride.driver.userId } });
      await tx.wallet.update({ where: { id: wallet.id }, data: { balanceMinor: { increment: earningsMinor }, transactions: { create: { type: "CREDIT", amountMinor: earningsMinor, balanceMinor: wallet.balanceMinor + earningsMinor, reference: `ride:${ride.id}`, idempotencyKey: `ride-earnings:${ride.id}`, description: "Driver ride earnings" } } } });
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
  const rating = await prisma.rating.create({ data: { rideId: ride.id, authorId: req.user!.sub, subjectId, ...ratingInput, ...(comment ? { comment, status: "PENDING" } : {}) } });
  res.status(201).json({ data: rating });
}));

api.get("/wallet", authenticate, asyncRoute(async (req, res) => {
  const wallet = await prisma.wallet.upsert({ where: { userId: req.user!.sub }, update: {}, create: { userId: req.user!.sub }, include: { transactions: { orderBy: { createdAt: "desc" }, take: 50 } } });
  res.json({ data: wallet });
}));

api.get("/rides/:id/tracking", authenticate, asyncRoute(async (req, res) => {
  const ride = await prisma.ride.findUnique({ where: { id: req.params.id }, include: { driver: true } });
  if (!ride) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ride not found" } });
  const participant = ride.passengerId === req.user!.sub || ride.driver?.userId === req.user!.sub;
  if (!participant && !["ADMIN", "SUPPORT", "DISPATCHER"].includes(req.user!.role)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Tracking access denied" } });
  const raw = ride.driverId ? await redis.get(`driver:location:${ride.driverId}`) : null;
  const current = raw ? JSON.parse(raw) as { latitude: number; longitude: number; at: string } : null;
  const destination = ["IN_PROGRESS", "PASSENGER_BOARDED"].includes(ride.status)
    ? { latitude: Number(ride.destinationLatitude), longitude: Number(ride.destinationLongitude) }
    : { latitude: Number(ride.pickupLatitude), longitude: Number(ride.pickupLongitude) };
  const remainingDistanceM = current ? distanceMetres(current, destination) : null;
  res.json({ data: { rideId: ride.id, status: ride.status, current, remainingDistanceM, etaSeconds: remainingDistanceM == null ? null : estimateEtaSeconds(remainingDistanceM) } });
}));

api.get("/rides/:id/route-replay", authenticate, asyncRoute(async (req, res) => {
  const ride = await prisma.ride.findUnique({ where: { id: req.params.id }, include: { driver: true } });
  if (!ride) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ride not found" } });
  const participant = ride.passengerId === req.user!.sub || ride.driver?.userId === req.user!.sub;
  if (!participant && !["ADMIN", "SUPPORT", "DISPATCHER"].includes(req.user!.role)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Route replay access denied" } });
  const points = await prisma.routePoint.findMany({ where: { rideId: ride.id }, select: { latitude: true, longitude: true, heading: true, speedMps: true, recordedAt: true }, orderBy: { recordedAt: "asc" }, take: 10_000 });
  res.json({ data: { rideId: ride.id, points } });
}));

api.get("/safety/emergency-contacts", authenticate, asyncRoute(async (req, res) => {
  res.json({ data: await prisma.emergencyContact.findMany({ where: { userId: req.user!.sub }, orderBy: { createdAt: "asc" } }) });
}));

api.post("/safety/emergency-contacts", authenticate, asyncRoute(async (req, res) => {
  const input = z.object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().min(8).max(20), relationship: z.string().trim().min(2).max(40) }).parse(req.body);
  const count = await prisma.emergencyContact.count({ where: { userId: req.user!.sub } });
  if (count >= 5) return res.status(409).json({ error: { code: "CONTACT_LIMIT", message: "Up to five emergency contacts are supported" } });
  res.status(201).json({ data: await prisma.emergencyContact.create({ data: { userId: req.user!.sub, ...input } }) });
}));

api.delete("/safety/emergency-contacts/:id", authenticate, asyncRoute(async (req, res) => {
  const removed = await prisma.emergencyContact.deleteMany({ where: { id: req.params.id, userId: req.user!.sub } });
  if (!removed.count) return res.status(404).json({ error: { code: "CONTACT_NOT_FOUND", message: "Emergency contact not found" } });
  res.status(204).send();
}));

api.post("/rides/:id/sos", authenticate, asyncRoute(async (req, res) => {
  const input = z.object({ category: z.enum(["MEDICAL", "SECURITY", "CRASH", "HARASSMENT", "OTHER"]), note: z.string().trim().max(500).optional(), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional() }).parse(req.body);
  const ride = await prisma.ride.findUnique({ where: { id: req.params.id }, include: { driver: true } });
  if (!ride || (ride.passengerId !== req.user!.sub && ride.driver?.userId !== req.user!.sub)) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Active ride not found" } });
  if (["COMPLETED", "CANCELLED"].includes(ride.status)) return res.status(409).json({ error: { code: "RIDE_ENDED", message: "SOS is only available for an active ride" } });
  const incident = await prisma.$transaction(async (tx) => {
    const created = await tx.safetyIncident.create({ data: {
      rideId: ride.id, reporterId: req.user!.sub, category: input.category,
      ...(input.note ? { note: input.note } : {}),
      ...(input.latitude != null ? { latitude: input.latitude } : {}),
      ...(input.longitude != null ? { longitude: input.longitude } : {})
    } });
    await tx.rideEvent.create({ data: { rideId: ride.id, type: "SOS_ACTIVATED", actorId: req.user!.sub, metadata: { incidentId: created.id, category: input.category } } });
    return created;
  });
  await writeAudit({ actorId: req.user!.sub, action: "SOS_ACTIVATED", entityType: "SafetyIncident", entityId: incident.id, ipAddress: req.ip, metadata: { rideId: ride.id, category: input.category } });
  const responders = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "SUPPORT", "DISPATCHER"] }, status: "ACTIVE" }, select: { id: true } });
  await Promise.all(responders.map((user) => queueNotification({ userId: user.id, channel: "IN_APP", template: "sos", title: "Urgent ride safety alert", body: `SOS requires immediate response for ride ${ride.id.slice(0, 8)}.`, data: { rideId: ride.id, incidentId: incident.id } })));
  res.status(201).json({ data: { id: incident.id, status: incident.status, createdAt: incident.createdAt } });
}));

api.patch("/safety/incidents/:id", authenticate, authorize("ADMIN", "SUPPORT", "DISPATCHER"), asyncRoute(async (req, res) => {
  const status = z.object({ status: z.enum(["ACKNOWLEDGED", "RESOLVED"]) }).parse(req.body).status;
  const now = new Date();
  const incident = await prisma.safetyIncident.update({ where: { id: req.params.id }, data: status === "ACKNOWLEDGED" ? { status, acknowledgedBy: req.user!.sub, acknowledgedAt: now } : { status, resolvedBy: req.user!.sub, resolvedAt: now } });
  await writeAudit({ actorId: req.user!.sub, action: `SOS_${status}`, entityType: "SafetyIncident", entityId: incident.id, ipAddress: req.ip });
  res.json({ data: incident });
}));

api.get("/safety/incidents", authenticate, authorize("ADMIN", "SUPPORT", "DISPATCHER"), asyncRoute(async (req, res) => {
  const status = z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).optional().parse(req.query.status);
  res.json({ data: await prisma.safetyIncident.findMany({ where: status ? { status } : {}, include: { ride: { select: { id: true, status: true, pickupAddress: true, destinationAddress: true } } }, orderBy: { createdAt: "desc" }, take: 100 }) });
}));

api.post("/rides/:id/share", authenticate, asyncRoute(async (req, res) => {
  const ride = await prisma.ride.findUnique({ where: { id: req.params.id }, include: { driver: true } });
  if (!ride || (ride.passengerId !== req.user!.sub && ride.driver?.userId !== req.user!.sub)) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ride not found" } });
  if (["COMPLETED", "CANCELLED"].includes(ride.status)) return res.status(409).json({ error: { code: "RIDE_ENDED", message: "Only active trips can be shared" } });
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Math.min(Date.now() + 24 * 3_600_000, (ride.scheduledFor ?? ride.requestedAt).getTime() + 48 * 3_600_000));
  const share = await prisma.tripShare.create({ data: { rideId: ride.id, ownerId: req.user!.sub, tokenHash: tokenDigest(token), expiresAt } });
  res.status(201).json({ data: { id: share.id, token, expiresAt } });
}));

api.delete("/rides/:rideId/shares/:id", authenticate, asyncRoute(async (req, res) => {
  const revoked = await prisma.tripShare.updateMany({ where: { id: req.params.id, rideId: req.params.rideId, ownerId: req.user!.sub, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!revoked.count) return res.status(404).json({ error: { code: "SHARE_NOT_FOUND", message: "Active trip share not found" } });
  res.status(204).send();
}));

api.get("/trip-shares/:token", asyncRoute(async (req, res) => {
  const share = await prisma.tripShare.findUnique({ where: { tokenHash: tokenDigest(req.params.token) }, include: { ride: { include: { driver: { include: { user: { select: { firstName: true } }, vehicle: { select: { make: true, model: true, plateNumber: true } } } } } } } });
  if (!share || share.revokedAt || share.expiresAt <= new Date()) return res.status(404).json({ error: { code: "SHARE_EXPIRED", message: "Trip share is unavailable" } });
  const raw = share.ride.driverId ? await redis.get(`driver:location:${share.ride.driverId}`) : null;
  res.setHeader("cache-control", "private, no-store");
  res.json({ data: { status: share.ride.status, pickupAddress: share.ride.pickupAddress, destinationAddress: share.ride.destinationAddress, driver: share.ride.driver ? { firstName: share.ride.driver.user.firstName, vehicle: share.ride.driver.vehicle } : null, location: raw ? JSON.parse(raw) : null, expiresAt: share.expiresAt } });
}));

api.get("/favourite-places", authenticate, authorize("PASSENGER"), asyncRoute(async (req, res) => {
  res.json({ data: await prisma.favouritePlace.findMany({ where: { userId: req.user!.sub }, orderBy: [{ type: "asc" }, { label: "asc" }] }) });
}));

api.post("/favourite-places", authenticate, authorize("PASSENGER"), asyncRoute(async (req, res) => {
  const input = z.object({ type: z.enum(["HOME", "WORK", "CUSTOM"]), label: z.string().trim().min(1).max(40), address: z.string().trim().min(3).max(240), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).parse(req.body);
  const place = await prisma.favouritePlace.upsert({ where: { userId_label: { userId: req.user!.sub, label: input.label } }, update: input, create: { userId: req.user!.sub, ...input } });
  res.status(201).json({ data: place });
}));

api.delete("/favourite-places/:id", authenticate, authorize("PASSENGER"), asyncRoute(async (req, res) => {
  const removed = await prisma.favouritePlace.deleteMany({ where: { id: req.params.id, userId: req.user!.sub } });
  if (!removed.count) return res.status(404).json({ error: { code: "PLACE_NOT_FOUND", message: "Favourite place not found" } });
  res.status(204).send();
}));

api.post("/rides/:id/payments", authenticate, asyncRoute(async (req, res) => {
  const input = z.object({ method: z.enum(["CASH", "ORANGE_MONEY", "MTN_MOMO", "STRIPE", "WALLET"]), phone: z.string().optional(), returnUrl: z.url().optional() }).parse(req.body);
  const ride = await prisma.ride.findUnique({ where: { id: req.params.id } });
  if (!ride || ride.passengerId !== req.user!.sub) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ride not found" } });
  const idempotencyKey = z.string().min(8).parse(req.header("idempotency-key"));
  const existing = await prisma.payment.findFirst({ where: { OR: [{ idempotencyKey }, { rideId: ride.id }] } });
  if (existing) return res.json({ data: existing });
  if (input.method === "WALLET") {
    const payment = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: req.user!.sub } });
      if (!wallet || wallet.balanceMinor < ride.fareMinor) throw new Error("Insufficient wallet balance");
      const updated = await tx.wallet.update({ where: { id: wallet.id }, data: { balanceMinor: { decrement: ride.fareMinor } } });
      await tx.walletTransaction.create({ data: { walletId: wallet.id, type: "DEBIT", amountMinor: ride.fareMinor, balanceMinor: updated.balanceMinor, reference: `ride-payment:${ride.id}`, idempotencyKey, description: "Ride payment" } });
      return tx.payment.create({ data: { rideId: ride.id, provider: "WALLET", providerRef: `wallet:${ride.id}`, idempotencyKey, amountMinor: ride.fareMinor, currency: ride.currency, method: "WALLET", status: "CAPTURED", capturedAt: new Date() } });
    });
    return res.status(201).json({ data: payment });
  }
  const provider = paymentProvider(input.method);
  const result = await provider.createPayment({ amountMinor: ride.fareMinor, currency: ride.currency, idempotencyKey, ...(input.phone ? { phone: input.phone } : {}), ...(input.returnUrl ? { returnUrl: input.returnUrl } : {}) });
  const payment = await prisma.payment.create({ data: { rideId: ride.id, provider: input.method, providerRef: result.providerRef, idempotencyKey, amountMinor: ride.fareMinor, currency: ride.currency, method: input.method, status: result.status, ...(result.checkoutUrl ? { providerPayload: { checkoutUrl: result.checkoutUrl } } : {}) } });
  res.status(201).json({ data: payment, checkoutUrl: result.checkoutUrl });
}));

api.post("/payments/:id/confirm-cash", authenticate, authorize("DRIVER", "ADMIN"), asyncRoute(async (req, res) => {
  const payment = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { ride: { include: { driver: true } } } });
  if (!payment || payment.method !== "CASH") return res.status(404).json({ error: { code: "CASH_PAYMENT_NOT_FOUND", message: "Cash payment not found" } });
  if (req.user!.role === "DRIVER" && payment.ride.driver?.userId !== req.user!.sub) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Payment confirmation denied" } });
  const confirmed = await prisma.payment.update({ where: { id: payment.id }, data: { status: "CAPTURED", capturedAt: new Date() } });
  await writeAudit({ actorId: req.user!.sub, action: "CASH_PAYMENT_CONFIRMED", entityType: "Payment", entityId: payment.id, ipAddress: req.ip });
  res.json({ data: confirmed });
}));

api.post("/rides/:id/refunds", authenticate, authorize("ADMIN", "SUPPORT"), asyncRoute(async (req, res) => {
  const input = z.object({ amountMinor: z.number().int().positive(), reason: z.string().trim().min(5).max(500) }).parse(req.body);
  const idempotencyKey = z.string().min(8).parse(req.header("idempotency-key"));
  const ride = await prisma.ride.findUnique({ where: { id: req.params.id }, include: { payment: true, refunds: true } });
  if (!ride?.payment || ride.payment.status !== "CAPTURED") return res.status(409).json({ error: { code: "PAYMENT_NOT_REFUNDABLE", message: "A captured payment is required" } });
  const refundedMinor = ride.refunds.filter((refund) => !["REJECTED", "FAILED"].includes(refund.status)).reduce((sum, refund) => sum + refund.amountMinor, 0);
  if (refundedMinor + input.amountMinor > ride.payment.amountMinor) return res.status(422).json({ error: { code: "REFUND_EXCEEDS_PAYMENT", message: "Refund exceeds the captured payment" } });
  const refund = await prisma.refund.upsert({ where: { idempotencyKey }, update: {}, create: { rideId: ride.id, paymentId: ride.payment.id, requestedById: req.user!.sub, idempotencyKey, ...input } });
  await writeAudit({ actorId: req.user!.sub, action: "REFUND_REQUESTED", entityType: "Refund", entityId: refund.id, ipAddress: req.ip, metadata: { rideId: ride.id, amountMinor: refund.amountMinor } });
  res.status(201).json({ data: refund });
}));

api.patch("/admin/refunds/:id", authenticate, authorize("ADMIN"), asyncRoute(async (req, res) => {
  const status = z.object({ status: z.enum(["APPROVED", "REJECTED"]) }).parse(req.body).status;
  const refund = await prisma.refund.update({ where: { id: req.params.id }, data: { status, reviewedById: req.user!.sub } });
  await writeAudit({ actorId: req.user!.sub, action: `REFUND_${status}`, entityType: "Refund", entityId: refund.id, ipAddress: req.ip });
  res.json({ data: refund });
}));

api.get("/drivers/me/payouts", authenticate, authorize("DRIVER"), asyncRoute(async (req, res) => {
  const driver = await prisma.driver.findUnique({ where: { userId: req.user!.sub }, select: { id: true } });
  if (!driver) return res.status(404).json({ error: { code: "DRIVER_NOT_FOUND", message: "Driver profile not found" } });
  res.json({ data: await prisma.driverPayout.findMany({ where: { driverId: driver.id }, orderBy: { createdAt: "desc" }, take: 100 }) });
}));

api.post("/admin/drivers/:id/payouts", authenticate, authorize("ADMIN"), asyncRoute(async (req, res) => {
  const input = z.object({ amountMinor: z.number().int().positive(), periodStart: z.coerce.date(), periodEnd: z.coerce.date() }).refine((value) => value.periodEnd > value.periodStart, "Invalid payout period").parse(req.body);
  const idempotencyKey = z.string().min(8).parse(req.header("idempotency-key"));
  const driver = await prisma.driver.findUnique({ where: { id: req.params.id }, include: { user: { include: { wallet: true } } } });
  if (!driver?.user.wallet || driver.user.wallet.balanceMinor < input.amountMinor) return res.status(422).json({ error: { code: "INSUFFICIENT_DRIVER_BALANCE", message: "Driver wallet balance is insufficient" } });
  const payout = await prisma.$transaction(async (tx) => {
    const existing = await tx.driverPayout.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    const updatedWallet = await tx.wallet.update({ where: { id: driver.user.wallet!.id }, data: { balanceMinor: { decrement: input.amountMinor } } });
    const created = await tx.driverPayout.create({ data: { driverId: driver.id, idempotencyKey, ...input } });
    await tx.walletTransaction.create({ data: { walletId: driver.user.wallet!.id, type: "PAYOUT", amountMinor: input.amountMinor, balanceMinor: updatedWallet.balanceMinor, reference: `payout:${created.id}`, idempotencyKey: `wallet:${idempotencyKey}`, description: "Driver payout pending" } });
    return created;
  });
  await writeAudit({ actorId: req.user!.sub, action: "DRIVER_PAYOUT_CREATED", entityType: "DriverPayout", entityId: payout.id, ipAddress: req.ip, metadata: { driverId: driver.id, amountMinor: payout.amountMinor } });
  res.status(201).json({ data: payout });
}));

api.get("/notifications", authenticate, asyncRoute(async (req, res) => {
  const limit = z.coerce.number().int().min(1).max(100).default(25).parse(req.query.limit);
  const unreadOnly = z.enum(["true", "false"]).default("false").transform((value) => value === "true").parse(req.query.unreadOnly);
  const where = { userId: req.user!.sub, ...(unreadOnly ? { readAt: null } : {}) };
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: limit }),
    prisma.notification.count({ where: { userId: req.user!.sub, readAt: null } })
  ]);
  res.json({ data: notifications, meta: { unread } });
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
  const rides = await prisma.ride.findMany({ where: { status: { in: ["SEARCHING", "DRIVER_ASSIGNED", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "PASSENGER_BOARDED", "IN_PROGRESS"] } }, include: { passenger: { select: { id: true, firstName: true, lastName: true, phone: true } }, driver: { include: { user: { select: { firstName: true, lastName: true, phone: true } }, vehicle: true } } }, orderBy: { requestedAt: "asc" }, take: 200 });
  res.json({ data: rides });
}));

api.get("/dispatch/drivers", authenticate, authorize("DISPATCHER", "ADMIN"), asyncRoute(async (_req, res) => {
  const drivers = await prisma.driver.findMany({
    where: { status: "AVAILABLE", verifiedAt: { not: null }, vehicle: { is: { active: true } } },
    select: { id: true, status: true, user: { select: { firstName: true, lastName: true } }, vehicle: { select: { make: true, model: true, plateNumber: true } } },
    orderBy: { updatedAt: "asc" },
    take: 200
  });
  const withLocations = await Promise.all(drivers.map(async (driver) => {
    const raw = await redis.get(`driver:location:${driver.id}`);
    return { ...driver, location: raw ? JSON.parse(raw) : null };
  }));
  res.json({ data: withLocations });
}));

api.patch("/dispatch/drivers/:id/status", authenticate, authorize("DISPATCHER", "ADMIN"), asyncRoute(async (req, res) => {
  const status = z.object({ status: z.enum(["OFFLINE", "SUSPENDED"]) }).parse(req.body).status;
  const existing = await prisma.driver.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: { code: "DRIVER_NOT_FOUND", message: "Driver not found" } });
  if (existing.status === "ON_TRIP") return res.status(409).json({ error: { code: "ACTIVE_TRIP", message: "An active-trip driver cannot be changed" } });
  const driver = await prisma.driver.update({ where: { id: existing.id }, data: { status } });
  await writeAudit({ actorId: req.user!.sub, action: `DRIVER_${status}`, entityType: "Driver", entityId: driver.id, ipAddress: req.ip });
  res.json({ data: { id: driver.id, status: driver.status } });
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

api.get("/reports/analytics", authenticate, authorize("ADMIN", "DISPATCHER"), asyncRoute(async (req, res) => {
  const input = z.object({ from: z.coerce.date(), to: z.coerce.date() }).refine((value) => value.to > value.from && value.to.getTime() - value.from.getTime() <= 366 * 86_400_000, "Report range must be 366 days or less").parse(req.query);
  const where = { requestedAt: { gte: input.from, lte: input.to } };
  const [rides, passengers, drivers, payments, incidents] = await Promise.all([
    prisma.ride.findMany({ where, select: { status: true, fareMinor: true, discountMinor: true, waitingFeeMinor: true, tollMinor: true, driverEarningsMinor: true, companyCommissionMinor: true, requestedAt: true, acceptedAt: true, completedAt: true, passengerId: true, driverId: true } }),
    prisma.user.count({ where: { role: "PASSENGER", createdAt: { gte: input.from, lte: input.to } } }),
    prisma.driver.count({ where: { createdAt: { gte: input.from, lte: input.to } } }),
    prisma.payment.groupBy({ by: ["status", "method"], where: { createdAt: { gte: input.from, lte: input.to } }, _count: true, _sum: { amountMinor: true } }),
    prisma.safetyIncident.count({ where: { createdAt: { gte: input.from, lte: input.to } } })
  ]);
  const completed = rides.filter((ride) => ride.status === "COMPLETED");
  const accepted = rides.filter((ride) => ride.acceptedAt);
  const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  res.json({ data: {
    period: input,
    rides: { total: rides.length, completed: completed.length, cancelled: rides.filter((ride) => ride.status === "CANCELLED").length, uniquePassengers: new Set(rides.map((ride) => ride.passengerId)).size, activeDrivers: new Set(rides.flatMap((ride) => ride.driverId ? [ride.driverId] : [])).size, averageAcceptanceSec: average(accepted.map((ride) => Math.round((ride.acceptedAt!.getTime() - ride.requestedAt.getTime()) / 1000))), averageTripSec: average(completed.filter((ride) => ride.completedAt).map((ride) => Math.round((ride.completedAt!.getTime() - ride.requestedAt.getTime()) / 1000))) },
    revenue: { grossMinor: completed.reduce((sum, ride) => sum + ride.fareMinor, 0), driverEarningsMinor: completed.reduce((sum, ride) => sum + ride.driverEarningsMinor, 0), platformCommissionMinor: completed.reduce((sum, ride) => sum + ride.companyCommissionMinor, 0), discountsMinor: completed.reduce((sum, ride) => sum + ride.discountMinor, 0), waitingFeesMinor: completed.reduce((sum, ride) => sum + ride.waitingFeeMinor, 0), tollsMinor: completed.reduce((sum, ride) => sum + ride.tollMinor, 0), currency: "LRD" },
    growth: { newPassengers: passengers, newDrivers: drivers }, payments, safetyIncidents: incidents
  } });
}));

api.get("/admin/promos", authenticate, authorize("ADMIN"), asyncRoute(async (req, res) => {
  const active = z.enum(["true", "false"]).optional().transform((value) => value == null ? undefined : value === "true").parse(req.query.active);
  const promotions = await prisma.promoCode.findMany({ where: active == null ? {} : { active }, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ data: promotions });
}));

api.patch("/admin/promos/:id", authenticate, authorize("ADMIN"), asyncRoute(async (req, res) => {
  const input = z.object({ active: z.boolean().optional(), expiresAt: z.coerce.date().optional(), maxUses: z.number().int().positive().nullable().optional() }).refine((value) => Object.keys(value).length > 0, "At least one setting is required").parse(req.body);
  const promo = await prisma.promoCode.update({ where: { id: req.params.id }, data: { ...(input.active != null ? { active: input.active } : {}), ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}), ...(input.maxUses !== undefined ? { maxUses: input.maxUses } : {}) } });
  await writeAudit({ actorId: req.user!.sub, action: "PROMO_UPDATED", entityType: "PromoCode", entityId: promo.id, ipAddress: req.ip, metadata: { fields: Object.keys(input) } });
  res.json({ data: promo });
}));

api.get("/admin/passengers", authenticate, authorize("ADMIN", "SUPPORT"), asyncRoute(async (req, res) => {
  const status = z.enum(["PENDING", "ACTIVE", "SUSPENDED", "DEACTIVATED"]).optional().parse(req.query.status);
  const search = z.string().trim().max(80).optional().parse(req.query.search);
  const passengers = await prisma.user.findMany({
    where: { role: "PASSENGER", ...(status ? { status } : {}), ...(search ? { OR: [{ firstName: { contains: search, mode: "insensitive" } }, { lastName: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }] } : {}) },
    select: { id: true, firstName: true, lastName: true, phone: true, email: true, status: true, createdAt: true, _count: { select: { rides: true, ratingsGiven: true } } },
    orderBy: { createdAt: "desc" }, take: 100
  });
  res.json({ data: passengers });
}));

api.patch("/admin/passengers/:id/status", authenticate, authorize("ADMIN"), asyncRoute(async (req, res) => {
  const status = z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]) }).parse(req.body).status;
  const passenger = await prisma.user.findFirst({ where: { id: req.params.id, role: "PASSENGER" } });
  if (!passenger) return res.status(404).json({ error: { code: "PASSENGER_NOT_FOUND", message: "Passenger not found" } });
  const updated = await prisma.user.update({ where: { id: passenger.id }, data: { status } });
  if (status !== "ACTIVE") await prisma.refreshToken.updateMany({ where: { userId: passenger.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await writeAudit({ actorId: req.user!.sub, action: `PASSENGER_${status}`, entityType: "User", entityId: passenger.id, ipAddress: req.ip });
  res.json({ data: { id: updated.id, status: updated.status } });
}));

api.get("/admin/reviews", authenticate, authorize("ADMIN", "SUPPORT"), asyncRoute(async (req, res) => {
  const status = z.enum(["PENDING", "PUBLISHED", "HIDDEN"]).default("PENDING").parse(req.query.status);
  const reviews = await prisma.rating.findMany({ where: { status }, include: { author: { select: { id: true, firstName: true, lastName: true } }, subject: { select: { id: true, firstName: true, lastName: true } }, ride: { select: { id: true, completedAt: true } } }, orderBy: { createdAt: "asc" }, take: 100 });
  res.json({ data: reviews });
}));

api.patch("/admin/reviews/:id", authenticate, authorize("ADMIN"), asyncRoute(async (req, res) => {
  const status = z.object({ status: z.enum(["PUBLISHED", "HIDDEN"]) }).parse(req.body).status;
  const review = await prisma.rating.update({ where: { id: req.params.id }, data: { status, moderatedAt: new Date(), moderatedById: req.user!.sub } });
  await writeAudit({ actorId: req.user!.sub, action: `REVIEW_${status}`, entityType: "Rating", entityId: review.id, ipAddress: req.ip });
  res.json({ data: review });
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

api.get("/drivers/me/dashboard", authenticate, authorize("DRIVER"), asyncRoute(async (req, res) => {
  const driver = await prisma.driver.findUnique({
    where: { userId: req.user!.sub },
    include: { vehicle: true, kycCase: true }
  });
  if (!driver) return res.status(404).json({ error: { code: "DRIVER_NOT_FOUND", message: "Driver profile not found" } });
  const [earnings, cancelledRides, rating, activeRide, unreadNotifications, wallet] = await Promise.all([
    prisma.ride.aggregate({ where: { driverId: driver.id, status: "COMPLETED" }, _sum: { driverEarningsMinor: true }, _count: true }),
    prisma.ride.count({ where: { driverId: driver.id, status: "CANCELLED" } }),
    prisma.rating.aggregate({ where: { subjectId: req.user!.sub }, _avg: { score: true }, _count: true }),
    prisma.ride.findFirst({ where: { driverId: driver.id, status: { in: ["DRIVER_ASSIGNED", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "PASSENGER_BOARDED", "IN_PROGRESS"] } }, orderBy: { requestedAt: "desc" } }),
    prisma.notification.count({ where: { userId: req.user!.sub, readAt: null } }),
    prisma.wallet.upsert({ where: { userId: req.user!.sub }, update: {}, create: { userId: req.user!.sub }, select: { balanceMinor: true, currency: true } })
  ]);
  res.json({
    data: {
      driver: { id: driver.id, status: driver.status, verifiedAt: driver.verifiedAt, onboardingStep: driver.onboardingStep, kycStatus: driver.kycCase?.status ?? null, vehicle: driver.vehicle },
      earnings: { currency: "LRD", completedRides: earnings._count, driverEarningsMinor: earnings._sum.driverEarningsMinor ?? 0 },
      performance: { completedRides: earnings._count, cancelledRides, completionRate: earnings._count + cancelledRides ? earnings._count / (earnings._count + cancelledRides) : 0 },
      wallet,
      rating: { average: rating._avg.score, count: rating._count },
      activeRide,
      unreadNotifications
    }
  });
}));

api.get("/drivers/me/availability-schedule", authenticate, authorize("DRIVER"), asyncRoute(async (req, res) => {
  const driver = await prisma.driver.findUnique({ where: { userId: req.user!.sub }, select: { id: true } });
  if (!driver) return res.status(404).json({ error: { code: "DRIVER_NOT_FOUND", message: "Driver profile not found" } });
  res.json({ data: await prisma.driverAvailability.findMany({ where: { driverId: driver.id, endsAt: { gte: new Date() }, active: true }, orderBy: { startsAt: "asc" }, take: 100 }) });
}));

api.post("/drivers/me/availability-schedule", authenticate, authorize("DRIVER"), asyncRoute(async (req, res) => {
  const input = z.object({ startsAt: z.coerce.date(), endsAt: z.coerce.date() }).refine((value) => validateAvailabilityWindow(value.startsAt, value.endsAt), "Availability must be a future window of 24 hours or less").parse(req.body);
  const driver = await prisma.driver.findUnique({ where: { userId: req.user!.sub }, select: { id: true } });
  if (!driver) return res.status(404).json({ error: { code: "DRIVER_NOT_FOUND", message: "Driver profile not found" } });
  const overlap = await prisma.driverAvailability.count({ where: { driverId: driver.id, active: true, startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt } } });
  if (overlap) return res.status(409).json({ error: { code: "AVAILABILITY_OVERLAP", message: "Availability windows cannot overlap" } });
  res.status(201).json({ data: await prisma.driverAvailability.create({ data: { driverId: driver.id, ...input } }) });
}));

api.delete("/drivers/me/availability-schedule/:id", authenticate, authorize("DRIVER"), asyncRoute(async (req, res) => {
  const driver = await prisma.driver.findUnique({ where: { userId: req.user!.sub }, select: { id: true } });
  if (!driver) return res.status(404).json({ error: { code: "DRIVER_NOT_FOUND", message: "Driver profile not found" } });
  const cancelled = await prisma.driverAvailability.updateMany({ where: { id: req.params.id, driverId: driver.id, startsAt: { gt: new Date() } }, data: { active: false } });
  if (!cancelled.count) return res.status(404).json({ error: { code: "WINDOW_NOT_FOUND", message: "Future availability window not found" } });
  res.status(204).send();
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
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: payment.id }, data: { status: event.status, ...(event.status === "CAPTURED" ? { capturedAt: new Date() } : {}) } });
    if (event.status === "REFUNDED") await tx.refund.updateMany({ where: { paymentId: payment.id, status: { in: ["APPROVED", "PROCESSING"] } }, data: { status: "COMPLETED" } });
  });
  res.status(204).send();
}));

api.get("/admin/overview", authenticate, authorize("ADMIN"), asyncRoute(async (_req, res) => {
  const [activeRides, availableDrivers, captured] = await Promise.all([
    prisma.ride.count({ where: { status: { in: ["SEARCHING", "DRIVER_ASSIGNED", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "PASSENGER_BOARDED", "IN_PROGRESS"] } } }),
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
