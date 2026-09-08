import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { api } from "./routes.js";
import { issueTokens } from "./auth.js";
import { prisma } from "./lib.js";

const app = express();
app.use(express.json());
app.use("/api/v1", api);
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  res.status(error instanceof ZodError ? 422 : 500).json({ error: { code: "TEST_REQUEST_FAILED" } });
});

let passengerId: string;
let dispatcherToken: string;
let passengerToken: string;
const userData = () => ({ phone: `fictional-safety-${randomUUID()}`, passwordHash: "unusable-fictional-fixture", firstName: "Fictional", lastName: "Safety", status: "ACTIVE" as const });
async function rideFixture() {
  return prisma.ride.create({ data: {
    passengerId, idempotencyKey: randomUUID(), status: "CANCELLED",
    pickupAddress: "Fictional A", pickupLatitude: 6.3, pickupLongitude: -10.8,
    destinationAddress: "Fictional B", destinationLatitude: 6.31, destinationLongitude: -10.79,
    estimatedDistanceM: 1000, estimatedDurationSec: 300,
    fareMinor: 1000, driverEarningsMinor: 860, companyCommissionMinor: 140, paymentMethod: "CASH",
    payment: { create: { provider: "CASH", idempotencyKey: randomUUID(), amountMinor: 1000, method: "CASH", status: "CAPTURED" } }
  } });
}


const call = (id: string, action: string, token = dispatcherToken) => action === "ACKNOWLEDGED" || action === "RESOLVED"
  ? request(app).patch(`/api/v1/safety/incidents/${id}`).set("authorization", `Bearer ${token}`).send({ status: action })
  : request(app).post(`/api/v1/safety/incidents/${id}/${action}`).set("authorization", `Bearer ${token}`).send({ target: "passenger" });
async function incidentFixture() {
  const ride = await rideFixture();
  return prisma.safetyIncident.create({ data: { rideId: ride.id, reporterId: passengerId, category: "OTHER", note: "Fictional safety fixture" } });
}

describe.sequential("safety responder HTTP invariants", () => {
  beforeAll(async () => {
    const dispatcher = await prisma.user.create({ data: { ...userData(), role: "DISPATCHER" } });
    await prisma.user.create({ data: { ...userData(), role: "SUPPORT" } });
    const passenger = await prisma.user.create({ data: { ...userData(), role: "PASSENGER" } });
    passengerId = passenger.id;
    dispatcherToken = (await issueTokens({ sub: dispatcher.id, role: dispatcher.role, mfa: true })).accessToken;
    passengerToken = (await issueTokens({ sub: passenger.id, role: passenger.role })).accessToken;
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("requires acknowledgement before resolution and preserves terminal timestamps", async () => {
    const incident = await incidentFixture();
    await call(incident.id, "RESOLVED").expect(409);
    const acknowledged = await call(incident.id, "ACKNOWLEDGED").expect(200);
    const replay = await call(incident.id, "ACKNOWLEDGED").expect(200);
    expect(replay.body.data.acknowledgedAt).toBe(acknowledged.body.data.acknowledgedAt);
    const resolved = await call(incident.id, "RESOLVED").expect(200);
    expect((await call(incident.id, "RESOLVED").expect(200)).body.data.resolvedAt).toBe(resolved.body.data.resolvedAt);
    await call(incident.id, "ACKNOWLEDGED").expect(409);
    await call(incident.id, "escalate").expect(409);
    expect(await prisma.auditLog.count({ where: { entityId: incident.id } })).toBe(2);
  });

  it("serializes concurrent acknowledgement and escalation retries without duplicate side effects", async () => {
    const incident = await incidentFixture();
    const acknowledgements = await Promise.all([call(incident.id, "ACKNOWLEDGED"), call(incident.id, "ACKNOWLEDGED")]);
    expect(acknowledgements.map((result) => result.status)).toEqual([200, 200]);
    expect(await prisma.auditLog.count({ where: { entityId: incident.id, action: "SOS_ACKNOWLEDGED" } })).toBe(1);
    const escalations = await Promise.all([call(incident.id, "escalate"), call(incident.id, "escalate")]);
    expect(escalations.map((result) => result.status)).toEqual([200, 200]);
    expect(escalations[0]!.body.data.id).toBe(escalations[1]!.body.data.id);
    expect(await prisma.auditLog.count({ where: { entityId: incident.id, action: "SOS_ESCALATED" } })).toBe(1);
    const alerts = await prisma.notification.findMany({ where: { data: { path: ["incidentId"], equals: incident.id } } });
    expect(alerts.length).toBeGreaterThan(0);
    expect(new Set(alerts.map((alert) => `${alert.userId}:${alert.channel}`)).size).toBe(alerts.length);
    expect(alerts.every((alert) => alert.status === "PENDING" && !alert.body.includes("Fictional safety fixture"))).toBe(true);
  });

  it("returns only audited contact fields and handles unassigned drivers", async () => {
    const incident = await incidentFixture();
    const response = await call(incident.id, "contact").expect(200);
    expect(Object.keys(response.body.data).sort()).toEqual(["firstName", "lastName", "phone"]);
    expect(response.headers["cache-control"]).toBe("no-store");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: incident.id, action: "SOS_CONTACT_VIEWED" } });
    expect(audit.metadata).toEqual({ target: "passenger" });
    await request(app).post(`/api/v1/safety/incidents/${incident.id}/contact`).set("authorization", `Bearer ${dispatcherToken}`).send({ target: "driver" }).expect(404);
  });

  it("rejects passengers and unauthenticated users at every responder boundary", async () => {
    const incident = await incidentFixture();
    for (const action of ["ACKNOWLEDGED", "RESOLVED", "escalate", "contact"]) {
      await call(incident.id, action, passengerToken).expect(403);
      await call(incident.id, action, "").expect(401);
    }
    await request(app).get("/api/v1/safety/incidents").set("authorization", `Bearer ${passengerToken}`).expect(403);
    expect(await prisma.auditLog.count({ where: { entityId: incident.id } })).toBe(0);
  });

  it("returns a stable not-found response and validates incident identifiers", async () => {
    for (const action of ["ACKNOWLEDGED", "escalate", "contact"]) {
      await call(randomUUID(), action).expect(404);
      await call("invalid", action).expect(422);
    }
  });
});
