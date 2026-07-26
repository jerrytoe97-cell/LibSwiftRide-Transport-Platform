import { describe, expect, it } from "vitest";
import { calculateSplit } from "./lib.js";

describe("calculateSplit", () => {
  it("allocates exactly 88% to the driver and 12% to the company", () => {
    expect(calculateSplit(100_000)).toEqual({
      driverEarningsMinor: 88_000,
      companyCommissionMinor: 12_000
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
