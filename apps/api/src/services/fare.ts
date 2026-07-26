import { calculateSplit } from "../lib.js";

export type FareInput = {
  distanceM: number;
  durationSec: number;
  demandMultiplier?: number;
  promo?: {
    percentageOff?: number | null;
    amountOffMinor?: number | null;
    maxDiscountMinor?: number | null;
    minimumFareMinor: number;
  };
};

export function calculateFare(input: FareInput) {
  const { distanceM, durationSec, demandMultiplier = 1, promo } = input;
  if (![distanceM, durationSec, demandMultiplier].every(Number.isFinite) || distanceM < 0 || durationSec < 0 || demandMultiplier < 1) {
    throw new Error("Invalid fare inputs");
  }
  const baseMinor = 20_000;
  const rawFare = Math.round((baseMinor + distanceM * 35 + durationSec * 8) * Math.min(demandMultiplier, 3));
  const subtotalMinor = Math.max(30_000, rawFare);
  let discountMinor = 0;
  if (promo && subtotalMinor >= promo.minimumFareMinor) {
    discountMinor = promo.percentageOff
      ? Math.round(subtotalMinor * Math.min(promo.percentageOff, 100) / 100)
      : Math.max(0, promo.amountOffMinor ?? 0);
    if (promo.maxDiscountMinor != null) discountMinor = Math.min(discountMinor, promo.maxDiscountMinor);
  }
  const fareMinor = Math.max(0, subtotalMinor - discountMinor);
  return {
    fareMinor,
    subtotalMinor,
    discountMinor,
    currency: "LRD" as const,
    estimatedDistanceM: Math.round(distanceM),
    estimatedDurationSec: Math.round(durationSec),
    ...calculateSplit(fareMinor)
  };
}
