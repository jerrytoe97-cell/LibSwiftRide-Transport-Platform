import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import { collectDefaultMetrics, Counter, Histogram, register } from "prom-client";
import { WebSocketServer } from "ws";
import { ZodError } from "zod";
import { api } from "./routes.js";
import { verifyAccessToken } from "./auth.js";
import { config } from "./config.js";
import { prisma, redis } from "./lib.js";
import { activateScheduledRides, updateDriverLocation } from "./services/dispatch.js";
import { deliverPendingNotifications } from "./services/notifications.js";
import { logger } from "./logger.js";
import { distanceMetres, estimateEtaSeconds } from "./services/tracking.js";

const app = express();
collectDefaultMetrics({ prefix: "libswiftride_" });
const httpRequests = new Counter({ name: "libswiftride_http_requests_total", help: "HTTP requests", labelNames: ["method", "route", "status"] });
const httpDuration = new Histogram({ name: "libswiftride_http_request_duration_seconds", help: "HTTP request duration", labelNames: ["method", "route", "status"], buckets: [.01, .05, .1, .25, .5, 1, 2, 5] });
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(pinoHttp({ logger, genReqId: (req, res) => { const id = String(req.headers["x-request-id"] ?? randomUUID()); res.setHeader("x-request-id", id); return id; }, redact: ["req.headers.authorization", "req.body.password", "req.body.phone", "req.body.paymentNumber", "res.headers.set-cookie"] }));
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
app.use("/api/v1/auth/password-reset", rateLimit({ windowMs: 60 * 60_000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/v1/rides", rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/v1/payments", rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api", (_req, res, next) => {
  res.setHeader("cache-control", "no-store");
  next();
});
app.use(express.json({
  limit: "256kb",
  verify: (req, _res, buffer) => { (req as Request & { rawBody: string }).rawBody = buffer.toString(); }
}));
app.get("/health/live", (_req, res) => res.json({ status: "ok" }));
app.get("/health/ready", async (_req, res) => {
  try {
    await Promise.all([prisma.$queryRaw`SELECT 1`, redis.ping()]);
    res.json({ status: "ready", dependencies: { postgres: "ok", redis: "ok" } });
  } catch { res.status(503).json({ status: "not_ready" }); }
});
app.get("/metrics", async (req, res) => {
  if (config.METRICS_TOKEN && req.headers.authorization !== `Bearer ${config.METRICS_TOKEN}`) return res.status(401).send("Unauthorized");
  res.setHeader("content-type", register.contentType);
  res.send(await register.metrics());
});
app.get("/openapi.json", (_req, res) => res.json({ openapi: "3.1.0", info: { title: "LibSwiftRide API", version: "0.1.0" }, servers: [{ url: "/api/v1" }] }));
app.use("/api/v1", api);
app.use((_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } }));
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ err: error }, "request failed");
  if (error instanceof ZodError) return res.status(422).json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: error.issues } });
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const rideSubscriptions = new Map<string, Set<import("ws").WebSocket>>();
wss.on("connection", async (socket, request) => {
  const protocols = String(request.headers["sec-websocket-protocol"] ?? "").split(",").map((value) => value.trim());
  const encodedToken = protocols.find((value) => value.startsWith("auth."));
  const token = encodedToken ? Buffer.from(encodedToken.slice(5), "base64url").toString() : null;
  if (!token) return socket.close(1008, "Authentication required");
  const user = await verifyAccessToken(token).catch(() => null);
  if (!user) return socket.close(1008, "Authentication required");
  let lastLocationAt = 0;
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
          await prisma.routePoint.create({ data: { rideId: activeRide.id, latitude: location.latitude, longitude: location.longitude, ...(Number.isInteger(event.heading) && event.heading >= 0 && event.heading <= 359 ? { heading: event.heading } : {}), ...(Number.isFinite(event.speedMps) && event.speedMps >= 0 && event.speedMps <= 100 ? { speedMps: event.speedMps } : {}) } });
          const target = ["PASSENGER_BOARDED", "IN_PROGRESS"].includes(activeRide.status)
            ? { latitude: Number(activeRide.destinationLatitude), longitude: Number(activeRide.destinationLongitude) }
            : { latitude: Number(activeRide.pickupLatitude), longitude: Number(activeRide.pickupLongitude) };
          const remainingDistanceM = distanceMetres(location, target);
          const message = JSON.stringify({ type: "driver.location", rideId: activeRide.id, latitude: location.latitude, longitude: location.longitude, at: location.at, remainingDistanceM, etaSeconds: estimateEtaSeconds(remainingDistanceM, Number.isFinite(event.speedMps) ? event.speedMps : undefined) });
          for (const subscriber of rideSubscriptions.get(activeRide.id) ?? []) if (subscriber.readyState === 1) subscriber.send(message);
        }
        socket.send(JSON.stringify({ type: "location.ack", at: location.at }));
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
  await redis.connect().catch(() => undefined);
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

async function shutdown() {
  clearInterval(notificationTimer);
  clearInterval(scheduledRideTimer);
  server.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
