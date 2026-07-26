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

export function calculatePromoDiscount(subtotalMinor: number, promo: NonNullable<FareInput["promo"]>) {
  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor < 0) throw new Error("Subtotal must be a non-negative integer");
  if (subtotalMinor < promo.minimumFareMinor) return 0;
  const discount = promo.percentageOff
    ? Math.round(subtotalMinor * Math.min(promo.percentageOff, 100) / 100)
    : Math.max(0, promo.amountOffMinor ?? 0);
  return Math.min(subtotalMinor, promo.maxDiscountMinor == null ? discount : Math.min(discount, promo.maxDiscountMinor));
}

export function calculateFare(input: FareInput) {
  const { distanceM, durationSec, demandMultiplier = 1, promo } = input;
  if (![distanceM, durationSec, demandMultiplier].every(Number.isFinite) || distanceM < 0 || durationSec < 0 || demandMultiplier < 1) {
    throw new Error("Invalid fare inputs");
  }
  const baseMinor = 20_000;
  const rawFare = Math.round((baseMinor + distanceM * 35 + durationSec * 8) * Math.min(demandMultiplier, 3));
  const subtotalMinor = Math.max(30_000, rawFare);
  const discountMinor = promo ? calculatePromoDiscount(subtotalMinor, promo) : 0;
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
