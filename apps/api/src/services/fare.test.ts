import { describe, expect, it } from "vitest";
import { calculateFare, calculatePromoDiscount, demandMultiplierFor } from "./fare.js";

describe("calculateFare", () => {
  it("prices the approved 15.6 km / 53 minute Economy trip at LRD 777 without surge", () => {
    const fare = calculateFare({ distanceM: 15_600, durationSec: 3_180 });
    expect(fare).toMatchObject({ fareMinor: 77_700, baseFareMinor: 15_000, currency: "LRD", dynamicMultiplierBps: 10_000,
      driverEarningsMinor: 66_822, companyCommissionMinor: 10_878 });
  });
  it("uses the LRD 250 minimum and rounds the final fare to whole LRD", () => {
    expect(calculateFare({ distanceM: 1, durationSec: 1 }).fareMinor).toBe(25_000);
    expect(calculateFare({ distanceM: 15_602, durationSec: 3_204 }).fareMinor).toBe(77_800);
    expect(calculateFare({ distanceM: 15_600, durationSec: 3_189.96 }).fareMinor).toBe(77_700);
  });
  it("rounds after discounts and splits the actual collected fare without losing cents", () => {
    const fare = calculateFare({ distanceM: 15600, durationSec: 3180, promo: { percentageOff: 10, minimumFareMinor: 0 } });
    expect(fare.fareMinor).toBe(69900);
    expect(fare.discountMinor).toBe(7770);
    expect(fare.subtotalMinor - fare.discountMinor).toBe(fare.fareMinor);
    expect(fare.driverEarningsMinor + fare.companyCommissionMinor).toBe(fare.fareMinor);
    expect(calculateFare({ distanceM: 15600, durationSec: 3180, promo: { percentageOff: 100, minimumFareMinor: 0 } }).fareMinor).toBe(0);
  });
  it("bounds surge and rejects unsafe inputs", () => {
    expect(calculateFare({ distanceM: 15600, durationSec: 3180, demandMultiplier: 1.5 }).fareMinor).toBe(116600);
    expect(calculateFare({ distanceM: 15600, durationSec: 3180, demandMultiplier: 99 }).dynamicMultiplierBps).toBe(30000);
    for (const distanceM of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE]) {
      expect(() => calculateFare({ distanceM, durationSec: 3180 })).toThrow();
    }
  });
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
