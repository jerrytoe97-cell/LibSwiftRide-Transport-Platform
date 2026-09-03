import { z } from "zod";

// Backend-only tariff boundary. A future authorized/audited Admin settings store
// must validate through this schema and persist a tariff version on each booking.
export const economyTariffSchema = z.object({
  currency: z.literal("LRD"),
  baseFareMinor: z.number().int().nonnegative().max(100_000_000),
  perKmMinor: z.number().int().nonnegative().max(100_000_000),
  perMinuteMinor: z.number().int().nonnegative().max(100_000_000),
  minimumFareMinor: z.number().int().nonnegative().max(100_000_000),
  defaultMultiplier: z.literal(1),
  maximumMultiplier: z.number().min(1).max(3),
  roundingIncrementMinor: z.union([z.literal(1), z.literal(100)]),
  waitingGraceSec: z.number().int().nonnegative(),
  waitingPerSecondMinor: z.number().int().nonnegative()
}).strict();
export type EconomyTariff = Readonly<z.infer<typeof economyTariffSchema>>;

export const economyTariff: EconomyTariff = Object.freeze(economyTariffSchema.parse({
  currency: "LRD", baseFareMinor: 15_000, perKmMinor: 3_000, perMinuteMinor: 300,
  minimumFareMinor: 25_000, defaultMultiplier: 1, maximumMultiplier: 3,
  roundingIncrementMinor: 100, waitingGraceSec: 180, waitingPerSecondMinor: 5
}));

// Existing persisted rides predate tariff versioning. Preserve their contracted
// rates at completion rather than repricing them with today's Economy tariff.
const legacyEconomyTariff: EconomyTariff = Object.freeze(economyTariffSchema.parse({
  ...economyTariff, baseFareMinor: 20_000, perKmMinor: 35_000, perMinuteMinor: 480,
  minimumFareMinor: 30_000, roundingIncrementMinor: 1
}));
export function tariffForBookedRide(baseFareMinor: number): EconomyTariff {
  if (baseFareMinor === economyTariff.baseFareMinor) return economyTariff;
  if (baseFareMinor === legacyEconomyTariff.baseFareMinor) return legacyEconomyTariff;
  throw new Error("Booked tariff is unknown; manual pricing review is required");
}

export function effectiveSurgeMultiplier(enabled: boolean, demand: number, zone: number) {
  if (!enabled) return economyTariff.defaultMultiplier;
  if (![demand, zone].every((value) => Number.isFinite(value) && value >= 1)) throw new Error("Invalid surge multiplier");
  return Math.min(economyTariff.maximumMultiplier, Math.max(demand, zone));
}
