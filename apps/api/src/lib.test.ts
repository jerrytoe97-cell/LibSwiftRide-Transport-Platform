import { describe, expect, it } from "vitest";
import { calculateSplit } from "./lib.js";

describe("calculateSplit", () => {
  it("allocates exactly 86% to the driver and 14% to the company", () => {
    expect(calculateSplit(100_000)).toEqual({
      driverEarningsMinor: 86_000,
      companyCommissionMinor: 14_000
    });
  });

  it("preserves every cent when rounding", () => {
    const split = calculateSplit(10_003);
    expect(split.driverEarningsMinor + split.companyCommissionMinor).toBe(10_003);
  });

  it("rejects invalid money values", () => {
    expect(() => calculateSplit(-1)).toThrow();
    expect(() => calculateSplit(1.5)).toThrow();
  });
});
