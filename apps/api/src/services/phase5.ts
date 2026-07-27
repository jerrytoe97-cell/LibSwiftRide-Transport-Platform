import { distanceMetres } from "./tracking.js";

export type PricingZone = { centerLatitude: number; centerLongitude: number; radiusM: number; multiplierBps: number };

export function zoneMultiplierFor(point: { latitude: number; longitude: number }, zones: PricingZone[]) {
  return zones.reduce((highest, zone) => {
    const inside = distanceMetres(point, { latitude: zone.centerLatitude, longitude: zone.centerLongitude }) <= zone.radiusM;
    return inside ? Math.max(highest, zone.multiplierBps / 10_000) : highest;
  }, 1);
}

export function fraudScore(input: { bookingsLastHour: number; failedPaymentsLastDay: number; promoAttemptsLastHour: number; accountAgeHours: number }) {
  if (Object.values(input).some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Invalid fraud inputs");
  return Math.min(100,
    Math.max(0, input.bookingsLastHour - 3) * 15 +
    Math.min(input.failedPaymentsLastDay * 12, 36) +
    Math.max(0, input.promoAttemptsLastHour - 5) * 5 +
    (input.accountAgeHours < 1 ? 20 : 0)
  );
}

export function fraudAction(score: number) {
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error("Invalid fraud score");
  return score >= 80 ? "BLOCK" : score >= 50 ? "REVIEW" : "ALLOW";
}

export function incentiveQualified(completedRides: number, minimumRides: number) {
  return Number.isSafeInteger(completedRides) && Number.isSafeInteger(minimumRides) && minimumRides > 0 && completedRides >= minimumRides;
}
