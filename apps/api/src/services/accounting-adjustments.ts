import { z } from "zod";
import { financialTransaction, FinancialOperationError } from "./financial-operations.js";
import { requireActiveAdministrator } from "./active-administrator.js";
import { assertWalletReconciled, credit, debit, postJournal } from "./ledger.js";

export const adjustmentSchema = z.object({
  driverId: z.uuid(), idempotencyKey: z.string().min(8).max(200),
  deltaMinor: z.number().int().min(-2_147_483_647).max(2_147_483_647).refine((amount) => amount !== 0),
  expectedBalanceMinor: z.number().int().min(-2_147_483_648).max(2_147_483_647),
  evidence: z.string().trim().min(8).max(500)
});
type Adjustment = z.infer<typeof adjustmentSchema> & { actorId: string };

export async function adjustDriverPayable(input: Adjustment) {
  adjustmentSchema.parse(input);
  return financialTransaction(async (tx) => {
    await requireActiveAdministrator(tx, input.actorId);
    const driver = await tx.driver.findUniqueOrThrow({ where: { id: input.driverId } });
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${driver.userId} FOR UPDATE`;
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: driver.userId } });
    const amount = Math.abs(input.deltaMinor);
    const lines = input.deltaMinor > 0 ? [debit("ADJUSTMENT_CLEARING", "platform", amount), credit("USER_PAYABLE", driver.userId, amount)] : [debit("USER_PAYABLE", driver.userId, amount), credit("ADJUSTMENT_CLEARING", "platform", amount)];
    const details = { idempotencyKey: `adjustment:${input.idempotencyKey}`, kind: "MANUAL_ADJUSTMENT", reference: input.driverId, currency: wallet.currency, actorId: input.actorId, evidence: input.evidence, context: { expectedBalanceMinor: input.expectedBalanceMinor }, lines };
    if (await tx.ledgerJournal.findUnique({ where: { idempotencyKey: details.idempotencyKey } })) return postJournal(tx, details);
    await assertWalletReconciled(tx, driver.userId, wallet.balanceMinor, wallet.currency);
    if (wallet.balanceMinor !== input.expectedBalanceMinor) throw new FinancialOperationError(409, "BALANCE_CHANGED", "Review the current balance before applying an adjustment");
    if (input.deltaMinor < 0 && wallet.balanceMinor < amount) throw new FinancialOperationError(422, "INSUFFICIENT_DRIVER_BALANCE", "A debit adjustment cannot spend reserved or owed money");
    if (!Number.isSafeInteger(wallet.balanceMinor + input.deltaMinor) || wallet.balanceMinor + input.deltaMinor > 2_147_483_647) throw new FinancialOperationError(422, "BALANCE_LIMIT", "Adjustment exceeds the supported wallet balance");
    const journal = await postJournal(tx, details);
    const updated = await tx.wallet.update({ where: { id: wallet.id }, data: { balanceMinor: { increment: input.deltaMinor } } });
    await tx.walletTransaction.create({ data: { walletId: wallet.id, type: "ADJUSTMENT", amountMinor: amount, balanceMinor: updated.balanceMinor, reference: `adjustment:${journal.id}`, idempotencyKey: `adjustment:${journal.id}`, description: "Audited payable adjustment", metadata: { deltaMinor: input.deltaMinor, journalId: journal.id } } });
    await tx.auditLog.create({ data: { actorId: input.actorId, action: "PAYABLE_ADJUSTED", entityType: "LedgerJournal", entityId: journal.id, metadata: { evidence: input.evidence, expectedBalanceMinor: input.expectedBalanceMinor, deltaMinor: input.deltaMinor } } });
    return journal;
  });
}

// Reversals use the original journal as the unique key and keep both postings.
export async function reversePayableAdjustment(input: { actorId: string; journalId: string; evidence: string }) {
  z.object({ journalId: z.uuid(), evidence: z.string().trim().min(8).max(500) }).parse(input);
  return financialTransaction(async (tx) => {
    await requireActiveAdministrator(tx, input.actorId);
    const original = await tx.ledgerJournal.findUniqueOrThrow({ where: { id: input.journalId }, include: { entries: true } });
    if (original.kind !== "MANUAL_ADJUSTMENT") throw new FinancialOperationError(422, "INVALID_REVERSAL", "Only a manual payable adjustment can use this reversal workflow");
    const payable = original.entries.find((entry) => entry.account === "USER_PAYABLE");
    if (!payable || original.entries.length !== 2 || original.entries.some((entry) => !["USER_PAYABLE", "ADJUSTMENT_CLEARING"].includes(entry.account))) throw new FinancialOperationError(409, "RECONCILIATION_REQUIRED", "Original adjustment must contain exactly two expected entries");
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${payable.ownerKey} FOR UPDATE`;
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: payable.ownerKey } });
    const delta = Number(payable.debitMinor - payable.creditMinor);
    const lines = original.entries.map((entry) => ({ account: entry.account as "USER_PAYABLE" | "ADJUSTMENT_CLEARING", ownerKey: entry.ownerKey, debitMinor: Number(entry.creditMinor), creditMinor: Number(entry.debitMinor) }));
    const details = { idempotencyKey: `adjustment-reversal:${original.id}`, kind: "ADJUSTMENT_REVERSAL", reference: original.id, currency: original.currency, actorId: input.actorId, evidence: input.evidence, lines };
    if (await tx.ledgerJournal.findUnique({ where: { idempotencyKey: details.idempotencyKey } })) return postJournal(tx, details);
    await assertWalletReconciled(tx, wallet.userId, wallet.balanceMinor, wallet.currency);
    if (wallet.currency !== original.currency || !Number.isSafeInteger(delta) || wallet.balanceMinor + delta > 2_147_483_647 || (delta < 0 && wallet.balanceMinor < -delta)) throw new FinancialOperationError(409, "REVERSAL_REQUIRES_RECOVERY", "Available funds or currency do not permit reversal");
    const journal = await postJournal(tx, details);
    const updated = await tx.wallet.update({ where: { id: wallet.id }, data: { balanceMinor: { increment: delta } } });
    await tx.walletTransaction.create({ data: { walletId: wallet.id, type: "ADJUSTMENT", amountMinor: Math.abs(delta), balanceMinor: updated.balanceMinor, reference: `reversal:${original.id}`, idempotencyKey: `reversal:${original.id}`, description: "Reversal of audited payable adjustment", metadata: { deltaMinor: delta, journalId: journal.id, originalJournalId: original.id } } });
    await tx.auditLog.create({ data: { actorId: input.actorId, action: "PAYABLE_ADJUSTMENT_REVERSED", entityType: "LedgerJournal", entityId: journal.id, metadata: { originalJournalId: original.id, evidence: input.evidence } } });
    return journal;
  });
}
