import { describe, expect, it } from "vitest";
import { calculateSplit } from "../lib.js";
import { referralRewardFor } from "./referrals.js";
import { rideWalletSettlement } from "./ride-wallet-settlement.js";

describe("commission-funded referral conservation", () => {
  it("preserves driver earnings and conserves every minor unit across rounding boundaries", () => {
    for (let fare = 0; fare <= 100_000; fare++) {
      const split = calculateSplit(fare);
      const reward = referralRewardFor(1, fare);
      const companyNet = split.companyCommissionMinor - reward;
      if (companyNet < 0 || split.driverEarningsMinor + reward + companyNet !== fare) throw new Error(`Unbalanced allocation at ${fare}`);
      const cash = rideWalletSettlement("CASH", fare, split.driverEarningsMinor);
      if (fare + cash.deltaMinor !== split.driverEarningsMinor) throw new Error(`Cash allocation at ${fare}`);
      if (referralRewardFor(2, fare) !== 0) throw new Error("Repeated referral reward");
    }
  });
  it("allocates a 10,000-minor-unit first ride as 8,600 driver, 200 referral, 1,200 company net", () => {
    const split = calculateSplit(10_000);
    const referral = referralRewardFor(1, 10_000);
    expect(split).toEqual({ driverEarningsMinor: 8600, companyCommissionMinor: 1400 });
    expect(referral).toBe(200);
    expect(split.companyCommissionMinor - referral).toBe(1200);
  });
});
