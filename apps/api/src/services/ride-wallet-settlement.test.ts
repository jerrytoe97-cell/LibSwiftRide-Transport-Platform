import { describe, expect, it } from "vitest";
import { rideWalletSettlement } from "./ride-wallet-settlement.js";

describe("cash and electronic fare settlement", () => {
  it("leaves 86% with the cash driver and records 14% commission owed", () => {
    const settlement = rideWalletSettlement("CASH", 1000, 860);
    expect(settlement).toMatchObject({ deltaMinor: -140, amountMinor: 140, type: "DEBIT" });
    expect(1000 + settlement.deltaMinor).toBe(860);
  });
  it.each(["ORANGE_MONEY", "MTN_MOMO", "STRIPE", "WALLET"] as const)("credits earnings for %s received by the platform", (method) => {
    expect(rideWalletSettlement(method, 1000, 860)).toMatchObject({ deltaMinor: 860, amountMinor: 860, type: "CREDIT" });
  });
  it("allows a fully discounted cash ride without inventing commission", () => {
    expect(rideWalletSettlement("CASH", 0, 0).amountMinor).toBe(0);
  });
  it("rejects invalid settlement arithmetic", () => {
    for (const [fare, earnings] of [[100, 101], [-1, 0], [100, 85.5]]) expect(() => rideWalletSettlement("CASH", fare!, earnings!)).toThrow();
  });
});
