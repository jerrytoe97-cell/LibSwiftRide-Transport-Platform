export type LocationSample = {
  latitude: number;
  longitude: number;
  accuracyM: number;
  heading: number | null;
  speedMps: number | null;
  capturedAt: string;
};

export type LocationFailure = "PERMISSION_DENIED" | "UNAVAILABLE" | "TIMEOUT" | "NOT_SECURE";

type NativeLocationBridge = {
  start(options: { minimumIntervalMs: number; minimumDistanceM: number }): Promise<void>;
  stop(): Promise<void>;
};

declare global {
  interface Window { LibSwiftRideNativeLocation?: NativeLocationBridge }
  interface WindowEventMap { "libswiftride:native-location": CustomEvent<LocationSample>; "libswiftride:native-location-error": CustomEvent<{ code: LocationFailure }> }
}

export async function startLocationTracking(input: {
  onLocation: (sample: LocationSample) => void;
  onError: (failure: LocationFailure) => void;
  minimumIntervalMs?: number;
  minimumDistanceM?: number;
}) {
  const minimumIntervalMs = Math.max(2_000, input.minimumIntervalMs ?? 2_000);
  const minimumDistanceM = Math.max(0, input.minimumDistanceM ?? 5);
  const nativeBridge = window.LibSwiftRideNativeLocation;

  if (nativeBridge) {
    const locationListener = (event: CustomEvent<LocationSample>) => input.onLocation(event.detail);
    const errorListener = (event: CustomEvent<{ code: LocationFailure }>) => input.onError(event.detail.code);
    window.addEventListener("libswiftride:native-location", locationListener);
    window.addEventListener("libswiftride:native-location-error", errorListener);
    try {
      await nativeBridge.start({ minimumIntervalMs, minimumDistanceM });
    } catch {
      window.removeEventListener("libswiftride:native-location", locationListener);
      window.removeEventListener("libswiftride:native-location-error", errorListener);
      input.onError("UNAVAILABLE");
      return async () => undefined;
    }
    return async () => {
      window.removeEventListener("libswiftride:native-location", locationListener);
      window.removeEventListener("libswiftride:native-location-error", errorListener);
      await nativeBridge.stop();
    };
  }

  const localDevelopment = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  if (!window.isSecureContext && !localDevelopment) {
    input.onError("NOT_SECURE");
    return async () => undefined;
  }
  if (!navigator.geolocation) {
    input.onError("UNAVAILABLE");
    return async () => undefined;
  }

  const watchId = navigator.geolocation.watchPosition((position) => input.onLocation({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyM: position.coords.accuracy,
    heading: position.coords.heading,
    speedMps: position.coords.speed,
    capturedAt: new Date(position.timestamp).toISOString(),
  }), (error) => input.onError(error.code === error.PERMISSION_DENIED ? "PERMISSION_DENIED" : error.code === error.TIMEOUT ? "TIMEOUT" : "UNAVAILABLE"), {
    enableHighAccuracy: true,
    maximumAge: 3_000,
    timeout: 20_000,
  });
  return async () => navigator.geolocation.clearWatch(watchId);
}
