import { Prisma } from "@prisma/client";
import { prisma } from "../lib.js";

import { FinancialOperationError } from "./financial-error.js";
import { assertWalletReconciled, credit, debit, postJournal } from "./ledger.js";
import { requireActiveAdministrator } from "./active-administrator.js";
export { FinancialOperationError } from "./financial-error.js";

type Actor = { actorId: string; ipAddress?: string };
type RefundInput = Actor & { rideId: string; idempotencyKey: string; amountMinor: number; reason: string };
type PayoutInput = Actor & { driverId: string; idempotencyKey: string; amountMinor: number; periodStart: Date; periodEnd: Date };

function reusedKey(): never {
  throw new FinancialOperationError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency key belongs to a different financial request");
}

// Retry only transactions that PostgreSQL rolled back. No provider calls or other
// external side effects belong in this callback. A retry reads a fresh snapshot,
// including any payout/refund that won a concurrent idempotency-key race.
export async function financialTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && (
        error.code === "P2034" ||
        (error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code))) ||
        (error.code === "P2002" && Array.isArray(error.meta?.target) && error.meta.target.some((field) => field === "idempotencyKey" || field === "id"))
      );
      if (!retryable) throw error;
      if (attempt === 3) throw new FinancialOperationError(409, "FINANCIAL_CONFLICT", "Concurrent financial update; retry with the same idempotency key and details");
    }
  }
  throw new Error("Financial transaction retry limit exhausted");
}

export async function requestRefund(input: RefundInput) {
  return financialTransaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.actorId} FOR SHARE`;
    const actor = await tx.user.findUnique({ where: { id: input.actorId }, select: { role: true, status: true } });
    if (!actor || actor.status !== "ACTIVE" || !["ADMIN", "SUPPORT"].includes(actor.role)) throw new FinancialOperationError(403, "FORBIDDEN", "An active administrator or support agent is required");
    const existing = await tx.refund.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.rideId !== input.rideId || existing.amountMinor !== input.amountMinor || existing.reason !== input.reason) reusedKey();
      return existing;
    }
    const payment = await tx.payment.findUnique({ where: { rideId: input.rideId } });
    if (!payment || payment.status !== "CAPTURED") throw new FinancialOperationError(409, "PAYMENT_NOT_REFUNDABLE", "A captured payment is required");
    const reserved = await tx.refund.aggregate({
      where: { rideId: input.rideId, status: { notIn: ["REJECTED", "FAILED"] } }, _sum: { amountMinor: true }
    });
    if ((reserved._sum.amountMinor ?? 0) + input.amountMinor > payment.amountMinor) {
      throw new FinancialOperationError(422, "REFUND_EXCEEDS_PAYMENT", "Refund exceeds the captured payment");
    }
    const refund = await tx.refund.create({ data: {
      rideId: input.rideId, paymentId: payment.id, requestedById: input.actorId,
      idempotencyKey: input.idempotencyKey, amountMinor: input.amountMinor, reason: input.reason
    } });
    await tx.auditLog.create({ data: {
      actorId: input.actorId, action: "REFUND_REQUESTED", entityType: "Refund", entityId: refund.id,
      ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}), metadata: { rideId: input.rideId, amountMinor: input.amountMinor }
    } });
    return refund;
  });
}

export async function reviewRefund(input: Actor & { refundId: string; status: "APPROVED" | "REJECTED" }) {
  return financialTransaction(async (tx) => {
    await requireActiveAdministrator(tx, input.actorId);
    const existing = await tx.refund.findUnique({ where: { id: input.refundId } });
    if (!existing) throw new FinancialOperationError(404, "REFUND_NOT_FOUND", "Refund not found");
    if (existing.status === input.status) return existing;
    if (existing.status !== "REQUESTED") throw new FinancialOperationError(409, "REFUND_NOT_REVIEWABLE", "Only a requested refund can be approved or rejected");
    const refund = await tx.refund.update({ where: { id: existing.id, status: "REQUESTED" }, data: { status: input.status, reviewedById: input.actorId } });
    await tx.auditLog.create({ data: {
      actorId: input.actorId, action: `REFUND_${input.status}`, entityType: "Refund", entityId: refund.id,
      ...(input.ipAddress ? { ipAddress: input.ipAddress } : {})
    } });
    return refund;
  });
}

export async function requestDriverPayout(input: PayoutInput) {
  return financialTransaction(async (tx) => {
    await requireActiveAdministrator(tx, input.actorId);
    const existing = await tx.driverPayout.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.driverId !== input.driverId || existing.amountMinor !== input.amountMinor ||
        existing.periodStart.getTime() !== input.periodStart.getTime() || existing.periodEnd.getTime() !== input.periodEnd.getTime()) reusedKey();
      return existing;
    }
    const driver = await tx.driver.findUnique({ where: { id: input.driverId }, select: { user: { select: { wallet: { select: { id: true } } } } } });
    const walletId = driver?.user.wallet?.id;
    if (!walletId) throw new FinancialOperationError(422, "INSUFFICIENT_DRIVER_BALANCE", "Driver wallet balance is insufficient");
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;
    const opening = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });
    await assertWalletReconciled(tx, opening.userId, opening.balanceMinor, opening.currency);
    const debited = await tx.wallet.updateMany({ where: { id: walletId, balanceMinor: { gte: input.amountMinor } }, data: { balanceMinor: { decrement: input.amountMinor } } });
    if (debited.count !== 1) throw new FinancialOperationError(422, "INSUFFICIENT_DRIVER_BALANCE", "Driver wallet balance is insufficient");
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });
    const payout = await tx.driverPayout.create({ data: {
      driverId: input.driverId, idempotencyKey: input.idempotencyKey, amountMinor: input.amountMinor,
      periodStart: input.periodStart, periodEnd: input.periodEnd, currency: wallet.currency
    } });
    await postJournal(tx, { idempotencyKey: `payout-reservation:${payout.id}`, kind: "PAYOUT_RESERVED", reference: payout.id, currency: wallet.currency, actorId: input.actorId, evidence: `approved-payout-request:${input.idempotencyKey}`, lines: [debit("USER_PAYABLE", wallet.userId, input.amountMinor), credit("PAYOUT_PAYABLE", payout.id, input.amountMinor)] });
    await tx.walletTransaction.create({ data: {
      walletId, type: "PAYOUT", amountMinor: input.amountMinor, balanceMinor: wallet.balanceMinor,
      reference: `payout:${payout.id}`, idempotencyKey: `wallet:${input.idempotencyKey}`, description: "Driver payout pending"
    } });
    await tx.auditLog.create({ data: {
      actorId: input.actorId, action: "DRIVER_PAYOUT_CREATED", entityType: "DriverPayout", entityId: payout.id,
      ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}), metadata: { driverId: input.driverId, amountMinor: input.amountMinor }
    } });
    return payout;
  });
}
