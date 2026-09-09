import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "./lib.js";
import { issueTokens } from "./auth.js";
import { api } from "./routes.js";
const app = express(); app.use(express.json()); app.use("/api/v1", api);
afterAll(() => prisma.$disconnect());
const deniedEndpoints = (id: string) => [
  `/admin/drivers/${id}/cash-collections`, `/admin/payouts/${id}/cash-resolution`,
  `/admin/refunds/${id}/cash-completion`, `/admin/drivers/${id}/adjustments`,
  `/admin/adjustments/${id}/reversal`, `/admin/drivers/${id}/reconciliation`, `/fleet/drivers`
];
describe("financial and provisioning role boundaries", () => {
  it.each(["PASSENGER", "DRIVER", "DISPATCHER", "SUPPORT", "FLEET_MANAGER", "BUSINESS_MANAGER"] as const)("denies privileged accounting and fleet enrollment for %s", async (role) => {
    const user = await prisma.user.create({ data: { phone: `fictional-${randomUUID()}`, firstName: "Fictional", lastName: "Role", passwordHash: "unusable-test", role, status: "ACTIVE" } });
    const token = (await issueTokens({ sub: user.id, role, mfa: true })).accessToken;
    for (const endpoint of deniedEndpoints(randomUUID())) await request(app).post(`/api/v1${endpoint}`).set("authorization", `Bearer ${token}`).set("idempotency-key", randomUUID()).send({ evidence: "Fictional unauthorized attempt", amountMinor: 100, outcome: "PAID" }).expect(403);
    expect(await prisma.auditLog.count({ where: { actorId: user.id, action: { in: ["CASH_COMMISSION_COLLECTED", "CASH_PAYOUT_PAID", "CASH_REFUND_RECORDED", "PAYABLE_ADJUSTED", "WALLET_RECONCILED", "FLEET_DRIVER_ASSIGNED"] } } })).toBe(0);
  });
  it("requires authentication before reading any financial identifier", async () => {
    for (const endpoint of deniedEndpoints(randomUUID())) await request(app).post(`/api/v1${endpoint}`).send({}).expect(401);
  });
});
