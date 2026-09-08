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

let adminToken: string;
let passengerToken: string;
let passengerId: string;
const period = { periodStart: "2026-08-01T00:00:00.000Z", periodEnd: "2026-09-01T00:00:00.000Z" };
const userData = () => ({ phone: `fictional-finance-${randomUUID()}`, passwordHash: "unusable-fictional-fixture", firstName: "Fictional", lastName: "Finance", status: "ACTIVE" as const });

async function driverFixture(balanceMinor = 1000) {
  const user = await prisma.user.create({ data: { ...userData(), role: "DRIVER", wallet: { create: { balanceMinor } }, driver: { create: { licenseNumber: `fictional-${randomUUID()}` } } }, include: { driver: true, wallet: true } });
  await prisma.walletTransaction.create({ data: {
    walletId: user.wallet!.id, type: "CREDIT", amountMinor: balanceMinor, balanceMinor,
    reference: randomUUID(), idempotencyKey: randomUUID(), description: "Fictional opening test balance", createdAt: new Date("2000-01-01T00:00:00.000Z")
  } });
  return { driverId: user.driver!.id, walletId: user.wallet!.id };
}

async function paidRideFixture() {
  return prisma.ride.create({ data: {
    passengerId, idempotencyKey: randomUUID(), status: "CANCELLED",
    pickupAddress: "Fictional A", pickupLatitude: 6.3, pickupLongitude: -10.8,
    destinationAddress: "Fictional B", destinationLatitude: 6.31, destinationLongitude: -10.79,
    estimatedDistanceM: 1000, estimatedDurationSec: 300,
    fareMinor: 1000, driverEarningsMinor: 860, companyCommissionMinor: 140, paymentMethod: "CASH",
    payment: { create: { provider: "CASH", idempotencyKey: randomUUID(), amountMinor: 1000, method: "CASH", status: "CAPTURED" } }
  } });
}

const payout = (driverId: string, key: string, amountMinor: number, token = adminToken) => request(app)
  .post(`/api/v1/admin/drivers/${driverId}/payouts`).set("authorization", `Bearer ${token}`)
  .set("idempotency-key", key).send({ amountMinor, ...period });
const refund = (rideId: string, key: string, amountMinor: number, token = adminToken) => request(app)
  .post(`/api/v1/rides/${rideId}/refunds`).set("authorization", `Bearer ${token}`)
  .set("idempotency-key", key).send({ amountMinor, reason: "Fictional cancelled trip" });
const review = (id: string, status: "APPROVED" | "REJECTED", token = adminToken) => request(app)
  .patch(`/api/v1/admin/refunds/${id}`).set("authorization", `Bearer ${token}`).send({ status });

describe.sequential("financial HTTP invariants", () => {
  beforeAll(async () => {
    const admin = await prisma.user.create({ data: { ...userData(), role: "ADMIN" } });
    const passenger = await prisma.user.create({ data: { ...userData(), role: "PASSENGER" } });
    passengerId = passenger.id;
    adminToken = (await issueTokens({ sub: admin.id, role: admin.role, mfa: true })).accessToken;
    passengerToken = (await issueTokens({ sub: passenger.id, role: passenger.role })).accessToken;
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("replays a payout after the wallet is drained without a second debit or audit", async () => {
    const driver = await driverFixture();
    const key = randomUUID();
    const first = await payout(driver.driverId, key, 1000).expect(201);
    const replay = await payout(driver.driverId, key, 1000).expect(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: driver.walletId } })).balanceMinor).toBe(0);
    expect(await prisma.walletTransaction.count({ where: { walletId: driver.walletId, type: "PAYOUT" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "DRIVER_PAYOUT_CREATED", entityId: first.body.data.id } })).toBe(1);
    await payout(driver.driverId, key, 999).expect(409);
    await request(app).post(`/api/v1/admin/drivers/${driver.driverId}/payouts`)
      .set("authorization", `Bearer ${adminToken}`).set("idempotency-key", key)
      .send({ amountMinor: 1000, ...period, periodEnd: "2026-09-02T00:00:00.000Z" }).expect(409);
    const other = await driverFixture();
    await payout(other.driverId, key, 1000).expect(409);
  });

  it("allows only one payout when concurrent reservations exceed the wallet", async () => {
    const driver = await driverFixture();
    const responses = await Promise.all([payout(driver.driverId, randomUUID(), 800), payout(driver.driverId, randomUUID(), 800)]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: driver.walletId } })).balanceMinor).toBe(200);
    expect(await prisma.driverPayout.count({ where: { driverId: driver.driverId } })).toBe(1);
    expect(await prisma.walletTransaction.count({ where: { walletId: driver.walletId, type: "PAYOUT" } })).toBe(1);
  });

  it("returns one payout for concurrent identical requests", async () => {
    const driver = await driverFixture();
    const key = randomUUID();
    const responses = await Promise.all([payout(driver.driverId, key, 1000), payout(driver.driverId, key, 1000)]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(new Set(responses.map((response) => response.body.data.id)).size).toBe(1);
    expect(await prisma.walletTransaction.count({ where: { walletId: driver.walletId, type: "PAYOUT" } })).toBe(1);
  });

  it("rolls back the losing wallet when two drivers concurrently reuse a payout key", async () => {
    const first = await driverFixture();
    const second = await driverFixture();
    const key = randomUUID();
    const responses = await Promise.all([payout(first.driverId, key, 1000), payout(second.driverId, key, 1000)]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const wallets = await prisma.wallet.findMany({ where: { id: { in: [first.walletId, second.walletId] } } });
    expect(wallets.map((wallet) => wallet.balanceMinor).sort((a, b) => a - b)).toEqual([0, 1000]);
    expect(await prisma.walletTransaction.count({ where: { walletId: { in: [first.walletId, second.walletId] }, type: "PAYOUT" } })).toBe(1);
  });

  it("replays a full refund and rejects changed or cross-ride key reuse", async () => {
    const ride = await paidRideFixture();
    const key = randomUUID();
    const first = await refund(ride.id, key, 1000).expect(201);
    const replay = await refund(ride.id, key, 1000).expect(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(await prisma.auditLog.count({ where: { action: "REFUND_REQUESTED", entityId: first.body.data.id } })).toBe(1);
    await refund(ride.id, key, 500).expect(409);
    await request(app).post(`/api/v1/rides/${ride.id}/refunds`)
      .set("authorization", `Bearer ${adminToken}`).set("idempotency-key", key)
      .send({ amountMinor: 1000, reason: "A different fictional request" }).expect(409);
    const other = await paidRideFixture();
    await refund(other.id, key, 1000).expect(409);
  });

  it("caps concurrent refunds at the captured amount", async () => {
    const ride = await paidRideFixture();
    const responses = await Promise.all([refund(ride.id, randomUUID(), 600), refund(ride.id, randomUUID(), 600)]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);
    expect((await prisma.refund.aggregate({ where: { rideId: ride.id }, _sum: { amountMinor: true } }))._sum.amountMinor).toBe(600);
  });

  it("returns one full refund for concurrent identical requests", async () => {
    const ride = await paidRideFixture();
    const key = randomUUID();
    const responses = await Promise.all([refund(ride.id, key, 1000), refund(ride.id, key, 1000)]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const ids = responses.map((response) => response.body.data.id as string);
    expect(new Set(ids).size).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "REFUND_REQUESTED", entityId: ids[0]! } })).toBe(1);
  });

  it("makes a refund review final and replayable with one audit", async () => {
    const ride = await paidRideFixture();
    const created = await refund(ride.id, randomUUID(), 1000).expect(201);
    const id = created.body.data.id as string;
    const responses = await Promise.all([review(id, "APPROVED"), review(id, "APPROVED")]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await prisma.auditLog.count({ where: { action: "REFUND_APPROVED", entityId: id } })).toBe(1);
    await review(id, "REJECTED").expect(409);
    await prisma.refund.update({ where: { id }, data: { status: "COMPLETED" } });
    await review(id, "APPROVED").expect(409);
    await review(id, "REJECTED").expect(409);
    await review(randomUUID(), "APPROVED").expect(404);
  });

  it("does not reopen a rejected refund after its amount is reserved elsewhere", async () => {
    const ride = await paidRideFixture();
    const rejected = await refund(ride.id, randomUUID(), 1000).expect(201);
    await review(rejected.body.data.id, "REJECTED").expect(200);
    await refund(ride.id, randomUUID(), 1000).expect(201);
    await review(rejected.body.data.id, "APPROVED").expect(409);
  });

  it("keeps passenger requests outside privileged financial operations", async () => {
    const driver = await driverFixture();
    const ride = await paidRideFixture();
    await payout(driver.driverId, randomUUID(), 100, passengerToken).expect(403);
    await refund(ride.id, randomUUID(), 100, passengerToken).expect(403);
    await review(randomUUID(), "APPROVED", passengerToken).expect(403);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: driver.walletId } })).balanceMinor).toBe(1000);
  });
});
