import { describe, expect, it } from "vitest";
import { validateAvailabilityWindow, validateRideSchedule } from "./scheduling.js";

describe("scheduling rules", () => {
  const now = new Date("2026-07-26T12:00:00.000Z");

  it("accepts rides from 15 minutes through 30 days", () => {
    expect(validateRideSchedule(new Date(now.getTime() + 15 * 60_000), now)).toBe(true);
    expect(validateRideSchedule(new Date(now.getTime() + 14 * 60_000), now)).toBe(false);
    expect(validateRideSchedule(new Date(now.getTime() + 31 * 86_400_000), now)).toBe(false);
  });

  it("rejects invalid or oversized driver availability windows", () => {
    expect(validateAvailabilityWindow(new Date(now.getTime() + 60_000), new Date(now.getTime() + 2 * 60 * 60_000), now)).toBe(true);
    expect(validateAvailabilityWindow(new Date(now.getTime() + 60_000), new Date(now.getTime() + 25 * 60 * 60_000), now)).toBe(false);
  });
});
