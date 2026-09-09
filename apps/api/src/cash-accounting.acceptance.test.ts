import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "./lib.js";
import { accountNetDebit, postRideSettlement } from "./services/ledger.js";
import { requestDriverPayout, requestRefund, reviewRefund } from "./services/financial-operations.js";
import { recordCashCommission, recordDriverCashRefund, resolveCashPayout } from "./services/cash-accounting.js";
afterAll(() => prisma.$disconnect());
const evidence = (actorId: string) => ({ actorId, idempotencyKey: randomUUID(), evidence: `fictional signed cash handover ${randomUUID()}` });
async function fixture() {
  const base = { firstName: "Fictional", lastName: "Accounting", passwordHash: "unusable-test", status: "ACTIVE" as const };
  const admin = await prisma.user.create({ data: { ...base, phone: `fictional-${randomUUID()}`, role: "ADMIN" } });
  const user = await prisma.user.create({ data: { ...base, phone: `fictional-${randomUUID()}`, role: "DRIVER", wallet: { create: { balanceMinor: -140 } }, driver: { create: { licenseNumber: randomUUID() } } }, include: { driver: true, wallet: true } });
  const passenger = await prisma.user.create({ data: { ...base, phone: `fictional-${randomUUID()}`, role: "PASSENGER" } });
  const ride = await prisma.ride.create({ data: { passengerId: passenger.id, driverId: user.driver!.id, idempotencyKey: randomUUID(), status: "COMPLETED", pickupAddress: "Fictional A", pickupLatitude: 0, pickupLongitude: 0, destinationAddress: "Fictional B", destinationLatitude: 0, destinationLongitude: 0, estimatedDistanceM: 1000, estimatedDurationSec: 300, fareMinor: 1000, driverEarningsMinor: 860, companyCommissionMinor: 140, paymentMethod: "CASH", payment: { create: { provider: "CASH", method: "CASH", status: "CAPTURED", amountMinor: 1000, idempotencyKey: randomUUID() } } } });
  await prisma.$transaction((tx) => postRideSettlement(tx, { rideId: ride.id, driverUserId: user.id, actorId: admin.id, currency: "LRD", cash: true, fareMinor: 1000, driverMinor: 860, companyMinor: 140 }));
  return { admin, user, ride, passenger };
}
async function approvedRefund(f: Awaited<ReturnType<typeof fixture>>, amountMinor: number) {
  const refund = await requestRefund({ actorId: f.admin.id, rideId: f.ride.id, amountMinor, reason: "Fictional passenger refund", idempotencyKey: randomUUID() });
  await reviewRefund({ actorId: f.admin.id, refundId: refund.id, status: "APPROVED" });
  return refund;
}
async function balance(userId: string) { return (await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balanceMinor; }
const payoutPeriod = { periodStart: new Date("2026-01-01T00:00:00Z"), periodEnd: new Date("2026-02-01T00:00:00Z") };

describe.sequential("cash settlement accounting", () => {
  it("collects commission once under concurrent retries and rejects changed amounts", async () => {
    const f = await fixture(); const input = { ...evidence(f.admin.id), driverId: f.user.driver!.id, amountMinor: 140 };
    const results = await Promise.all([recordCashCommission(input), recordCashCommission(input)]);
    expect(results[0].id).toBe(results[1].id); expect(await balance(f.user.id)).toBe(0);
    await expect(recordCashCommission({ ...input, amountMinor: 139 })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(await prisma.auditLog.count({ where: { entityId: results[0].id, action: "CASH_COMMISSION_COLLECTED" } })).toBe(1);
    await expect(recordCashCommission({ ...input, idempotencyKey: randomUUID(), amountMinor: 1 })).rejects.toMatchObject({ code: "COLLECTION_EXCEEDS_RECEIVABLE" });
  });
  it("refunds uncollected commission without creating a payout liability", async () => {
    const f = await fixture(); const refund = await approvedRefund(f, 1000); const input = { ...evidence(f.admin.id), refundId: refund.id };
    const results = await Promise.all([recordDriverCashRefund(input), recordDriverCashRefund(input)]);
    expect(results[0].id).toBe(results[1].id); expect(await balance(f.user.id)).toBe(0);
    expect((await prisma.payment.findUniqueOrThrow({ where: { rideId: f.ride.id } })).status).toBe("REFUNDED");
    await prisma.$transaction(async (tx) => {
      expect(await accountNetDebit(tx, "USER_PAYABLE", f.user.id, "LRD")).toBe(0n);
      expect(await accountNetDebit(tx, "CASH_COMMISSION_RECEIVABLE", f.user.id, "LRD")).toBe(0n);
    });
    await expect(recordDriverCashRefund({ ...input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "CASH_REFUND_NOT_READY" });
  });
  it("conserves commission across partial refunds regardless of rounding", async () => {
    const f = await fixture();
    for (const amount of [1, 2, 7, 333, 657]) {
      const refund = await approvedRefund(f, amount);
      await recordDriverCashRefund({ ...evidence(f.admin.id), refundId: refund.id });
    }
    expect(await balance(f.user.id)).toBe(0);
    const reversed = await prisma.ledgerEntry.aggregate({ where: { account: "COMPANY_COMMISSION", journal: { reference: { in: (await prisma.refund.findMany({ where: { rideId: f.ride.id } })).map((refund) => refund.id) } } }, _sum: { debitMinor: true } });
    expect(reversed._sum.debitMinor).toBe(140n);
  });
  it("turns already-remitted refunded commission into a payable and pays it once", async () => {
    const f = await fixture();
    await recordCashCommission({ ...evidence(f.admin.id), driverId: f.user.driver!.id, amountMinor: 140 });
    const refund = await approvedRefund(f, 1000);
    await recordDriverCashRefund({ ...evidence(f.admin.id), refundId: refund.id });
    expect(await balance(f.user.id)).toBe(140);
    const payout = await requestDriverPayout({ actorId: f.admin.id, driverId: f.user.driver!.id, amountMinor: 140, idempotencyKey: randomUUID(), ...payoutPeriod });
    expect(await balance(f.user.id)).toBe(0);
    const input = { ...evidence(f.admin.id), payoutId: payout.id, outcome: "PAID" as const };
    const results = await Promise.all([resolveCashPayout(input), resolveCashPayout(input)]);
    expect(results[0].id).toBe(results[1].id);
    expect((await prisma.driverPayout.findUniqueOrThrow({ where: { id: payout.id } })).status).toBe("PAID");
    await expect(resolveCashPayout({ ...input, idempotencyKey: randomUUID(), outcome: "CANCELLED" })).rejects.toMatchObject({ code: "PAYOUT_FINAL" });
  });
  it("cancels a reservation exactly once and restores the driver's payable", async () => {
    const f = await fixture();
    await recordCashCommission({ ...evidence(f.admin.id), driverId: f.user.driver!.id, amountMinor: 140 });
    const refund = await approvedRefund(f, 1000); await recordDriverCashRefund({ ...evidence(f.admin.id), refundId: refund.id });
    const payout = await requestDriverPayout({ actorId: f.admin.id, driverId: f.user.driver!.id, amountMinor: 140, idempotencyKey: randomUUID(), ...payoutPeriod });
    const input = { ...evidence(f.admin.id), payoutId: payout.id, outcome: "CANCELLED" as const };
    await Promise.all([resolveCashPayout(input), resolveCashPayout(input)]);
    expect(await balance(f.user.id)).toBe(140);
    expect(await prisma.walletTransaction.count({ where: { reference: `payout-release:${payout.id}` } })).toBe(1);
  });
  it("rejects unexplained wallet balances before reserving money", async () => {
    const f = await fixture(); await prisma.wallet.update({ where: { userId: f.user.id }, data: { balanceMinor: 1000 } });
    await expect(requestDriverPayout({ actorId: f.admin.id, driverId: f.user.driver!.id, amountMinor: 1000, idempotencyKey: randomUUID(), ...payoutPeriod })).rejects.toMatchObject({ code: "WALLET_RECONCILIATION_REQUIRED" });
    expect(await balance(f.user.id)).toBe(1000);
    expect(await prisma.driverPayout.count({ where: { driverId: f.user.driver!.id } })).toBe(0);
  });
  it("rejects non-admin and suspended actors without financial mutation", async () => {
    const f = await fixture();
    await expect(recordCashCommission({ ...evidence(f.passenger.id), driverId: f.user.driver!.id, amountMinor: 140 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await prisma.user.update({ where: { id: f.admin.id }, data: { status: "SUSPENDED" } });
    await expect(recordCashCommission({ ...evidence(f.admin.id), driverId: f.user.driver!.id, amountMinor: 140 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await balance(f.user.id)).toBe(-140);
  });
});
