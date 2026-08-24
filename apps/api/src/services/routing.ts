import { z } from "zod";
import { config } from "../config.js";
import { resilientFetch } from "./http-client.js";

export type RouteLocation = { latitude: number; longitude: number };
export type RouteResult = { distanceM: number; durationSec: number; geometry: Array<[number, number]> };
export class RoutingError extends Error {
  constructor(public readonly code: "INVALID_LOCATION" | "ROUTE_UNAVAILABLE" | "ROUTING_NETWORK_FAILURE", message: string) { super(message); this.name = "RoutingError"; }
}
const osrmResponse = z.object({ code: z.string(), routes: z.array(z.object({ distance: z.number().finite().positive(), duration: z.number().finite().positive(), geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(z.tuple([z.number().finite(), z.number().finite()])).min(2).max(20_000) }) })).default([]) });
const googleResponse = z.object({ routes: z.array(z.object({ distanceMeters: z.number().finite().positive(), duration: z.string().regex(/^\d+(?:\.\d+)?s$/), polyline: z.object({ encodedPolyline: z.string().min(1) }) })).default([]) });

export function buildRoutingUrl(coordinates: string, settings: { provider: "osrm" | "google"; apiUrl: string }) {
  const baseUrl = settings.apiUrl.replace(/\/$/, "");
  return settings.provider === "google" ? baseUrl : `${baseUrl}/route/v1/driving/${coordinates}?alternatives=false&steps=false&geometries=geojson&overview=full`;
}
export function buildGoogleRouteRequest(pickup: RouteLocation, destination: RouteLocation, apiKey: string) {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
      "x-goog-fieldmask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline"
    },
    body: JSON.stringify({
      origin: { location: { latLng: pickup } },
      destination: { location: { latLng: destination } },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE"
    }),
    timeoutMs: config.ROUTING_TIMEOUT_MS,
    attempts: 2
  };
}
export function decodeGooglePolyline(encoded: string): Array<[number, number]> {
  const points: Array<[number, number]> = []; let index = 0, latitude = 0, longitude = 0;
  while (index < encoded.length) {
    const decode = () => { let result = 0, shift = 0, byte: number; do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20 && index <= encoded.length); return (result & 1) ? ~(result >> 1) : result >> 1; };
    latitude += decode(); longitude += decode(); points.push([longitude / 1e5, latitude / 1e5]);
  }
  if (points.length < 2) throw new RoutingError("ROUTE_UNAVAILABLE", "No drivable route is available for those locations");
  return points;
}
export async function calculateRoadRoute(pickup: RouteLocation, destination: RouteLocation, fetchRoute: typeof resilientFetch = resilientFetch): Promise<RouteResult> {
  const values = [pickup.latitude, pickup.longitude, destination.latitude, destination.longitude];
  if (!values.every(Number.isFinite) || pickup.latitude < -90 || pickup.latitude > 90 || destination.latitude < -90 || destination.latitude > 90 || pickup.longitude < -180 || pickup.longitude > 180 || destination.longitude < -180 || destination.longitude > 180) throw new RoutingError("INVALID_LOCATION", "Pickup or destination coordinates are invalid");
  if (Math.abs(pickup.latitude - destination.latitude) < 0.000001 && Math.abs(pickup.longitude - destination.longitude) < 0.000001) throw new RoutingError("INVALID_LOCATION", "Pickup and destination must be different locations");
  const coordinates = `${pickup.longitude},${pickup.latitude};${destination.longitude},${destination.latitude}`;
  const url = buildRoutingUrl(coordinates, { provider: config.ROUTING_PROVIDER, apiUrl: config.ROUTING_API_URL });
  const google = config.ROUTING_PROVIDER === "google";
  const init = google ? buildGoogleRouteRequest(pickup, destination, config.GOOGLE_MAPS_SERVER_API_KEY!) : { headers: { accept: "application/json", "user-agent": "LibSwiftRide/0.1 routing" }, timeoutMs: config.ROUTING_TIMEOUT_MS, attempts: 2 };
  let response: Response;
  try { response = await fetchRoute(url, init); } catch { throw new RoutingError("ROUTING_NETWORK_FAILURE", "Routing service could not be reached. Try again."); }
  if (!response.ok) { if (response.status >= 500 || response.status === 408 || response.status === 429) throw new RoutingError("ROUTING_NETWORK_FAILURE", "Routing service is temporarily unavailable. Try again."); throw new RoutingError("ROUTE_UNAVAILABLE", "No drivable route is available for those locations"); }
  const payload = await response.json().catch(() => null);
  if (google) {
    const parsed = googleResponse.safeParse(payload); const route = parsed.success ? parsed.data.routes[0] : undefined;
    if (!route) throw new RoutingError("ROUTE_UNAVAILABLE", "No drivable route is available for those locations");
    return { distanceM: Math.round(route.distanceMeters), durationSec: Math.round(Number.parseFloat(route.duration) || 0), geometry: decodeGooglePolyline(route.polyline.encodedPolyline) };
  }
  const parsed = osrmResponse.safeParse(payload); const route = parsed.success && parsed.data.code === "Ok" ? parsed.data.routes[0] : undefined;
  if (!route) throw new RoutingError("ROUTE_UNAVAILABLE", "No drivable route is available for those locations");
  return { distanceM: Math.round(route.distance), durationSec: Math.round(route.duration), geometry: route.geometry.coordinates };
}
