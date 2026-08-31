import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import { collectDefaultMetrics, Counter, Histogram, register } from "prom-client";
import { WebSocketServer } from "ws";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { api } from "./routes.js";
import { verifyAccessToken } from "./auth.js";
import { config } from "./config.js";
import { prisma, redis, redisSubscriber } from "./lib.js";
import { activateScheduledRides, updateDriverLocation } from "./services/dispatch.js";
import { deliverPendingNotifications, queueNotification, safeSmtpErrorDetails, verifyZohoSmtpTransport } from "./services/notifications.js";
import { logger } from "./logger.js";
import { distanceMetres, estimateEtaSeconds } from "./services/tracking.js";
import { queueDocumentExpiryReminders } from "./services/document-reminders.js";
import { decodeRideRealtimeEvent, publishRideRealtimeEvent, RIDE_REALTIME_CHANNEL } from "./services/ride-realtime.js";
import { loadOpenApiYaml } from "./services/openapi.js";
import { validationErrorMessage } from "./services/validation.js";
import { purgeExpiredRoutePoints } from "./services/location-retention.js";
import { consumeStartupProvisioningEnvironment, provisionPrivilegedAccounts, STARTUP_PROVISIONING_MARKER } from "./services/privileged-provisioning.js";

const startupProvisioningAccounts = consumeStartupProvisioningEnvironment(process.env);
if (startupProvisioningAccounts) {
  const result = await provisionPrivilegedAccounts(prisma, startupProvisioningAccounts, { singleUseMarker: STARTUP_PROVISIONING_MARKER });
  logger.info({ status: result.status, accountCount: result.count }, "privileged staging startup provisioning handled");
}

const app = express();
collectDefaultMetrics({ prefix: "libswiftride_" });
const httpRequests = new Counter({ name: "libswiftride_http_requests_total", help: "HTTP requests", labelNames: ["method", "route", "status"] });
const httpDuration = new Histogram({ name: "libswiftride_http_request_duration_seconds", help: "HTTP request duration", labelNames: ["method", "route", "status"], buckets: [.01, .05, .1, .25, .5, 1, 2, 5] });
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(pinoHttp({ logger, genReqId: (req, res) => { const id = String(req.headers["x-request-id"] ?? randomUUID()); res.setHeader("x-request-id", id); return id; }, redact: ["req.headers.authorization", "req.body.password", "req.body.phone", "req.body.paymentNumber", "req.body.code", "req.body.challengeToken", "req.body.enrollmentToken", "req.body.refreshToken", "res.headers.set-cookie"] }));
app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on("finish", () => {
    const labels = { method: req.method, route: req.route?.path ?? "unmatched", status: String(res.statusCode) };
    httpRequests.inc(labels);
    end(labels);
  });
  next();
});
app.use("/api", rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/v1/auth", rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/v1/auth/login", rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/v1/auth/mfa", rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/v1/auth/email-verification", rateLimit({ windowMs: 15 * 60_000, limit: 6, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/v1/auth/password-reset", rateLimit({ windowMs: 60 * 60_000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/v1/rides", rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/v1/payments", rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/v1/deliveries", rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/v1/corporate", rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/v1/admin", rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/v1/reports", rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/v1/devices", rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api", (_req, res, next) => {
  res.setHeader("cache-control", "no-store");
  next();
});
app.use("/api/v1/profile/photo", express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "2mb" }));
app.use(express.json({
  limit: "256kb",
  verify: (req, _res, buffer) => { (req as Request & { rawBody: string }).rawBody = buffer.toString(); }
}));
app.get("/health/live", (_req, res) => res.json({ status: "ok" }));
app.get("/health/ready", async (_req, res) => {
  try {
    await Promise.race([
      Promise.all([prisma.$queryRaw`SELECT 1`, redis.ping()]),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Dependency health check timed out")), 2_000))
    ]);
    res.json({ status: "ready", dependencies: { postgres: "ok", redis: "ok" } });
  } catch { res.status(503).json({ status: "not_ready" }); }
});
app.get("/metrics", async (req, res) => {
  if (config.METRICS_TOKEN && req.headers.authorization !== `Bearer ${config.METRICS_TOKEN}`) return res.status(401).send("Unauthorized");
  res.setHeader("content-type", register.contentType);
  res.send(await register.metrics());
});
app.get("/openapi.yaml", (_req, res) => res.type("application/yaml").send(loadOpenApiYaml()));
app.get("/openapi.json", (_req, res) => res.redirect(308, "/openapi.yaml"));
app.use("/api/v1", api);
app.use((_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } }));
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ err: error }, "request failed");
  if (error instanceof ZodError) return res.status(422).json({ error: { code: "VALIDATION_ERROR", message: validationErrorMessage(error), details: error.issues } });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return res.status(409).json({
      error: {
        code: "ACCOUNT_EXISTS",
        message: "An account already exists with this phone number or email address. Sign in instead."
      }
    });
  }
  const kycCode = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : null;
  const safeKycCodes = new Set(["KYC_FILE_TYPE_MISMATCH", "KYC_MALWARE_DETECTED", "KYC_FILE_SIZE_MISMATCH", "KYC_FILE_METADATA_INVALID", "KYC_FILE_INCOMPLETE", "KYC_CHECKSUM_MISMATCH", "KYC_SCANNER_INVALID_RESPONSE"]);
  if (kycCode && safeKycCodes.has(kycCode)) return res.status(422).json({ error: { code: kycCode, message: error instanceof Error ? error.message : "Document security validation failed" } });
  if (kycCode === "KYC_STORAGE_UNAVAILABLE") return res.status(503).json({ error: { code: kycCode, message: "Private document storage is unavailable" } });
  if (kycCode === "KYC_SCANNER_UNAVAILABLE") return res.status(503).json({ error: { code: kycCode, message: "Document security scanning is unavailable" } });
  if (kycCode && ["PROFILE_PHOTO_TYPE_UNSUPPORTED", "PROFILE_PHOTO_TYPE_MISMATCH", "PROFILE_PHOTO_TOO_LARGE"].includes(kycCode)) return res.status(422).json({ error: { code: kycCode, message: error instanceof Error ? error.message : "Profile photo validation failed" } });
  if (error && typeof error === "object" && "type" in error && error.type === "entity.too.large") return res.status(413).json({ error: { code: "PROFILE_PHOTO_TOO_LARGE", message: "Profile photos must be no larger than 2 MB" } });
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const rideSubscriptions = new Map<string, Set<import("ws").WebSocket>>();
function broadcastToLocalRide(rideId: string, payload: string) {
  for (const subscriber of rideSubscriptions.get(rideId) ?? []) if (subscriber.readyState === 1) subscriber.send(payload);
}

redisSubscriber.on("message", (channel, value) => {
  if (channel !== RIDE_REALTIME_CHANNEL) return;
  const event = decodeRideRealtimeEvent(value);
  if (event) broadcastToLocalRide(event.rideId, event.payload);
});

async function broadcastToRide(rideId: string, payload: string) {
  try {
    const subscriberCount = await publishRideRealtimeEvent(redis, { rideId, payload });
    if (subscriberCount === 0) broadcastToLocalRide(rideId, payload);
  } catch (error) {
    logger.warn({ err: error, rideId }, "Redis ride fan-out unavailable; using local delivery");
    broadcastToLocalRide(rideId, payload);
  }
}
wss.on("connection", async (socket, request) => {
  const protocols = String(request.headers["sec-websocket-protocol"] ?? "").split(",").map((value) => value.trim());
  const encodedToken = protocols.find((value) => value.startsWith("auth."));
  const token = encodedToken ? Buffer.from(encodedToken.slice(5), "base64url").toString() : null;
  if (!token) return socket.close(1008, "Authentication required");
  const user = await verifyAccessToken(token).catch(() => null);
  if (!user) return socket.close(1008, "Authentication required");
  let lastLocationAt = 0;
  let lastRoutePointAt = 0;
  let lastChatAt = 0;
  socket.on("message", async (payload) => {
    try {
      const event = JSON.parse(payload.toString());
      if (event.type === "ride.subscribe" && typeof event.rideId === "string") {
        const ride = await prisma.ride.findUnique({ where: { id: event.rideId }, include: { driver: true } });
        const allowed = ride && (ride.passengerId === user.sub || ride.driver?.userId === user.sub || ["ADMIN", "SUPPORT"].includes(user.role));
        if (!allowed) throw new Error("Ride subscription denied");
        const subscribers = rideSubscriptions.get(event.rideId) ?? new Set();
        subscribers.add(socket);
        rideSubscriptions.set(event.rideId, subscribers);
        socket.send(JSON.stringify({ type: "ride.subscribed", rideId: event.rideId }));
      }
      if (event.type === "driver.location" && user.role === "DRIVER" && Number.isFinite(event.latitude) && Number.isFinite(event.longitude)) {
        if (Date.now() - lastLocationAt < 1_000) throw new Error("Location update rate exceeded");
        lastLocationAt = Date.now();
        if (event.latitude < -90 || event.latitude > 90 || event.longitude < -180 || event.longitude > 180) throw new Error("Location is outside valid bounds");
        const location = await updateDriverLocation(user.sub, event.latitude, event.longitude);
        const activeRide = await prisma.ride.findFirst({ where: { driverId: location.driverId, status: { in: ["DRIVER_ASSIGNED", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "PASSENGER_BOARDED", "IN_PROGRESS"] } }, select: { id: true, status: true, pickupLatitude: true, pickupLongitude: true, destinationLatitude: true, destinationLongitude: true } });
        if (activeRide) {
          if (Date.now() - lastRoutePointAt >= 10_000) {
            lastRoutePointAt = Date.now();
            await prisma.routePoint.create({ data: { rideId: activeRide.id, latitude: location.latitude, longitude: location.longitude, ...(Number.isInteger(event.heading) && event.heading >= 0 && event.heading <= 359 ? { heading: event.heading } : {}), ...(Number.isFinite(event.speedMps) && event.speedMps >= 0 && event.speedMps <= 100 ? { speedMps: event.speedMps } : {}) } });
          }
          const target = ["PASSENGER_BOARDED", "IN_PROGRESS"].includes(activeRide.status)
            ? { latitude: Number(activeRide.destinationLatitude), longitude: Number(activeRide.destinationLongitude) }
            : { latitude: Number(activeRide.pickupLatitude), longitude: Number(activeRide.pickupLongitude) };
          const remainingDistanceM = distanceMetres(location, target);
          const message = JSON.stringify({ type: "driver.location", rideId: activeRide.id, latitude: location.latitude, longitude: location.longitude, at: location.at, remainingDistanceM, etaSeconds: estimateEtaSeconds(remainingDistanceM, Number.isFinite(event.speedMps) ? event.speedMps : undefined) });
          await broadcastToRide(activeRide.id, message);
        }
        socket.send(JSON.stringify({ type: "location.ack", at: location.at }));
      }
      if (event.type === "chat.send" && typeof event.rideId === "string" && typeof event.content === "string") {
        if (Date.now() - lastChatAt < 1_000) throw new Error("Chat rate exceeded");
        lastChatAt = Date.now();
        const content = event.content.trim();
        if (!content || content.length > 500) throw new Error("Invalid chat content");
        const ride = await prisma.ride.findUnique({ where: { id: event.rideId }, include: { driver: true } });
        const participant = ride && (ride.passengerId === user.sub || ride.driver?.userId === user.sub);
        if (!participant || ["REQUESTED", "SEARCHING", "COMPLETED", "CANCELLED"].includes(ride.status)) throw new Error("Chat unavailable");
        const message = await prisma.chatMessage.create({ data: { rideId: ride.id, senderId: user.sub, content }, select: { id: true, rideId: true, senderId: true, content: true, createdAt: true } });
        const payload = JSON.stringify({ type: "chat.message", ...message });
        await broadcastToRide(ride.id, payload);
        const recipientId = ride.passengerId === user.sub ? ride.driver!.userId : ride.passengerId;
        await queueNotification({ userId: recipientId, channel: "PUSH", template: "ride-chat", title: "New ride message", body: "You have a new message from your ride participant.", data: { rideId: ride.id } }).catch(() => undefined);
      }
    } catch { socket.send(JSON.stringify({ type: "error", code: "INVALID_EVENT" })); }
  });
  socket.on("close", () => {
    for (const [rideId, subscribers] of rideSubscriptions) {
      subscribers.delete(socket);
      if (!subscribers.size) rideSubscriptions.delete(rideId);
    }
  });
});

server.listen(config.API_PORT, async () => {
  await Promise.all([
    redis.connect(),
    redisSubscriber.connect().then(() => redisSubscriber.subscribe(RIDE_REALTIME_CHANNEL))
  ]).catch((error) => logger.error({ err: error }, "Redis startup connection failed"));
  verifyZohoSmtpTransport()
    .then((verified) => {
      if (verified) logger.info({ host: config.ZOHO_SMTP_HOST, port: config.ZOHO_SMTP_PORT, secure: config.ZOHO_SMTP_SECURE }, "Zoho SMTP transporter verified");
    })
    .catch((error) => logger.error(safeSmtpErrorDetails(error), "Zoho SMTP transporter verification failed"));
  logger.info({ port: config.API_PORT }, "API listening");
});

const notificationTimer = setInterval(() => {
  deliverPendingNotifications().catch((error) => logger.error({ err: error }, "notification delivery cycle failed"));
}, 5_000);
notificationTimer.unref();
const scheduledRideTimer = setInterval(() => {
  activateScheduledRides().catch((error) => logger.error({ err: error }, "scheduled ride activation failed"));
}, 30_000);
scheduledRideTimer.unref();
const documentReminderTimer = setInterval(() => {
  queueDocumentExpiryReminders().catch((error) => logger.error({ err: error }, "document expiry reminder cycle failed"));
}, 6 * 60 * 60_000);
documentReminderTimer.unref();
const locationRetentionTimer = setInterval(() => {
  purgeExpiredRoutePoints(config.ROUTE_POINT_RETENTION_DAYS)
    .then(({ deleted, cutoff }) => { if (deleted) logger.info({ deleted, cutoff }, "expired route points purged"); })
    .catch((error) => logger.error({ err: error }, "route-point retention cycle failed"));
}, 6 * 60 * 60_000);
locationRetentionTimer.unref();

async function shutdown() {
  clearInterval(notificationTimer);
  clearInterval(scheduledRideTimer);
  clearInterval(documentReminderTimer);
  clearInterval(locationRetentionTimer);
  server.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit(), redisSubscriber.quit()]);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
