import { describe, expect, it } from "vitest";
import { LibSwiftRideClient, money } from "./src.js";

describe("SDK", () => {
  it("formats Liberian dollar minor units", () => {
    expect(money(12_500)).toContain("125");
  });
  it("starts unauthenticated outside a browser", () => {
    expect(new LibSwiftRideClient().hasSession()).toBe(false);
  });
});
