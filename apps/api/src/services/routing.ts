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

const googleRouteResponse = z.object({
  routes: z.array(z.object({
    distanceMeters: z.number().int().positive(),
    duration: z.string().regex(/^\d+(?:\.\d+)?s$/),
    polyline: z.object({ encodedPolyline: z.string().min(1).max(200_000) })
  })).default([])
});

export type RoutingSettings = {
  provider: "osrm" | "mapbox" | "google";
  apiUrl: string;
  mapboxToken?: string;
  googleApiKey?: string;
};

export function buildRoutingUrl(
  coordinates: string,
  settings: Pick<RoutingSettings, "provider" | "apiUrl" | "mapboxToken">
) {
  const baseUrl = settings.apiUrl.replace(/\/$/, "");
  if (settings.provider === "mapbox") {
    if (!settings.mapboxToken) throw new RoutingError("ROUTING_NETWORK_FAILURE", "Routing service is not configured");
    return `${baseUrl}/${coordinates}?alternatives=false&steps=false&geometries=geojson&overview=full&radiuses=unlimited;unlimited&access_token=${encodeURIComponent(settings.mapboxToken)}`;
  }
  return `${baseUrl}/route/v1/driving/${coordinates}?alternatives=false&steps=false&geometries=geojson&overview=full`;
}

export function buildRoutingRequest(pickup: RouteLocation, destination: RouteLocation, settings: RoutingSettings) {
  if (settings.provider !== "google") {
    const coordinates = `${pickup.longitude},${pickup.latitude};${destination.longitude},${destination.latitude}`;
    return {
      url: buildRoutingUrl(coordinates, settings),
      init: { headers: { accept: "application/json", "user-agent": "LibSwiftRide/0.1 routing" } }
    };
  }
  if (!settings.googleApiKey) throw new RoutingError("ROUTING_NETWORK_FAILURE", "Routing service is not configured");
  return {
    url: settings.apiUrl.replace(/\/$/, ""),
    init: {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-goog-api-key": settings.googleApiKey,
        "x-goog-fieldmask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline"
      },
      body: JSON.stringify({
        origin: { location: { latLng: pickup } },
        destination: { location: { latLng: destination } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        computeAlternativeRoutes: false,
        polylineQuality: "HIGH_QUALITY",
        polylineEncoding: "ENCODED_POLYLINE",
        languageCode: "en-US",
        units: "METRIC"
      })
    }
  };
}

function decodeGooglePolyline(encoded: string): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  while (index < encoded.length) {
    const deltas: number[] = [];
    for (let axis = 0; axis < 2; axis += 1) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        if (index >= encoded.length || shift > 30) throw new Error("Invalid encoded polyline");
        byte = encoded.charCodeAt(index++) - 63;
        if (byte < 0 || byte > 63) throw new Error("Invalid encoded polyline");
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      deltas.push((result & 1) ? ~(result >> 1) : result >> 1);
    }
    latitude += deltas[0]!;
    longitude += deltas[1]!;
    points.push([longitude / 100_000, latitude / 100_000]);
    if (points.length > 20_000) throw new Error("Route geometry is too large");
  }
  if (points.length < 2 || points.some(([lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90)) {
    throw new Error("Invalid route geometry");
  }
  return points;
}

export async function calculateRoadRoute(
  pickup: RouteLocation,
  destination: RouteLocation,
  fetchRoute: typeof resilientFetch = resilientFetch,
  settings: RoutingSettings = {
    provider: config.ROUTING_PROVIDER,
    apiUrl: config.ROUTING_API_URL,
    ...(config.MAPBOX_ROUTING_TOKEN ? { mapboxToken: config.MAPBOX_ROUTING_TOKEN } : {}),
    ...(config.GOOGLE_ROUTES_API_KEY ? { googleApiKey: config.GOOGLE_ROUTES_API_KEY } : {})
  }
): Promise<RouteResult> {
  const values = [pickup.latitude, pickup.longitude, destination.latitude, destination.longitude];
  if (!values.every(Number.isFinite) || pickup.latitude < -90 || pickup.latitude > 90 || destination.latitude < -90 || destination.latitude > 90 || pickup.longitude < -180 || pickup.longitude > 180 || destination.longitude < -180 || destination.longitude > 180) {
    throw new RoutingError("INVALID_LOCATION", "Pickup or destination coordinates are invalid");
  }
  if (Math.abs(pickup.latitude - destination.latitude) < 0.000001 && Math.abs(pickup.longitude - destination.longitude) < 0.000001) {
    throw new RoutingError("INVALID_LOCATION", "Pickup and destination must be different locations");
  }

  const request = buildRoutingRequest(pickup, destination, settings);
  let response: Response;
  try {
    response = await fetchRoute(request.url, { ...request.init, timeoutMs: config.ROUTING_TIMEOUT_MS, attempts: 2 });
  } catch {
    throw new RoutingError("ROUTING_NETWORK_FAILURE", "Routing service could not be reached. Try again.");
  }
  if (!response.ok) {
    if (response.status >= 500 || response.status === 408 || response.status === 429) throw new RoutingError("ROUTING_NETWORK_FAILURE", "Routing service is temporarily unavailable. Try again.");
    throw new RoutingError("ROUTE_UNAVAILABLE", "No drivable route is available for those locations");
  }
  const payload = await response.json().catch(() => null);
  if (settings.provider === "google") {
    const parsed = googleRouteResponse.safeParse(payload);
    const route = parsed.success ? parsed.data.routes[0] : undefined;
    if (!route) throw new RoutingError("ROUTE_UNAVAILABLE", "No drivable route is available for those locations");
    try {
      return {
        distanceM: route.distanceMeters,
        durationSec: Math.round(Number.parseFloat(route.duration.slice(0, -1))),
        geometry: decodeGooglePolyline(route.polyline.encodedPolyline)
      };
    } catch {
      throw new RoutingError("ROUTE_UNAVAILABLE", "No drivable route is available for those locations");
    }
  }
  const parsed = routeResponse.safeParse(payload);
  if (!parsed.success || parsed.data.code !== "Ok" || !parsed.data.routes[0]) {
    throw new RoutingError("ROUTE_UNAVAILABLE", "No drivable route is available for those locations");
  }
  const route = parsed.data.routes[0];
  return { distanceM: Math.round(route.distance), durationSec: Math.round(route.duration), geometry: route.geometry.coordinates };
}
