export type TripLocation = { address: string; latitude: number; longitude: number };

export function isValidTripLocation(location: TripLocation) {
  return location.address.trim().length >= 3
    && Number.isFinite(location.latitude) && location.latitude >= -90 && location.latitude <= 90
    && Number.isFinite(location.longitude) && location.longitude >= -180 && location.longitude <= 180;
}

export function canRequestFare(pickup: TripLocation, destination: TripLocation) {
  return isValidTripLocation(pickup)
    && isValidTripLocation(destination)
    && (Math.abs(pickup.latitude - destination.latitude) >= 0.000001
      || Math.abs(pickup.longitude - destination.longitude) >= 0.000001);
}

export type PassengerProfile = { firstName: string; lastName: string; phone: string; role: string; status: string };
export type BookingQuote = {
  fareMinor: number; currency: string; estimatedDistanceM: number; estimatedDurationSec: number;
  route: { geometry: Array<[number, number]> };
};

export function isValidBookingQuote(quote: BookingQuote | null): boolean {
  return Boolean(quote && Number.isSafeInteger(quote.fareMinor) && quote.fareMinor >= 0
    && quote.currency === "LRD"
    && Number.isFinite(quote.estimatedDistanceM) && quote.estimatedDistanceM > 0
    && Number.isFinite(quote.estimatedDurationSec) && quote.estimatedDurationSec > 0
    && Array.isArray(quote.route?.geometry) && quote.route.geometry.length >= 2
    && quote.route.geometry.every((point) => Array.isArray(point) && point.length === 2
      && point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90));
}

export function canConfirmBooking(pickup: TripLocation, destination: TripLocation, quote: BookingQuote | null,
  passenger: PassengerProfile | null, scheduledFor: string, now = Date.now()) {
  const scheduledAt = scheduledFor ? new Date(scheduledFor).getTime() : null;
  return canRequestFare(pickup, destination) && isValidBookingQuote(quote)
    && Boolean(passenger && passenger.role === "PASSENGER" && passenger.status === "ACTIVE"
      && passenger.firstName.trim() && passenger.lastName.trim() && passenger.phone.trim())
    && (scheduledAt === null || (Number.isFinite(scheduledAt) && scheduledAt >= now + 15 * 60_000 && scheduledAt <= now + 30 * 86_400_000));
}
