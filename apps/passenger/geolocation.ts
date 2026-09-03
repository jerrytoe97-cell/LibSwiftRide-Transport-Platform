export type AccuratePositionOptions = { desiredAccuracyM?: number; maximumAccuracyM?: number; timeoutMs?: number };

export function getMostAccuratePosition(
  geolocation: Geolocation,
  { desiredAccuracyM = 20, maximumAccuracyM = 100, timeoutMs = 15_000 }: AccuratePositionOptions = {}
) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    let best: GeolocationPosition | undefined;
    let settled = false;
    let watchId: number | undefined;
    const finish = (position?: GeolocationPosition, error?: GeolocationPositionError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (watchId !== undefined) geolocation.clearWatch(watchId);
      if (position) resolve(position);
      else reject(error ?? new Error("GPS accuracy is too poor or no reliable position was received. Retry outdoors or enter your pickup manually."));
    };
    const timer = setTimeout(() => finish(best), timeoutMs);
    watchId = geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (![latitude, longitude, accuracy].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0 || accuracy > maximumAccuracyM) return;
        if (!best || position.coords.accuracy < best.coords.accuracy) best = position;
        if (position.coords.accuracy <= desiredAccuracyM) finish(position);
      },
      (error) => finish(best, error),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
    // Some implementations invoke the callback before returning the watch ID.
    if (settled) geolocation.clearWatch(watchId);
  });
}
