import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { issueTokens } from "./auth.js";
import { prisma } from "./lib.js";
import { api } from "./routes.js";
import { publicDriver, publicRide } from "./services/public-projections.js";

const app = express(); app.use(express.json()); app.use("/api/v1", api);
afterEach(() => vi.restoreAllMocks());
async function token(role = "PASSENGER") {
  let session: any;
  vi.spyOn(prisma, "$queryRaw").mockResolvedValue([]);
  vi.spyOn(prisma, "$transaction").mockImplementation(async (operation: any) => operation(prisma));
  vi.spyOn(prisma.user, "findUniqueOrThrow").mockResolvedValue({ id: "fictional-owner", role, status: "ACTIVE", securityVersion: 0 } as never);
  vi.spyOn(prisma.refreshToken, "create").mockImplementation((async ({ data }: any) => { session = { ...data, revokedAt: null }; return session; }) as never);
  vi.spyOn(prisma.refreshToken, "findUnique").mockImplementation((async () => ({ ...session, user: { id: "fictional-owner", role, status: "ACTIVE", securityVersion: 0 } })) as never);
  return (await issueTokens({ sub: "fictional-owner", role, mfa: true })).accessToken;
}
const sensitiveDriver = { id: "driver", userId: "driver-user", licenseNumber: "fictional-sensitive-license", nationalIdRef: "fictional-sensitive-identity",
  approvedById: "reviewer", user: { id: "driver-user", firstName: "Fictional", lastName: "Driver", passwordHash: "fictional-secret-hash", email: "private@example.test" }, vehicle: null };

describe("public data boundaries", () => {
  it("allow-lists nested driver and payment fields", () => {
    const data = publicRide({ id: "ride", driver: sensitiveDriver, payment: { id: "payment", status: "CAPTURED", providerPayload: { token: "secret" }, idempotencyKey: "other-operation" } });
    expect(publicDriver(sensitiveDriver)?.user?.firstName).toBe("Fictional");
    for (const key of ["passwordHash", "licenseNumber", "nationalIdRef", "approvedById", "providerPayload", "other-operation", "private@example.test"]) expect(JSON.stringify(data)).not.toContain(key);
  });
  it("returns a participant ride without driver identity or password material", async () => {
    const access = await token();
    vi.spyOn(prisma.ride, "findUnique").mockResolvedValue({ id: "ride", passengerId: "fictional-owner", driver: sensitiveDriver, payment: null } as never);
    vi.spyOn(prisma.rating, "aggregate").mockResolvedValue({ _avg: { score: 5 }, _count: 1 } as never);
    const response = await request(app).get("/api/v1/rides/ride").set("authorization", `Bearer ${access}`).expect(200);
    expect(response.body.data.driver.user.firstName).toBe("Fictional");
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|nationalIdRef|licenseNumber/);
  });
  it("denies an unrelated ride", async () => {
    const access = await token();
    vi.spyOn(prisma.ride, "findUnique").mockResolvedValue({ id: "ride", passengerId: "other", driver: sensitiveDriver } as never);
    await request(app).get("/api/v1/rides/ride").set("authorization", `Bearer ${access}`).expect(403);
  });
  it("denies fleet reports when the manager has no fleet before reading rides", async () => {
    const access = await token("FLEET_MANAGER");
    vi.spyOn(prisma.fleet, "findUnique").mockResolvedValue(null);
    const read = vi.spyOn(prisma.ride, "findMany").mockResolvedValue([]);
    await request(app).get("/api/v1/reports/operations?from=2026-09-01&to=2026-09-02").set("authorization", `Bearer ${access}`).expect(403);
    expect(read).not.toHaveBeenCalled();
  });
  it("denies ride listing for a driver without a profile", async () => {
    const access = await token("DRIVER");
    vi.spyOn(prisma.driver, "findUnique").mockResolvedValue(null);
    const read = vi.spyOn(prisma.ride, "findMany").mockResolvedValue([]);
    await request(app).get("/api/v1/rides").set("authorization", `Bearer ${access}`).expect(403);
    expect(read).not.toHaveBeenCalled();
  });
  it("filters both notification contents and unread count to in-app messages", async () => {
    const access = await token();
    const read = vi.spyOn(prisma.notification, "findMany").mockResolvedValue([]);
    const count = vi.spyOn(prisma.notification, "count").mockResolvedValue(0);
    await request(app).get("/api/v1/notifications").set("authorization", `Bearer ${access}`).expect(200);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "fictional-owner", channel: "IN_APP" }) }));
    expect(count).toHaveBeenCalledWith({ where: { userId: "fictional-owner", channel: "IN_APP", readAt: null } });
  });
});
