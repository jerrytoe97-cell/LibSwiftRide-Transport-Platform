import { describe, expect, it } from "vitest";
import { economyTariff, economyTariffSchema, effectiveSurgeMultiplier, tariffForBookedRide } from "./pricing-config.js";
import { calculateFare } from "./services/fare.js";

describe("central Economy tariff", () => {
  it("stores the approved rates in LRD minor units", () => {
    expect(economyTariff).toMatchObject({ currency: "LRD", baseFareMinor: 15000, perKmMinor: 3000,
      perMinuteMinor: 300, minimumFareMinor: 25000, defaultMultiplier: 1, roundingIncrementMinor: 100 });
    expect(Object.isFrozen(economyTariff)).toBe(true);
  });
  it("rejects negative, fractional or non-finite rate settings", () => {
    for (const value of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(economyTariffSchema.safeParse({ ...economyTariff, perKmMinor: value }).success).toBe(false);
    }
    expect(economyTariffSchema.safeParse({ ...economyTariff, currency: "USD" }).success).toBe(false);
  });
  it("ignores demand and zones unless surge is intentionally enabled", () => {
    expect(effectiveSurgeMultiplier(false, 1.5, 2)).toBe(1);
    expect(effectiveSurgeMultiplier(true, 1.5, 1)).toBe(1.5);
    expect(effectiveSurgeMultiplier(true, 1.75, 9)).toBe(3);
    expect(calculateFare({ distanceM: 15600, durationSec: 3180, demandMultiplier: effectiveSurgeMultiplier(false, 1.5, 2) }).fareMinor).toBe(77700);
  });
  it("preserves pre-existing booked rates and fails closed on unknown tariffs", () => {
    expect(calculateFare({ distanceM: 15602, durationSec: 3204, demandMultiplier: 1.5 }, tariffForBookedRide(20000)).fareMinor).toBe(887553);
    expect(tariffForBookedRide(15000)).toBe(economyTariff);
    expect(() => tariffForBookedRide(999)).toThrow("manual pricing review");
  });
});
