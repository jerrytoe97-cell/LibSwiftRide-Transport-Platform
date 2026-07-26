import { describe, expect, it } from "vitest";
import { calculateFare, calculatePromoDiscount, demandMultiplierFor } from "./fare.js";

describe("calculateFare", () => {
  it("applies promo then splits the collected fare", () => {
    const fare = calculateFare({
      distanceM: 5_000,
      durationSec: 1_200,
      promo: { percentageOff: 10, minimumFareMinor: 0, maxDiscountMinor: 50_000 }
    });
    expect(fare.discountMinor).toBeGreaterThan(0);
    expect(fare.driverEarningsMinor + fare.companyCommissionMinor).toBe(fare.fareMinor);
  });
});

describe("demandMultiplierFor", () => {
  it("uses bounded supply pressure tiers", () => {
    expect(demandMultiplierFor(1, 4)).toBe(1);
    expect(demandMultiplierFor(4, 2)).toBe(1.5);
    expect(demandMultiplierFor(20, 2)).toBe(1.75);
  });
});

describe("calculatePromoDiscount", () => {
  it("caps percentage discounts and preserves integer money", () => {
    expect(calculatePromoDiscount(100_000, { percentageOff: 25, maxDiscountMinor: 10_000, minimumFareMinor: 50_000 })).toBe(10_000);
    expect(calculatePromoDiscount(49_999, { amountOffMinor: 5_000, minimumFareMinor: 50_000 })).toBe(0);
  });
  it("adds waiting time after grace period and tolls before splitting", () => {
    const fare = calculateFare({ distanceM: 5_000, durationSec: 1_200, waitingTimeSec: 300, tollMinor: 2_500, demandMultiplier: 1.25 });
    expect(fare.waitingFeeMinor).toBe(600);
    expect(fare.tollMinor).toBe(2_500);
    expect(fare.dynamicMultiplierBps).toBe(12_500);
    expect(fare.driverEarningsMinor + fare.companyCommissionMinor).toBe(fare.fareMinor);
  });
});
