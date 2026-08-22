const EARTH_RADIUS_M = 6_371_000;

export function distanceMetres(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(to.latitude - from.latitude);
  const dLon = radians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function estimateEtaSeconds(distanceM: number, speedMps = 8.33) {
  if (!Number.isFinite(distanceM) || distanceM < 0 || !Number.isFinite(speedMps) || speedMps <= 0) throw new Error("Invalid ETA input");
  return Math.ceil(distanceM / Math.max(speedMps, 2.78));
}
