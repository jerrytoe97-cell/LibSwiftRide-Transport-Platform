export type BookingLocation = { address: string; latitude: number; longitude: number };

export function isValidCoordinateLocation(location: BookingLocation) {
  return Number.isFinite(location.latitude)
    && location.latitude >= -90
    && location.latitude <= 90
    && Number.isFinite(location.longitude)
    && location.longitude >= -180
    && location.longitude <= 180;
}

export function estimateValidationError(online: boolean, pickup: BookingLocation, destination: BookingLocation) {
  if (!online) return "You are offline. Reconnect before requesting a fare estimate.";
  if (!isValidCoordinateLocation(pickup)) return "Choose a valid pickup from search, a saved place, or GPS before requesting an estimate.";
  if (!isValidCoordinateLocation(destination)) return "Choose a valid destination from the search results or saved places before requesting an estimate.";
  if (Math.abs(pickup.latitude - destination.latitude) < 0.000001 && Math.abs(pickup.longitude - destination.longitude) < 0.000001) {
    return "Pickup and destination must be different locations.";
  }
  return "";
}

export function coordinateAddress(latitude: number, longitude: number) {
  return `GPS location (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
  apiKey: string | undefined,
  fetchGeocode: typeof fetch = fetch
) {
  if (!apiKey) return coordinateAddress(latitude, longitude);
  const query = new URLSearchParams({ latlng: `${latitude},${longitude}`, key: apiKey, language: "en" });
  const response = await fetchGeocode(`https://maps.googleapis.com/maps/api/geocode/json?${query}`);
  if (!response.ok) throw new Error("Reverse geocoding is temporarily unavailable");
  const payload = await response.json() as { status?: string; results?: Array<{ formatted_address?: string }> };
  const address = payload.status === "OK" ? payload.results?.[0]?.formatted_address?.trim() : "";
  if (!address) throw new Error("No readable address was found for this GPS location");
  return address;
}

export function quoteRequestBody(pickup: BookingLocation, destination: BookingLocation, rideType: string, promoCode: string) {
  return JSON.stringify({ pickup, destination, rideType, ...(promoCode.trim() ? { promoCode: promoCode.trim() } : {}) });
}
