import { describe, expect, it } from "vitest";
import { calculateFare } from "./fare.js";

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
