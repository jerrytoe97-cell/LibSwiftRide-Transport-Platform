import { config } from "../config.js";

export type MobileMoneyMethod = "ORANGE_MONEY" | "MTN_MOMO";

export function mobileMoneyDisplayNumber(method: MobileMoneyMethod) {
  return method === "ORANGE_MONEY" ? config.ORANGE_MONEY_NUMBER : config.MTN_MOMO_NUMBER;
}

export function adminPaymentConfiguration() {
  return {
    source: "environment" as const,
    restartRequired: true,
    mobileMoney: [
      { method: "ORANGE_MONEY" as const, environmentVariable: "ORANGE_MONEY_NUMBER", configured: Boolean(config.ORANGE_MONEY_NUMBER) },
      { method: "MTN_MOMO" as const, environmentVariable: "MTN_MOMO_NUMBER", configured: Boolean(config.MTN_MOMO_NUMBER) }
    ]
  };
}
