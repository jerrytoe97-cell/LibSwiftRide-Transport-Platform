import { z } from "zod";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { resilientFetch } from "./http-client.js";

export type RouteLocation = { latitude: number; longitude: number };
export type RouteResult = { distanceM: number; durationSec: number; geometry: Array<[number, number]> };
export type RoutingErrorCode = "INVALID_LOCATION" | "ROUTE_UNAVAILABLE" | "ROUTING_CONFIGURATION_ERROR" | "ROUTING_RATE_LIMITED" | "ROUTING_PROVIDER_FAILURE" | "ROUTING_NETWORK_FAILURE" | "ROUTING_RESPONSE_INVALID";
export class RoutingError extends Error {
  constructor(public readonly code: RoutingErrorCode, message: string, public readonly httpStatus: number) { super(message); this.name = "RoutingError"; }
}
const osrmResponse = z.object({ code: z.string(), routes: z.array(z.object({ distance: z.number().finite().positive(), duration: z.number().finite().positive(), geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(z.tuple([z.number().finite(), z.number().finite()])).min(2).max(20_000) }) })).default([]) });
const googleResponse = z.object({ routes: z.array(z.object({ distanceMeters: z.number().finite().positive(), duration: z.string().regex(/^\d+(?:\.\d+)?s$/), polyline: z.object({ encodedPolyline: z.string().min(1) }) })).default([]) });
const googleErrorResponse = z.object({ error: z.object({ code: z.number().int().optional(), status: z.string().max(80).optional(), message: z.string().max(2_000).optional() }) });

export function buildRoutingUrl(coordinates: string, settings: { provider: "osrm" | "google"; apiUrl: string }) {
  const baseUrl = settings.apiUrl.replace(/\/$/, "");
  return settings.provider === "google" ? baseUrl : `${baseUrl}/route/v1/driving/${coordinates}?alternatives=false&steps=false&geometries=geojson&overview=full`;
}
export function buildGoogleRouteRequest(pickup: RouteLocation, destination: RouteLocation, apiKey: string) {
  return { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey, "x-goog-fieldmask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline" }, body: JSON.stringify({ origin: { location: { latLng: pickup } }, destination: { location: { latLng: destination } }, travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE" }), timeoutMs: config.ROUTING_TIMEOUT_MS, attempts: 2 };
}
function sanitizeProviderMessage(message?: string) {
  if (!message) return undefined;
  return message.replace(/https?:\/\/\S+/gi, "[url]").replace(/(?:api[_ -]?key|key|token)\s*[=:]\s*\S+/gi, "credential=[redacted]").replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]").replace(/[\r\n\t]+/g, " ").slice(0, 240);
}
async function googleFailure(response: Response, context: { requestId?: string; rideRequestId?: string }) {
  const payload = await response.clone().json().catch(() => null);
  const parsed = googleErrorResponse.safeParse(payload);
  const providerStatus = parsed.success ? parsed.data.error.status : undefined;
  const providerMessage = parsed.success ? sanitizeProviderMessage(parsed.data.error.message) : undefined;
  logger.warn({ routingProvider: "google", httpStatus: response.status, providerStatus, providerCode: parsed.success ? parsed.data.error.code : undefined, providerMessage, ...context }, "routing provider request failed");
  if (response.status === 400) return new RoutingError("ROUTING_CONFIGURATION_ERROR", "Routing could not process this request. Please verify the locations or contact support.", 502);
  if (response.status === 401 || response.status === 403) return new RoutingError("ROUTING_CONFIGURATION_ERROR", "Ride estimates are unavailable because routing is not configured correctly.", 503);
  if (response.status === 404) return new RoutingError("ROUTE_UNAVAILABLE", "No drivable route is available for those locations.", 422);
  if (response.status === 429) return new RoutingError("ROUTING_RATE_LIMITED", "Routing is busy right now. Please try again shortly.", 503);
  if (response.status >= 500) return new RoutingError("ROUTING_PROVIDER_FAILURE", "Routing is temporarily unavailable. Please try again.", 503);
  return new RoutingError("ROUTING_PROVIDER_FAILURE", "Routing is temporarily unavailable. Please try again.", 502);
}
export function decodeGooglePolyline(encoded: string): Array<[number, number]> {
  const points: Array<[number, number]> = []; let index = 0, latitude = 0, longitude = 0;
  const decode = () => { let result = 0, shift = 0; while (true) { if (index >= encoded.length || shift > 30) throw new RoutingError("ROUTING_RESPONSE_INVALID", "Routing returned an invalid route.", 502); const byte = encoded.charCodeAt(index++) - 63; if (byte < 0 || byte > 63) throw new RoutingError("ROUTING_RESPONSE_INVALID", "Routing returned an invalid route.", 502); result |= (byte & 0x1f) << shift; if (byte < 0x20) break; shift += 5; } return (result & 1) ? ~(result >> 1) : result >> 1; };
  while (index < encoded.length) { latitude += decode(); longitude += decode(); const point: [number, number] = [longitude / 1e5, latitude / 1e5]; if (!point.every(Number.isFinite)) throw new RoutingError("ROUTING_RESPONSE_INVALID", "Routing returned an invalid route.", 502); points.push(point); }
  if (points.length < 2) throw new RoutingError("ROUTING_RESPONSE_INVALID", "Routing returned an invalid route.", 502);
  return points;
}
export async function calculateRoadRoute(pickup: RouteLocation, destination: RouteLocation, fetchRoute: typeof resilientFetch = resilientFetch, context: { requestId?: string; rideRequestId?: string } = {}): Promise<RouteResult> {
  const values = [pickup.latitude, pickup.longitude, destination.latitude, destination.longitude];
  if (!values.every(Number.isFinite) || pickup.latitude < -90 || pickup.latitude > 90 || destination.latitude < -90 || destination.latitude > 90 || pickup.longitude < -180 || pickup.longitude > 180 || destination.longitude < -180 || destination.longitude > 180) throw new RoutingError("INVALID_LOCATION", "Pickup or destination coordinates are invalid.", 422);
  if (Math.abs(pickup.latitude - destination.latitude) < 0.000001 && Math.abs(pickup.longitude - destination.longitude) < 0.000001) throw new RoutingError("INVALID_LOCATION", "Pickup and destination must be different locations.", 422);
  const coordinates = `${pickup.longitude},${pickup.latitude};${destination.longitude},${destination.latitude}`;
  const url = buildRoutingUrl(coordinates, { provider: config.ROUTING_PROVIDER, apiUrl: config.ROUTING_API_URL });
  const google = config.ROUTING_PROVIDER === "google";
  const init = google ? buildGoogleRouteRequest(pickup, destination, config.GOOGLE_MAPS_SERVER_API_KEY!) : { headers: { accept: "application/json", "user-agent": "LibSwiftRide/0.1 routing" }, timeoutMs: config.ROUTING_TIMEOUT_MS, attempts: 2 };
  let response: Response;
  try { response = await fetchRoute(url, init); } catch { logger.warn({ routingProvider: config.ROUTING_PROVIDER, failure: "network", ...context }, "routing provider could not be reached"); throw new RoutingError("ROUTING_NETWORK_FAILURE", "The routing service could not be reached. Check your connection and try again.", 503); }
  if (!response.ok) { if (google) throw await googleFailure(response, context); if (response.status === 404) throw new RoutingError("ROUTE_UNAVAILABLE", "No drivable route is available for those locations.", 422); throw new RoutingError(response.status === 429 ? "ROUTING_RATE_LIMITED" : "ROUTING_PROVIDER_FAILURE", "Routing is temporarily unavailable. Please try again.", 503); }
  const payload = await response.json().catch(() => null);
  if (google) {
    const parsed = googleResponse.safeParse(payload);
    if (!parsed.success) { logger.warn({ routingProvider: "google", failure: "malformed_response", ...context }, "routing provider returned an invalid response"); throw new RoutingError("ROUTING_RESPONSE_INVALID", "Routing returned an invalid response. Please try again.", 502); }
    const route = parsed.data.routes[0];
    if (!route) throw new RoutingError("ROUTE_UNAVAILABLE", "No drivable route is available for those locations.", 422);
    return { distanceM: Math.round(route.distanceMeters), durationSec: Math.round(Number.parseFloat(route.duration)), geometry: decodeGooglePolyline(route.polyline.encodedPolyline) };
  }
  const parsed = osrmResponse.safeParse(payload); const route = parsed.success && parsed.data.code === "Ok" ? parsed.data.routes[0] : undefined;
  if (!route) throw new RoutingError("ROUTE_UNAVAILABLE", "No drivable route is available for those locations.", 422);
  return { distanceM: Math.round(route.distance), durationSec: Math.round(route.duration), geometry: route.geometry.coordinates };
}
