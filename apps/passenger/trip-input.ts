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
