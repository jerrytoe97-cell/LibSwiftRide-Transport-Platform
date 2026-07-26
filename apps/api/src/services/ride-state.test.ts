import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "./ride-state.js";

describe("ride state machine", () => {
  it("allows the normal trip lifecycle", () => {
    expect(canTransition("DRIVER_ARRIVED", "IN_PROGRESS")).toBe(true);
    expect(canTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
  });
  it("blocks skipping required safety states", () => {
    expect(() => assertTransition("SEARCHING", "COMPLETED")).toThrow();
  });
});
