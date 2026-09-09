import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "./lib.js";
import { accountNetDebit, credit, debit, postJournal, postRideSettlement } from "./services/ledger.js";
afterAll(() => prisma.$disconnect());
const journal = () => ({ idempotencyKey: randomUUID(), kind: "TEST_ADJUSTMENT", reference: randomUUID(), currency: "LRD", actorId: "fictional-admin", evidence: "fictional opening accounting fixture", lines: [debit("BANK_CASH", "platform", 1000), credit("ADJUSTMENT_CLEARING", "platform", 1000)] });

describe("PostgreSQL append-only balanced ledger", () => {
  it("posts one journal under simultaneous idempotent retries and rejects changed details", async () => {
    const input = journal();
    const results = await Promise.all([prisma.$transaction((tx) => postJournal(tx, input)), prisma.$transaction((tx) => postJournal(tx, input))]);
    expect(results[0].id).toBe(results[1].id);
    expect(await prisma.ledgerEntry.count({ where: { journalId: results[0].id } })).toBe(2);
    await expect(prisma.$transaction((tx) => postJournal(tx, { ...input, evidence: "different evidence" }))).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });
  it("rejects unbalanced and non-integer service inputs", async () => {
    const input = journal();
    await expect(prisma.$transaction((tx) => postJournal(tx, { ...input, lines: [debit("BANK_CASH", "platform", 1000), credit("ADJUSTMENT_CLEARING", "platform", 999)] }))).rejects.toMatchObject({ code: "UNBALANCED_LEDGER" });
    await expect(prisma.$transaction((tx) => postJournal(tx, { ...input, lines: [debit("BANK_CASH", "platform", 1.1), credit("ADJUSTMENT_CLEARING", "platform", 1.1)] }))).rejects.toMatchObject({ code: "INVALID_LEDGER_ENTRY" });
    expect(await prisma.ledgerJournal.count({ where: { idempotencyKey: input.idempotencyKey } })).toBe(0);
  });
  it("enforces balance in PostgreSQL even when the service is bypassed", async () => {
    const key = randomUUID();
    await expect(prisma.ledgerJournal.create({ data: { idempotencyKey: key, requestHash: "fictional", kind: "TEST", reference: key, currency: "LRD", actorId: "fictional", metadata: {}, entries: { create: [{ account: "BANK_CASH", ownerKey: "platform", debitMinor: 1000 }, { account: "ADJUSTMENT_CLEARING", ownerKey: "platform", creditMinor: 999 }] } } })).rejects.toThrow();
    expect(await prisma.ledgerJournal.count({ where: { idempotencyKey: key } })).toBe(0);
  });
  it("rejects changes, deletion and adding balanced lines to an already posted journal", async () => {
    const posted = await prisma.$transaction((tx) => postJournal(tx, journal()));
    await expect(prisma.ledgerJournal.update({ where: { id: posted.id }, data: { kind: "ALTERED" } })).rejects.toThrow();
    await expect(prisma.ledgerEntry.deleteMany({ where: { journalId: posted.id } })).rejects.toThrow();
    await expect(prisma.ledgerEntry.createMany({ data: [{ journalId: posted.id, account: "BANK_CASH", ownerKey: "platform", debitMinor: 1 }, { journalId: posted.id, account: "ADJUSTMENT_CLEARING", ownerKey: "platform", creditMinor: 1 }] })).rejects.toThrow();
    expect(await prisma.ledgerEntry.count({ where: { journalId: posted.id } })).toBe(2);
  });
  it.each([true, false])("preserves driver 86%% and company 14%% with cash=%s", async (cash) => {
    const driver = randomUUID(); const rideId = randomUUID();
    await prisma.$transaction(async (tx) => {
      await postRideSettlement(tx, { rideId, driverUserId: driver, actorId: "fictional", currency: "LRD", cash, fareMinor: 1000, driverMinor: 860, companyMinor: 140 });
      expect(await accountNetDebit(tx, "USER_PAYABLE", driver, "LRD")).toBe(cash ? 0n : -860n);
      expect(await accountNetDebit(tx, "CASH_COMMISSION_RECEIVABLE", driver, "LRD")).toBe(cash ? 140n : 0n);
      expect(await accountNetDebit(tx, "DRIVER_CASH_CLEARING", driver, "LRD")).toBe(0n);
      const entries = await tx.ledgerEntry.findMany({ where: { journal: { reference: rideId }, account: "COMPANY_COMMISSION" } });
      expect(entries.reduce((sum, entry) => sum + entry.creditMinor, 0n)).toBe(140n);
    });
  });
  it("rolls accounting back with the enclosing business transaction", async () => {
    const input = journal();
    await expect(prisma.$transaction(async (tx) => { await postJournal(tx, input); throw new Error("fictional business failure"); })).rejects.toThrow("fictional business failure");
    expect(await prisma.ledgerJournal.count({ where: { idempotencyKey: input.idempotencyKey } })).toBe(0);
  });
});
