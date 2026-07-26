import { pino } from "pino";
import { config } from "./config.js";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (config.NODE_ENV === "production" ? "info" : "debug"),
  base: { service: "libswiftride-api", environment: config.NODE_ENV },
  redact: {
    paths: ["password", "token", "accessToken", "refreshToken", "authorization", "paymentNumber", "mobileMoneyNumber", "MTN_MOMO_NUMBER", "ORANGE_MONEY_NUMBER", "*.password", "*.token", "*.nationalIdRef", "*.storageKey", "*.paymentNumber", "*.mobileMoneyNumber", "*.MTN_MOMO_NUMBER", "*.ORANGE_MONEY_NUMBER"],
    censor: "[REDACTED]"
  }
});
