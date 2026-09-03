import { calculateSplit } from "../lib.js";
import { economyTariff, type EconomyTariff } from "../pricing-config.js";

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

export function calculateFare(input: FareInput, tariff: EconomyTariff = economyTariff) {
  const { distanceM, durationSec, demandMultiplier = tariff.defaultMultiplier, waitingTimeSec = 0, tollMinor = 0, promo } = input;
  if (![distanceM, durationSec, demandMultiplier, waitingTimeSec, tollMinor].every(Number.isFinite) || distanceM < 0 || durationSec < 0 || demandMultiplier < 1 || waitingTimeSec < 0 || tollMinor < 0) {
    throw new Error("Invalid fare inputs");
  }
  const baseMinor = tariff.baseFareMinor;
  const dynamicMultiplier = Math.min(demandMultiplier, tariff.maximumMultiplier);
  const rawFare = (baseMinor + distanceM / 1_000 * tariff.perKmMinor + durationSec / 60 * tariff.perMinuteMinor) * dynamicMultiplier;
  const waitingFeeMinor = Math.round(Math.max(0, waitingTimeSec - tariff.waitingGraceSec) * tariff.waitingPerSecondMinor);
  const unroundedSubtotal = Math.max(tariff.minimumFareMinor, rawFare) + waitingFeeMinor + Math.round(tollMinor);
  if (!Number.isFinite(unroundedSubtotal) || unroundedSubtotal > 2_147_483_600) throw new Error("Fare exceeds supported money range");
  const discountMinor = promo ? calculatePromoDiscount(Math.round(unroundedSubtotal), promo) : 0;
  const fareMinor = Math.max(0, Math.round((unroundedSubtotal - discountMinor) / tariff.roundingIncrementMinor) * tariff.roundingIncrementMinor);
  // Include the final rounding adjustment in the displayed gross subtotal so
  // subtotal - discount = charged amount, without altering promo caps or splits.
  const subtotalMinor = fareMinor + discountMinor;
  return {
    fareMinor,
    baseFareMinor: baseMinor,
    dynamicMultiplierBps: Math.round(dynamicMultiplier * 10_000),
    waitingTimeSec: Math.round(waitingTimeSec),
    waitingFeeMinor,
    tollMinor: Math.round(tollMinor),
    subtotalMinor,
    discountMinor,
    currency: tariff.currency,
    estimatedDistanceM: Math.round(distanceM),
    estimatedDurationSec: Math.round(durationSec),
    ...calculateSplit(fareMinor)
  };
}
