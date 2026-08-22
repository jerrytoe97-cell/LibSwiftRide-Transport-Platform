import { calculateSplit } from "../lib.js";

export type FareInput = {
  distanceM: number;
  durationSec: number;
  demandMultiplier?: number;
  waitingTimeSec?: number;
  tollMinor?: number;
  promo?: {
    percentageOff?: number | null;
    amountOffMinor?: number | null;
    maxDiscountMinor?: number | null;
    minimumFareMinor: number;
  };
};

export function calculatePromoDiscount(subtotalMinor: number, promo: NonNullable<FareInput["promo"]>) {
  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor < 0) throw new Error("Subtotal must be a non-negative integer");
  if (subtotalMinor < promo.minimumFareMinor) return 0;
  const discount = promo.percentageOff
    ? Math.round(subtotalMinor * Math.min(promo.percentageOff, 100) / 100)
    : Math.max(0, promo.amountOffMinor ?? 0);
  return Math.min(subtotalMinor, promo.maxDiscountMinor == null ? discount : Math.min(discount, promo.maxDiscountMinor));
}

export function demandMultiplierFor(searchingRides: number, availableDrivers: number) {
  if (![searchingRides, availableDrivers].every(Number.isSafeInteger) || searchingRides < 0 || availableDrivers < 0) throw new Error("Invalid demand inputs");
  const pressure = searchingRides / Math.max(availableDrivers, 1);
  if (pressure >= 4) return 1.75;
  if (pressure >= 2) return 1.5;
  if (pressure >= 1) return 1.25;
  return 1;
}

export function calculateFare(input: FareInput) {
  const { distanceM, durationSec, demandMultiplier = 1, waitingTimeSec = 0, tollMinor = 0, promo } = input;
  if (![distanceM, durationSec, demandMultiplier, waitingTimeSec, tollMinor].every(Number.isFinite) || distanceM < 0 || durationSec < 0 || demandMultiplier < 1 || waitingTimeSec < 0 || tollMinor < 0) {
    throw new Error("Invalid fare inputs");
  }
  const baseMinor = 20_000;
  const dynamicMultiplier = Math.min(demandMultiplier, 3);
  const rawFare = Math.round((baseMinor + distanceM * 35 + durationSec * 8) * dynamicMultiplier);
  const waitingFeeMinor = Math.round(Math.max(0, waitingTimeSec - 180) * 5);
  const subtotalMinor = Math.max(30_000, rawFare) + waitingFeeMinor + Math.round(tollMinor);
  const discountMinor = promo ? calculatePromoDiscount(subtotalMinor, promo) : 0;
  const fareMinor = Math.max(0, subtotalMinor - discountMinor);
  return {
    fareMinor,
    baseFareMinor: baseMinor,
    dynamicMultiplierBps: Math.round(dynamicMultiplier * 10_000),
    waitingTimeSec: Math.round(waitingTimeSec),
    waitingFeeMinor,
    tollMinor: Math.round(tollMinor),
    subtotalMinor,
    discountMinor,
    currency: "LRD" as const,
    estimatedDistanceM: Math.round(distanceM),
    estimatedDurationSec: Math.round(durationSec),
    ...calculateSplit(fareMinor)
  };
}
