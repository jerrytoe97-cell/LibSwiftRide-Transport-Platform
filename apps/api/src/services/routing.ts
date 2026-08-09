import { z } from "zod";
import { config } from "../config.js";
import { resilientFetch } from "./http-client.js";

export type RouteLocation = { latitude: number; longitude: number };
export type RouteResult = {
  distanceM: number;
  durationSec: number;
  geometry: Array<[number, number]>;
};

export class RoutingError extends Error {
  constructor(public readonly code: "INVALID_LOCATION" | "ROUTE_UNAVAILABLE" | "ROUTING_NETWORK_FAILURE", message: string) {
    super(message);
    this.name = "RoutingError";
  }
}

const routeResponse = z.object({
  code: z.string(),
  routes: z.array(z.object({
    distance: z.number().finite().positive(),
    duration: z.number().finite().positive(),
    geometry: z.object({
      type: z.literal("LineString"),
      coordinates: z.array(z.tuple([z.number().finite(), z.number().finite()])).min(2).max(20_000)
    })
  })).default([])
});

export function buildRoutingUrl(
  coordinates: string,
  settings: { provider: "osrm" | "mapbox"; apiUrl: string; mapboxToken?: string }
) {
  const baseUrl = settings.apiUrl.replace(/\/$/, "");
  if (settings.provider === "mapbox") {
    if (!settings.mapboxToken) throw new RoutingError("ROUTING_NETWORK_FAILURE", "Routing service is not configured");
    return `${baseUrl}/${coordinates}?alternatives=false&steps=false&geometries=geojson&overview=full&access_token=${encodeURIComponent(settings.mapboxToken)}`;
  }
  return `${baseUrl}/route/v1/driving/${coordinates}?alternatives=false&steps=false&geometries=geojson&overview=full`;
}

export async function calculateRoadRoute(
  pickup: RouteLocation,
  destination: RouteLocation,
  fetchRoute: typeof resilientFetch = resilientFetch
): Promise<RouteResult> {
  const values = [pickup.latitude, pickup.longitude, destination.latitude, destination.longitude];
  if (!values.every(Number.isFinite) || pickup.latitude < -90 || pickup.latitude > 90 || destination.latitude < -90 || destination.latitude > 90 || pickup.longitude < -180 || pickup.longitude > 180 || destination.longitude < -180 || destination.longitude > 180) {
    throw new RoutingError("INVALID_LOCATION", "Pickup or destination coordinates are invalid");
  }
  if (Math.abs(pickup.latitude - destination.latitude) < 0.000001 && Math.abs(pickup.longitude - destination.longitude) < 0.000001) {
    throw new RoutingError("INVALID_LOCATION", "Pickup and destination must be different locations");
  }

  const coordinates = `${pickup.longitude},${pickup.latitude};${destination.longitude},${destination.latitude}`;
  const url = buildRoutingUrl(coordinates, {
    provider: config.ROUTING_PROVIDER,
    apiUrl: config.ROUTING_API_URL,
    ...(config.MAPBOX_ROUTING_TOKEN ? { mapboxToken: config.MAPBOX_ROUTING_TOKEN } : {})
  });
  let response: Response;
  try {
    response = await fetchRoute(url, { headers: { accept: "application/json", "user-agent": "LibSwiftRide/0.1 routing" }, timeoutMs: config.ROUTING_TIMEOUT_MS, attempts: 2 });
  } catch {
    throw new RoutingError("ROUTING_NETWORK_FAILURE", "Routing service could not be reached. Try again.");
  }
  if (!response.ok) {
    if (response.status >= 500 || response.status === 408 || response.status === 429) throw new RoutingError("ROUTING_NETWORK_FAILURE", "Routing service is temporarily unavailable. Try again.");
    throw new RoutingError("ROUTE_UNAVAILABLE", "No drivable route is available for those locations");
  }
  const parsed = routeResponse.safeParse(await response.json().catch(() => null));
  if (!parsed.success || parsed.data.code !== "Ok" || !parsed.data.routes[0]) {
    throw new RoutingError("ROUTE_UNAVAILABLE", "No drivable route is available for those locations");
  }
  const route = parsed.data.routes[0];
  return { distanceM: Math.round(route.distance), durationSec: Math.round(route.duration), geometry: route.geometry.coordinates };
}
