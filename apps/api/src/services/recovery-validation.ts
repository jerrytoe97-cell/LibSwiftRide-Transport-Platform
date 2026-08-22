import type { PrismaClient } from "@prisma/client";

type CountRow = { count: bigint };

export type RecoveryValidationReport = {
  generatedAt: string;
  counts: Record<string, number>;
  totalsMinor: { completedFares: number; capturedPayments: number; refunds: number; walletBalances: number; payouts: number };
  violations: { completedRideAllocations: number; walletBalances: number; excessiveRefunds: number };
};

export async function validateRecoveredDatabase(prisma: PrismaClient): Promise<RecoveryValidationReport> {
  const [rides, payments, refunds, walletTransactions, payouts, auditLogs, completed, captured, refundTotal, wallets, payoutTotal, invalidRides, invalidWallets, invalidRefunds] = await Promise.all([
    prisma.ride.count(), prisma.payment.count(), prisma.refund.count(), prisma.walletTransaction.count(), prisma.driverPayout.count(), prisma.auditLog.count(),
    prisma.ride.aggregate({ where: { status: "COMPLETED" }, _sum: { fareMinor: true } }),
    prisma.payment.aggregate({ where: { status: "CAPTURED" }, _sum: { amountMinor: true } }),
    prisma.refund.aggregate({ where: { status: { not: "REJECTED" } }, _sum: { amountMinor: true } }),
    prisma.wallet.aggregate({ _sum: { balanceMinor: true } }),
    prisma.driverPayout.aggregate({ where: { status: { not: "FAILED" } }, _sum: { amountMinor: true } }),
    prisma.$queryRaw<CountRow[]>`SELECT COUNT(*)::bigint AS count FROM "Ride" WHERE status = 'COMPLETED' AND ("fareMinor" < 0 OR "companyCommissionMinor" <> ROUND("fareMinor" * 1400.0 / 10000.0) OR "driverEarningsMinor" <> "fareMinor" - "companyCommissionMinor")`,
    prisma.$queryRaw<CountRow[]>`SELECT COUNT(*)::bigint AS count FROM "Wallet" w LEFT JOIN LATERAL (SELECT "balanceMinor" FROM "WalletTransaction" wt WHERE wt."walletId" = w.id ORDER BY wt."createdAt" DESC, wt.id DESC LIMIT 1) latest ON true WHERE w."balanceMinor" <> COALESCE(latest."balanceMinor", 0)`,
    prisma.$queryRaw<CountRow[]>`SELECT COUNT(*)::bigint AS count FROM "Payment" p JOIN (SELECT "paymentId", SUM("amountMinor") AS refunded FROM "Refund" WHERE "paymentId" IS NOT NULL AND status <> 'REJECTED' GROUP BY "paymentId") r ON r."paymentId" = p.id WHERE r.refunded > p."amountMinor"`
  ]);

  return {
    generatedAt: new Date().toISOString(),
    counts: { rides, payments, refunds, walletTransactions, payouts, auditLogs },
    totalsMinor: {
      completedFares: completed._sum.fareMinor ?? 0,
      capturedPayments: captured._sum.amountMinor ?? 0,
      refunds: refundTotal._sum.amountMinor ?? 0,
      walletBalances: wallets._sum.balanceMinor ?? 0,
      payouts: payoutTotal._sum.amountMinor ?? 0
    },
    violations: {
      completedRideAllocations: Number(invalidRides[0]?.count ?? 0n),
      walletBalances: Number(invalidWallets[0]?.count ?? 0n),
      excessiveRefunds: Number(invalidRefunds[0]?.count ?? 0n)
    }
  };
}

export function recoveryReportPasses(report: RecoveryValidationReport) {
  return Object.values(report.violations).every((count) => count === 0);
}
