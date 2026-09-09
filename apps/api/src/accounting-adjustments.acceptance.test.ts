import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "./lib.js";
import { adjustDriverPayable, reversePayableAdjustment } from "./services/accounting-adjustments.js";
import { reconcileDriverWallet } from "./services/reconciliation.js";
afterAll(() => prisma.$disconnect());
async function fixture() {
  const base = { firstName: "Fictional", lastName: "Adjustment", passwordHash: "unusable-test", status: "ACTIVE" as const };
  const admin = await prisma.user.create({ data: { ...base, role: "ADMIN", phone: `fictional-${randomUUID()}` } });
  const user = await prisma.user.create({ data: { ...base, role: "DRIVER", phone: `fictional-${randomUUID()}`, wallet: { create: {} }, driver: { create: { licenseNumber: randomUUID() } } }, include: { driver: true } });
  const input = { actorId: admin.id, driverId: user.driver!.id, idempotencyKey: randomUUID(), deltaMinor: 100, expectedBalanceMinor: 0, evidence: "Fictional approved payable correction" };
  return { admin, user, input };
}
describe("audited accounting adjustments and reconciliation", () => {
  it("applies and reverses an adjustment once under concurrent retries", async () => {
    const f = await fixture();
    const posted = await Promise.all([adjustDriverPayable(f.input), adjustDriverPayable(f.input)]);
    expect(posted[0].id).toBe(posted[1].id);
    await expect(adjustDriverPayable({ ...f.input, expectedBalanceMinor: 100 })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    const reverse = { actorId: f.admin.id, journalId: posted[0].id, evidence: "Fictional correction reversal approved" };
    const reversed = await Promise.all([reversePayableAdjustment(reverse), reversePayableAdjustment(reverse)]);
    expect(reversed[0].id).toBe(reversed[1].id);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: f.user.id } })).balanceMinor).toBe(0);
    expect(await prisma.ledgerJournal.count({ where: { id: { in: [posted[0].id, reversed[0].id] } } })).toBe(2);
    expect(await prisma.walletTransaction.count({ where: { wallet: { userId: f.user.id } } })).toBe(2);
  });
  it("rejects a stale reviewed balance and an adjustment spending unavailable funds", async () => {
    const f = await fixture();
    await expect(adjustDriverPayable({ ...f.input, deltaMinor: -1 })).rejects.toMatchObject({ code: "INSUFFICIENT_DRIVER_BALANCE" });
    await adjustDriverPayable(f.input);
    await expect(adjustDriverPayable({ ...f.input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "BALANCE_CHANGED" });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: f.user.id } })).balanceMinor).toBe(100);
  });
  it("records an idempotent reconciliation snapshot and detects unexplained changes", async () => {
    const f = await fixture(); await adjustDriverPayable(f.input);
    const input = { actorId: f.admin.id, driverId: f.user.driver!.id, idempotencyKey: randomUUID() };
    const snapshots = await Promise.all([reconcileDriverWallet(input), reconcileDriverWallet(input)]);
    const first = snapshots[0]; expect(snapshots[1]).toEqual(first);
    expect(first).toMatchObject({ reconciled: true, differenceMinor: "0", payableMinor: "100", electronicProvidersCertified: false });
    await prisma.wallet.update({ where: { userId: f.user.id }, data: { balanceMinor: 101 } });
    expect(await reconcileDriverWallet(input)).toEqual(first);
    expect(await reconcileDriverWallet({ ...input, idempotencyKey: randomUUID() })).toMatchObject({ reconciled: false, differenceMinor: "1" });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: f.user.id } })).balanceMinor).toBe(101);
    expect(await prisma.auditLog.count({ where: { id: input.idempotencyKey } })).toBe(1);
  });
  it("does not permit driver-authored adjustments or privileged reconciliation", async () => {
    const f = await fixture();
    await expect(adjustDriverPayable({ ...f.input, actorId: f.user.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reconcileDriverWallet({ actorId: f.user.id, driverId: f.user.driver!.id, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: f.user.id } })).balanceMinor).toBe(0);
  });
});
