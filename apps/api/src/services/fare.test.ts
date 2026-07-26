import { describe, expect, it } from "vitest";
import { calculateFare, calculatePromoDiscount } from "./fare.js";

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

describe("calculatePromoDiscount", () => {
  it("caps percentage discounts and preserves integer money", () => {
    expect(calculatePromoDiscount(100_000, { percentageOff: 25, maxDiscountMinor: 10_000, minimumFareMinor: 50_000 })).toBe(10_000);
    expect(calculatePromoDiscount(49_999, { amountOffMinor: 5_000, minimumFareMinor: 50_000 })).toBe(0);
  });
});
