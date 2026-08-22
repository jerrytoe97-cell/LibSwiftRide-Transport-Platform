import { describe, expect, it } from "vitest";
import { routePointRetentionCutoff } from "./location-retention.js";

describe("route-point retention", () => {
  it("uses an exact UTC day cutoff", () => {
    expect(routePointRetentionCutoff(new Date("2026-08-08T12:00:00.000Z"), 30).toISOString()).toBe("2026-07-09T12:00:00.000Z");
  });

  it.each([0, 366, 1.5])("rejects an unsafe retention value: %s", (days) => {
    expect(() => routePointRetentionCutoff(new Date(), days)).toThrow();
  });
});
