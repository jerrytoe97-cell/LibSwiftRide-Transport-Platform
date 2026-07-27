import { describe, expect, it } from "vitest";
import { LibSwiftRideClient, message, messages, money, rideStatusLabel } from "./src.js";

describe("SDK", () => {
  it("formats Liberian dollar minor units", () => {
    expect(money(12_500)).toContain("125");
  });
  it("starts unauthenticated outside a browser", () => {
    expect(new LibSwiftRideClient().hasSession()).toBe(false);
  });
  it("keeps English and French message keys aligned", () => {
    expect(Object.keys(messages.en)).toEqual(Object.keys(messages.fr));
    expect(message("fr", "payment")).toBe("Paiement");
    expect(rideStatusLabel("DRIVER_ARRIVING", "fr")).toBe("Chauffeur en route");
  });
});
