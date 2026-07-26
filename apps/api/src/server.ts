import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { createServer } from "node:http";
import { pinoHttp } from "pino-http";
import { WebSocketServer } from "ws";
import { ZodError } from "zod";
import { api } from "./routes.js";
import { verifyAccessToken } from "./auth.js";
import { config } from "./config.js";
import { prisma, redis } from "./lib.js";
import { updateDriverLocation } from "./services/dispatch.js";

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(pinoHttp({ redact: ["req.headers.authorization", "req.body.password", "res.headers.set-cookie"] }));
app.use("/api", rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/v1/auth", rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }));
app.use(express.json({
  limit: "256kb",
  verify: (req, _res, buffer) => { (req as Request & { rawBody: string }).rawBody = buffer.toString(); }
}));
app.get("/health/live", (_req, res) => res.json({ status: "ok" }));
app.get("/health/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready" });
  } catch { res.status(503).json({ status: "not_ready" }); }
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
  const token = new URL(request.url ?? "", "http://localhost").searchParams.get("access_token");
  if (!token) return socket.close(1008, "Authentication required");
  const user = await verifyAccessToken(token).catch(() => null);
  if (!user) return socket.close(1008, "Authentication required");
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
        if (event.latitude < -90 || event.latitude > 90 || event.longitude < -180 || event.longitude > 180) throw new Error("Location is outside valid bounds");
        const location = await updateDriverLocation(user.sub, event.latitude, event.longitude);
        const activeRide = await prisma.ride.findFirst({ where: { driverId: location.driverId, status: { in: ["DRIVER_ASSIGNED", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "IN_PROGRESS"] } }, select: { id: true } });
        if (activeRide) {
          const message = JSON.stringify({ type: "driver.location", rideId: activeRide.id, latitude: location.latitude, longitude: location.longitude, at: location.at });
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
  console.log(`LibSwiftRide API listening on ${config.API_PORT}`);
});

async function shutdown() {
  server.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
