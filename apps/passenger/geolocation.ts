export type AccuratePositionOptions = { desiredAccuracyM?: number; timeoutMs?: number };

export function getMostAccuratePosition(
  geolocation: Geolocation,
  { desiredAccuracyM = 20, timeoutMs = 15_000 }: AccuratePositionOptions = {}
) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    let best: GeolocationPosition | undefined;
    let settled = false;
    let watchId = 0;
    const finish = (position?: GeolocationPosition, error?: GeolocationPositionError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      geolocation.clearWatch(watchId);
      if (position) resolve(position);
      else reject(error ?? new Error("Location unavailable"));
    };
    const timer = setTimeout(() => finish(best), timeoutMs);
    watchId = geolocation.watchPosition(
      (position) => {
        if (!best || position.coords.accuracy < best.coords.accuracy) best = position;
        if (position.coords.accuracy <= desiredAccuracyM) finish(position);
      },
      (error) => finish(best, error),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}
