import { describe, expect, it } from "vitest";
import { recoveryReportPasses, type RecoveryValidationReport } from "./recovery-validation.js";

const report = (violations: RecoveryValidationReport["violations"]): RecoveryValidationReport => ({
  generatedAt: new Date(0).toISOString(), counts: {}, totalsMinor: { completedFares: 0, capturedPayments: 0, refunds: 0, walletBalances: 0, payouts: 0 }, violations
});

describe("recovery validation", () => {
  it("passes only when every reconciliation invariant has zero violations", () => {
    expect(recoveryReportPasses(report({ completedRideAllocations: 0, walletBalances: 0, excessiveRefunds: 0 }))).toBe(true);
    expect(recoveryReportPasses(report({ completedRideAllocations: 1, walletBalances: 0, excessiveRefunds: 0 }))).toBe(false);
  });
});
