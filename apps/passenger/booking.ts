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

type GeocoderResult = { formatted_address?: string };
type GeocoderResponse = { results?: GeocoderResult[] };
type Geocoder = {
  geocode(request: { location: { lat: number; lng: number } }): Promise<GeocoderResponse>;
};
type GeocodingLibrary = { Geocoder: new () => Geocoder };
type GoogleMapsApi = { importLibrary(name: "geocoding"): Promise<GeocodingLibrary> };
type GoogleMapsWindow = Window & typeof globalThis & { google?: { maps?: GoogleMapsApi } };

let googleMapsLoad: Promise<GoogleMapsApi> | undefined;

export function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  const mapsWindow = window as GoogleMapsWindow;
  if (mapsWindow.google?.maps?.importLibrary) return Promise.resolve(mapsWindow.google.maps);
  if (googleMapsLoad) return googleMapsLoad;

  googleMapsLoad = new Promise((resolve, reject) => {
    const callbackName = `__libSwiftRideMapsReady_${crypto.randomUUID().replaceAll("-", "")}`;
    const callbackWindow = mapsWindow as GoogleMapsWindow & Record<string, unknown>;
    const script = document.createElement("script");
    const cleanup = () => { delete callbackWindow[callbackName]; };

    callbackWindow[callbackName] = () => {
      cleanup();
      const maps = mapsWindow.google?.maps;
      if (maps?.importLibrary) resolve(maps);
      else {
        googleMapsLoad = undefined;
        reject(new Error("Google Maps did not finish loading"));
      }
    };
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key: apiKey, loading: "async", callback: callbackName })}`;
    script.onerror = () => {
      cleanup();
      googleMapsLoad = undefined;
      reject(new Error("Google Maps could not be loaded"));
    };
    document.head.append(script);
  });

  return googleMapsLoad;
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
  apiKey: string | undefined,
  loadMaps: (apiKey: string) => Promise<GoogleMapsApi> = loadGoogleMaps
) {
  if (!apiKey) return coordinateAddress(latitude, longitude);
  try {
    const maps = await loadMaps(apiKey);
    const { Geocoder } = await maps.importLibrary("geocoding");
    const { results = [] } = await new Geocoder().geocode({ location: { lat: latitude, lng: longitude } });
    const address = results.find((result) => result.formatted_address?.trim())?.formatted_address?.trim();
    return address || coordinateAddress(latitude, longitude);
  } catch {
    throw new Error("The readable address service is temporarily unavailable. Check your connection and try GPS again.");
  }
}

export function quoteRequestBody(pickup: BookingLocation, destination: BookingLocation, rideType: string, promoCode: string) {
  return JSON.stringify({ pickup, destination, rideType, ...(promoCode.trim() ? { promoCode: promoCode.trim() } : {}) });
}
