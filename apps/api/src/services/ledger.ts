import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { FinancialOperationError } from "./financial-error.js";
import { calculateSplit } from "../lib.js";

export type LedgerAccount = "PASSENGER_PAYMENT_CLEARING" | "DRIVER_CASH_CLEARING" | "PROVIDER_CLEARING" | "USER_PAYABLE" | "COMPANY_COMMISSION" | "REFERRAL_EXPENSE" | "INCENTIVE_EXPENSE" | "CASH_COMMISSION_RECEIVABLE" | "PAYOUT_PAYABLE" | "BANK_CASH" | "REFUND_CLEARING" | "ADJUSTMENT_CLEARING";
export type LedgerLine = { account: LedgerAccount; ownerKey: string; debitMinor: number; creditMinor: number };
type JournalInput = { idempotencyKey: string; kind: string; reference: string; currency: string; actorId: string; evidence: string; context?: Prisma.InputJsonObject; lines: LedgerLine[] };
export const debit = (account: LedgerAccount, ownerKey: string, amount: number): LedgerLine => ({ account, ownerKey, debitMinor: amount, creditMinor: 0 });
export const credit = (account: LedgerAccount, ownerKey: string, amount: number): LedgerLine => ({ account, ownerKey, debitMinor: 0, creditMinor: amount });

// Caller owns the financial transaction and any wallet/payment row locks.
export async function postJournal(tx: Prisma.TransactionClient, input: JournalInput) {
  if (!input.lines.every((line) => Number.isSafeInteger(line.debitMinor) && Number.isSafeInteger(line.creditMinor) && line.debitMinor >= 0 && line.creditMinor >= 0 && ((line.debitMinor > 0) !== (line.creditMinor > 0)))) throw new FinancialOperationError(422, "INVALID_LEDGER_ENTRY", "Ledger entries require positive integer minor units on exactly one side");
  if (input.lines.length < 2 || input.lines.reduce((net, line) => net + BigInt(line.debitMinor) - BigInt(line.creditMinor), 0n) !== 0n) throw new FinancialOperationError(422, "UNBALANCED_LEDGER", "Debits and credits must balance");
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))::text`;
  const existing = await tx.ledgerJournal.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.requestHash !== requestHash) throw new FinancialOperationError(409, "IDEMPOTENCY_KEY_REUSED", "Ledger key belongs to different accounting details");
    return existing;
  }
  return tx.ledgerJournal.create({ data: {
    idempotencyKey: input.idempotencyKey, requestHash, kind: input.kind, reference: input.reference,
    currency: input.currency, actorId: input.actorId, metadata: { evidence: input.evidence, ...(input.context ? { context: input.context } : {}) },
    entries: { create: input.lines }
  } });
}

export async function accountNetDebit(tx: Prisma.TransactionClient, account: LedgerAccount, ownerKey: string, currency: string) {
  const sum = await tx.ledgerEntry.aggregate({ where: { account, ownerKey, journal: { currency } }, _sum: { debitMinor: true, creditMinor: true } });
  return (sum._sum.debitMinor ?? 0n) - (sum._sum.creditMinor ?? 0n);
}

export async function assertWalletReconciled(tx: Prisma.TransactionClient, userId: string, balanceMinor: number, currency: string) {
  const payable = -await accountNetDebit(tx, "USER_PAYABLE", userId, currency);
  const receivable = await accountNetDebit(tx, "CASH_COMMISSION_RECEIVABLE", userId, currency);
  if (payable - receivable !== BigInt(balanceMinor)) throw new FinancialOperationError(409, "WALLET_RECONCILIATION_REQUIRED", "Wallet requires an audited reconciliation before funds can move");
}

export async function postRideSettlement(tx: Prisma.TransactionClient, input: { rideId: string; driverUserId: string; actorId: string; currency: string; cash: boolean; fareMinor: number; driverMinor: number; companyMinor: number }) {
  const split = calculateSplit(input.fareMinor);
  if (input.driverMinor !== split.driverEarningsMinor || input.companyMinor !== split.companyCommissionMinor) throw new FinancialOperationError(422, "INVALID_FARE_SPLIT", "Settlement must preserve the 86/14 fare split");
  if (input.fareMinor === 0) return;
  if (input.driverMinor + input.companyMinor !== input.fareMinor) throw new FinancialOperationError(422, "INVALID_FARE_SPLIT", "Fare allocations must balance");
  const driver = input.driverUserId;
  const lines = [
    debit(input.cash ? "DRIVER_CASH_CLEARING" : "PROVIDER_CLEARING", input.cash ? driver : "platform", input.fareMinor),
    credit("PASSENGER_PAYMENT_CLEARING", input.rideId, input.fareMinor),
    debit("PASSENGER_PAYMENT_CLEARING", input.rideId, input.fareMinor),
    credit("USER_PAYABLE", driver, input.driverMinor), credit("COMPANY_COMMISSION", "platform", input.companyMinor)
  ];
  if (input.cash) lines.push(debit("USER_PAYABLE", driver, input.driverMinor), credit("DRIVER_CASH_CLEARING", driver, input.driverMinor), debit("CASH_COMMISSION_RECEIVABLE", driver, input.companyMinor), credit("DRIVER_CASH_CLEARING", driver, input.companyMinor));
  return postJournal(tx, { idempotencyKey: `settlement:${input.rideId}`, kind: "RIDE_SETTLEMENT", reference: input.rideId, currency: input.currency, actorId: input.actorId, evidence: `completed-ride:${input.rideId}`, lines: lines.filter((line) => line.debitMinor + line.creditMinor > 0) });
}
