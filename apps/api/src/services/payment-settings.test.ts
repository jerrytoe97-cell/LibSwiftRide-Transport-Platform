import { describe, expect, it } from "vitest";
import { config } from "../config.js";
import { adminPaymentConfiguration, mobileMoneyDisplayNumber } from "./payment-settings.js";

describe("payment display settings", () => {
  it("selects only the requested provider destination", () => {
    expect(mobileMoneyDisplayNumber("ORANGE_MONEY")).toBe(config.ORANGE_MONEY_NUMBER);
    expect(mobileMoneyDisplayNumber("MTN_MOMO")).toBe(config.MTN_MOMO_NUMBER);
  });

  it("never exposes destination numbers through admin settings", () => {
    const response = JSON.stringify(adminPaymentConfiguration());
    if (config.ORANGE_MONEY_NUMBER) expect(response).not.toContain(config.ORANGE_MONEY_NUMBER);
    if (config.MTN_MOMO_NUMBER) expect(response).not.toContain(config.MTN_MOMO_NUMBER);
    expect(response).toContain("ORANGE_MONEY_NUMBER");
    expect(response).toContain("MTN_MOMO_NUMBER");
  });
});
