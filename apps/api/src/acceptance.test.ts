import { describe, expect, it } from "vitest";
import { calculateSplit } from "./lib.js";
import { calculateFare } from "./services/fare.js";
import { fraudAction, fraudScore, incentiveQualified } from "./services/phase5.js";
import { assertTransition } from "./services/ride-state.js";
import { validateRideSchedule } from "./services/scheduling.js";

describe("Phase 6 acceptance journeys", () => {
  it("accepts the complete passenger and driver ride lifecycle", () => {
    const lifecycle = ["DRIVER_ASSIGNED", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "PASSENGER_BOARDED", "IN_PROGRESS", "COMPLETED"] as const;
    for (let index = 0; index < lifecycle.length - 1; index += 1) expect(() => assertTransition(lifecycle[index]!, lifecycle[index + 1]!)).not.toThrow();
  });

  it("supports cancellation only from active states", () => {
    expect(() => assertTransition("SEARCHING", "CANCELLED")).not.toThrow();
    expect(() => assertTransition("COMPLETED", "CANCELLED")).toThrow();
  });

  it("keeps fare, wallet credit, commission and earnings balanced", () => {
    const fare = calculateFare({ distanceM: 12_000, durationSec: 2_400, demandMultiplier: 1.25, waitingTimeSec: 300, tollMinor: 250 });
    expect(calculateSplit(fare.fareMinor)).toEqual({ driverEarningsMinor: fare.driverEarningsMinor, companyCommissionMinor: fare.companyCommissionMinor });
    expect(fare.driverEarningsMinor + fare.companyCommissionMinor).toBe(fare.fareMinor);
  });

  it("validates scheduled booking boundaries", () => {
    const now = new Date();
    expect(validateRideSchedule(new Date(now.getTime() + 20 * 60_000), now)).toBe(true);
    expect(validateRideSchedule(new Date(now.getTime() + 5 * 60_000), now)).toBe(false);
    expect(validateRideSchedule(new Date(now.getTime() + 31 * 86_400_000), now)).toBe(false);
  });

  it("escalates high-risk duplicate and failed-payment behaviour", () => {
    const score = fraudScore({ bookingsLastHour: 8, failedPaymentsLastDay: 3, promoAttemptsLastHour: 7, accountAgeHours: 0 });
    expect(fraudAction(score)).toBe("BLOCK");
  });

  it("awards driver bonuses only after the configured threshold", () => {
    expect(incentiveQualified(19, 20)).toBe(false);
    expect(incentiveQualified(20, 20)).toBe(true);
  });
});
