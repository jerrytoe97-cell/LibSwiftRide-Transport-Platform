import { z } from "zod";
import { financialTransaction, FinancialOperationError } from "./financial-operations.js";
import { requireActiveAdministrator } from "./active-administrator.js";
import { accountNetDebit } from "./ledger.js";

// An immutable audit snapshot; detecting a discrepancy never creates money or
// marks a provider payment verified. A fresh UUID requests a fresh snapshot.
export async function reconcileDriverWallet(input: { actorId: string; driverId: string; idempotencyKey: string }) {
  z.object({ driverId: z.uuid(), idempotencyKey: z.uuid() }).parse(input);
  return financialTransaction(async (tx) => {
    await requireActiveAdministrator(tx, input.actorId);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"reconcile:" + input.idempotencyKey}, 0))::text`;
    const existing = await tx.auditLog.findUnique({ where: { id: input.idempotencyKey } });
    if (existing) {
      if (existing.action !== "WALLET_RECONCILED" || existing.actorId !== input.actorId || existing.entityId !== input.driverId) throw new FinancialOperationError(409, "IDEMPOTENCY_KEY_REUSED", "Reconciliation key belongs to another audit request");
      return existing.metadata;
    }
    const driver = await tx.driver.findUniqueOrThrow({ where: { id: input.driverId } });
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${driver.userId} FOR UPDATE`;
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: driver.userId } });
    const payable = -await accountNetDebit(tx, "USER_PAYABLE", driver.userId, wallet.currency);
    const receivable = await accountNetDebit(tx, "CASH_COMMISSION_RECEIVABLE", driver.userId, wallet.currency);
    const pending = await tx.driverPayout.findMany({ where: { driverId: driver.id, status: { in: ["PENDING", "PROCESSING"] } } });
    const mismatchedPayoutIds: string[] = [];
    for (const payout of pending) if (-await accountNetDebit(tx, "PAYOUT_PAYABLE", payout.id, payout.currency) !== BigInt(payout.amountMinor)) mismatchedPayoutIds.push(payout.id);
    const missingSettlements = await tx.$queryRaw<{ id: string }[]>`SELECT r.id FROM "Ride" r WHERE r."driverId" = ${driver.id} AND r.status = 'COMPLETED' AND r."fareMinor" > 0 AND NOT EXISTS (SELECT 1 FROM "LedgerJournal" j WHERE j."idempotencyKey" = 'settlement:' || r.id)`;
    const difference = BigInt(wallet.balanceMinor) - (payable - receivable);
    const snapshot = { driverId: driver.id, currency: wallet.currency, walletBalanceMinor: wallet.balanceMinor, payableMinor: payable.toString(), cashCommissionReceivableMinor: receivable.toString(), differenceMinor: difference.toString(), mismatchedPayoutIds, missingSettlementRideIds: missingSettlements.map((ride) => ride.id), reconciled: difference === 0n && mismatchedPayoutIds.length === 0 && missingSettlements.length === 0, electronicProvidersCertified: false };
    await tx.auditLog.create({ data: { id: input.idempotencyKey, actorId: input.actorId, action: "WALLET_RECONCILED", entityType: "Driver", entityId: driver.id, metadata: snapshot } });
    return snapshot;
  });
}
