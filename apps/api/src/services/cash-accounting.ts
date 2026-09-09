import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { calculateSplit } from "../lib.js";
import { FinancialOperationError, financialTransaction } from "./financial-operations.js";
import { requireActiveAdministrator } from "./active-administrator.js";
import { accountNetDebit, assertWalletReconciled, credit, debit, postJournal, type LedgerLine } from "./ledger.js";

export const cashEvidenceSchema = z.object({
  idempotencyKey: z.string().min(8).max(200), evidence: z.string().trim().min(8).max(500)
});
const money = z.number().int().positive().max(2_147_483_647);
type Evidence = z.infer<typeof cashEvidenceSchema> & { actorId: string };

async function lockedWallet(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
  const wallet = await tx.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new FinancialOperationError(409, "WALLET_NOT_FOUND", "Driver wallet does not exist");
  return wallet;
}
async function audit(tx: Prisma.TransactionClient, actorId: string, action: string, entityId: string, evidence: string) {
  await tx.auditLog.create({ data: { actorId, action, entityType: "LedgerJournal", entityId, metadata: { evidence } } });
}
async function walletCredit(tx: Prisma.TransactionClient, walletId: string, amountMinor: number, reference: string, description: string) {
  if (amountMinor === 0) return;
  const wallet = await tx.wallet.update({ where: { id: walletId }, data: { balanceMinor: { increment: amountMinor } } });
  await tx.walletTransaction.create({ data: { walletId, type: "CREDIT", amountMinor, balanceMinor: wallet.balanceMinor, reference, idempotencyKey: reference, description } });
}

// Records an evidenced physical cash handover. It never initiates a transfer.
export async function recordCashCommission(input: Evidence & { driverId: string; amountMinor: number }) {
  cashEvidenceSchema.parse(input); money.parse(input.amountMinor);
  return financialTransaction(async (tx) => {
    await requireActiveAdministrator(tx, input.actorId);
    const driver = await tx.driver.findUniqueOrThrow({ where: { id: input.driverId } });
    const wallet = await lockedWallet(tx, driver.userId);
    const details = { idempotencyKey: `cash-collection:${input.idempotencyKey}`, kind: "CASH_COMMISSION_COLLECTED", reference: input.driverId, currency: wallet.currency, actorId: input.actorId, evidence: input.evidence, lines: [debit("BANK_CASH", "platform", input.amountMinor), credit("CASH_COMMISSION_RECEIVABLE", driver.userId, input.amountMinor)] };
    if (await tx.ledgerJournal.findUnique({ where: { idempotencyKey: details.idempotencyKey } })) return postJournal(tx, details);
    await assertWalletReconciled(tx, driver.userId, wallet.balanceMinor, wallet.currency);
    if (await accountNetDebit(tx, "CASH_COMMISSION_RECEIVABLE", driver.userId, wallet.currency) < BigInt(input.amountMinor)) throw new FinancialOperationError(422, "COLLECTION_EXCEEDS_RECEIVABLE", "Collection exceeds outstanding cash commission");
    const journal = await postJournal(tx, details);
    await walletCredit(tx, wallet.id, input.amountMinor, `collection:${journal.id}`, "Cash commission handed to company");
    await audit(tx, input.actorId, details.kind, journal.id, input.evidence);
    return journal;
  });
}

export async function resolveCashPayout(input: Evidence & { payoutId: string; outcome: "PAID" | "CANCELLED" }) {
  cashEvidenceSchema.parse(input);
  return financialTransaction(async (tx) => {
    await requireActiveAdministrator(tx, input.actorId);
    await tx.$queryRaw`SELECT id FROM "DriverPayout" WHERE id = ${input.payoutId} FOR UPDATE`;
    const payout = await tx.driverPayout.findUniqueOrThrow({ where: { id: input.payoutId }, include: { driver: true } });
    const wallet = await lockedWallet(tx, payout.driver.userId);
    const details = { idempotencyKey: `payout-resolution:${input.idempotencyKey}`, kind: input.outcome === "PAID" ? "CASH_PAYOUT_PAID" : "PAYOUT_RESERVATION_REVERSED", reference: payout.id, currency: payout.currency, actorId: input.actorId, evidence: input.evidence, lines: [debit("PAYOUT_PAYABLE", payout.id, payout.amountMinor), credit(input.outcome === "PAID" ? "BANK_CASH" : "USER_PAYABLE", input.outcome === "PAID" ? "platform" : payout.driver.userId, payout.amountMinor)] };
    if (await tx.ledgerJournal.findUnique({ where: { idempotencyKey: details.idempotencyKey } })) return postJournal(tx, details);
    if (payout.status !== "PENDING") throw new FinancialOperationError(409, "PAYOUT_FINAL", "Only a pending payout can be resolved");
    if (wallet.currency !== payout.currency) throw new FinancialOperationError(409, "CURRENCY_MISMATCH", "Payout and wallet currencies must match");
    await assertWalletReconciled(tx, payout.driver.userId, wallet.balanceMinor, payout.currency);
    if (-await accountNetDebit(tx, "PAYOUT_PAYABLE", payout.id, payout.currency) !== BigInt(payout.amountMinor)) throw new FinancialOperationError(409, "PAYOUT_RECONCILIATION_REQUIRED", "Payout reservation must match its ledger");
    // Serialize company cash disbursements across different driver wallets.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"company-cash:" + payout.currency}, 0))::text`;
    if (input.outcome === "PAID" && await accountNetDebit(tx, "BANK_CASH", "platform", payout.currency) < BigInt(payout.amountMinor)) throw new FinancialOperationError(422, "INSUFFICIENT_COMPANY_CASH", "Recorded company cash is insufficient");
    const journal = await postJournal(tx, details);
    await tx.driverPayout.update({ where: { id: payout.id }, data: { status: input.outcome, processedAt: new Date(), providerRef: `cash-ledger:${journal.id}` } });
    if (input.outcome === "CANCELLED") await walletCredit(tx, wallet.id, payout.amountMinor, `payout-release:${payout.id}`, "Cancelled payout reservation returned");
    await audit(tx, input.actorId, details.kind, journal.id, input.evidence);
    return journal;
  });
}

export async function recordDriverCashRefund(input: Evidence & { refundId: string }) {
  cashEvidenceSchema.parse(input);
  return financialTransaction(async (tx) => {
    await requireActiveAdministrator(tx, input.actorId);
    const lookup = await tx.refund.findUniqueOrThrow({ where: { id: input.refundId } });
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${lookup.paymentId} FOR UPDATE`;
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: input.refundId }, include: { payment: true, ride: { include: { driver: true } } } });
    const existing = await tx.ledgerJournal.findUnique({ where: { idempotencyKey: `cash-refund:${input.idempotencyKey}` } });
    if (existing) {
      if (existing.reference !== refund.id || existing.actorId !== input.actorId || (existing.metadata as { evidence?: string }).evidence !== input.evidence) throw new FinancialOperationError(409, "IDEMPOTENCY_KEY_REUSED", "Refund key belongs to different details");
      return existing;
    }
    if (refund.status !== "APPROVED" || !refund.payment || refund.payment.method !== "CASH" || refund.payment.status !== "CAPTURED" || !refund.ride.driver || refund.ride.status !== "COMPLETED") throw new FinancialOperationError(409, "CASH_REFUND_NOT_READY", "An approved refund of a completed cash ride is required");
    if (!await tx.ledgerJournal.findUnique({ where: { idempotencyKey: `settlement:${refund.rideId}` } })) throw new FinancialOperationError(409, "SETTLEMENT_RECONCILIATION_REQUIRED", "Original settlement must be reconciled first");
    const driver = refund.ride.driver.userId; const wallet = await lockedWallet(tx, driver);
    if (wallet.currency !== refund.payment.currency) throw new FinancialOperationError(409, "CURRENCY_MISMATCH", "Refund and wallet currencies must match");
    await assertWalletReconciled(tx, driver, wallet.balanceMinor, refund.payment.currency);
    const completed = await tx.refund.aggregate({ where: { paymentId: refund.paymentId, status: "COMPLETED" }, _sum: { amountMinor: true } });
    const before = completed._sum.amountMinor ?? 0; const after = before + refund.amountMinor;
    if (after > refund.payment.amountMinor) throw new FinancialOperationError(422, "REFUND_EXCEEDS_PAYMENT", "Refund exceeds payment");
    // Cumulative rounding makes arbitrary partial refunds conserve the original commission.
    const company = calculateSplit(refund.payment.amountMinor - before).companyCommissionMinor - calculateSplit(refund.payment.amountMinor - after).companyCommissionMinor;
    const owed = await accountNetDebit(tx, "CASH_COMMISSION_RECEIVABLE", driver, refund.payment.currency);
    const receivableRelease = Math.min(company, Number(owed > 0n ? owed : 0n));
    const lines: LedgerLine[] = [debit("REFUND_CLEARING", refund.id, refund.amountMinor), credit("DRIVER_CASH_CLEARING", driver, refund.amountMinor), debit("DRIVER_CASH_CLEARING", driver, refund.amountMinor - company), debit("COMPANY_COMMISSION", "platform", company), credit("REFUND_CLEARING", refund.id, refund.amountMinor), debit("DRIVER_CASH_CLEARING", driver, company), credit("CASH_COMMISSION_RECEIVABLE", driver, receivableRelease), credit("USER_PAYABLE", driver, company - receivableRelease)];
    const journal = await postJournal(tx, { idempotencyKey: `cash-refund:${input.idempotencyKey}`, kind: "CASH_REFUND_RECORDED", reference: refund.id, currency: refund.payment.currency, actorId: input.actorId, evidence: input.evidence, lines: lines.filter((line) => line.debitMinor + line.creditMinor > 0) });
    await tx.refund.update({ where: { id: refund.id }, data: { status: "COMPLETED", providerRef: `cash-ledger:${journal.id}` } });
    if (after === refund.payment.amountMinor) await tx.payment.update({ where: { id: refund.payment.id }, data: { status: "REFUNDED" } });
    await walletCredit(tx, wallet.id, company, `refund-commission:${refund.id}`, "Commission reversed for cash returned by driver to passenger");
    await audit(tx, input.actorId, "CASH_REFUND_RECORDED", journal.id, input.evidence);
    return journal;
  });
}
