import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import { config } from "./config.js";

export const prisma = new PrismaClient();
export const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 2
});
export const redisSubscriber = redis.duplicate();

export const DRIVER_SHARE_BPS = 8_600;
export const COMPANY_SHARE_BPS = 1_400;

export function calculateSplit(fareMinor: number) {
  if (!Number.isSafeInteger(fareMinor) || fareMinor < 0) {
    throw new Error("Fare must be a non-negative integer");
  }
  const companyCommissionMinor = Math.round((fareMinor * COMPANY_SHARE_BPS) / 10_000);
  return {
    driverEarningsMinor: fareMinor - companyCommissionMinor,
    companyCommissionMinor
  };
}
