import { describe, expect, it } from "vitest";
import { fraudAction, fraudScore, incentiveQualified, zoneMultiplierFor } from "./phase5.js";

describe("phase 5 engines", () => {
  it("applies the highest containing geofence multiplier", () => {
    expect(zoneMultiplierFor({ latitude: 6.24, longitude: -10.36 }, [{ centerLatitude: 6.24, centerLongitude: -10.36, radiusM: 2_000, multiplierBps: 13_000 }])).toBe(1.3);
  });
  it("escalates velocity and payment fraud deterministically", () => {
    const score = fraudScore({ bookingsLastHour: 7, failedPaymentsLastDay: 2, promoAttemptsLastHour: 8, accountAgeHours: .5 });
    expect(fraudAction(score)).toBe("BLOCK");
  });
  it("qualifies incentives at the configured threshold", () => {
    expect(incentiveQualified(10, 10)).toBe(true);
    expect(incentiveQualified(9, 10)).toBe(false);
  });
});
