import { describe, expect, it } from "vitest";
import { canRequestFare, isValidTripLocation, canConfirmBooking, isValidBookingQuote, type BookingQuote } from "./trip-input.js";

const pickup = { address: "Broad Street, Monrovia", latitude: 6.3156, longitude: -10.8074 };
const destination = { address: "SKD Complex, Paynesville", latitude: 6.3058, longitude: -10.7492 };
const profile = { firstName: "Synthetic", lastName: "Passenger", phone: "+231770000000", role: "PASSENGER", status: "ACTIVE" };
const quote: BookingQuote = { fareMinor: 50000, currency: "LRD", estimatedDistanceM: 15600, estimatedDurationSec: 1800, route: { geometry: [[-10.8074, 6.3156], [-10.7492, 6.3058]] } };

describe("booking confirmation", () => {
  it("requires a route, integer LRD fare, selected locations and an active passenger profile", () => {
    expect(canConfirmBooking(pickup, destination, quote, profile, "")).toBe(true);
    expect(canConfirmBooking(pickup, destination, null, profile, "")).toBe(false);
    expect(canConfirmBooking(pickup, destination, quote, null, "")).toBe(false);
    expect(canConfirmBooking(pickup, destination, quote, { ...profile, phone: "" }, "")).toBe(false);
    expect(canConfirmBooking(pickup, destination, quote, { ...profile, role: "DRIVER" }, "")).toBe(false);
    expect(canConfirmBooking(pickup, pickup, quote, profile, "")).toBe(false);
  });
  it("rejects invalid fares, routes and schedules", () => {
    for (const invalid of [{ ...quote, currency: "USD" }, { ...quote, fareMinor: 1.5 }, { ...quote, fareMinor: -1 }, { ...quote, estimatedDistanceM: Number.NaN }, { ...quote, route: { geometry: [] } }]) {
      expect(isValidBookingQuote(invalid)).toBe(false);
    }
    const now = Date.UTC(2026, 8, 3);
    expect(canConfirmBooking(pickup, destination, quote, profile, "invalid", now)).toBe(false);
    expect(canConfirmBooking(pickup, destination, quote, profile, new Date(now + 5 * 60_000).toISOString(), now)).toBe(false);
    expect(canConfirmBooking(pickup, destination, quote, profile, new Date(now + 20 * 60_000).toISOString(), now)).toBe(true);
  });
});

describe("fare request input", () => {
  it("requires selected coordinates rather than an address label alone", () => {
    expect(isValidTripLocation({ address: "Broad Street", latitude: Number.NaN, longitude: Number.NaN })).toBe(false);
    expect(canRequestFare(pickup, destination)).toBe(true);
  });

  it("rejects identical and out-of-range route points", () => {
    expect(canRequestFare(pickup, pickup)).toBe(false);
    expect(canRequestFare({ ...pickup, latitude: 91 }, destination)).toBe(false);
  });
});
