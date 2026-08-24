import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "../config.js";
import { buildGoogleRouteRequest, buildRoutingUrl, calculateRoadRoute, decodeGooglePolyline, RoutingError } from "./routing.js";

const pickup = { latitude: 6.3156, longitude: -10.8074 };
const destination = { latitude: 6.3058, longitude: -10.7492 };
const originalRouting = { provider: config.ROUTING_PROVIDER, apiUrl: config.ROUTING_API_URL, apiKey: config.GOOGLE_MAPS_SERVER_API_KEY };
function useGoogle() {
  Object.assign(config, { ROUTING_PROVIDER: "google", ROUTING_API_URL: "https://routes.googleapis.com/directions/v2:computeRoutes", GOOGLE_MAPS_SERVER_API_KEY: "unit-test-server-key" });
}
afterEach(() => Object.assign(config, { ROUTING_PROVIDER: originalRouting.provider, ROUTING_API_URL: originalRouting.apiUrl, GOOGLE_MAPS_SERVER_API_KEY: originalRouting.apiKey }));

describe("road routing", () => {
  it("builds provider-specific URLs", () => {
    const coordinates = "-10.8074,6.3156;-10.7492,6.3058";
    expect(buildRoutingUrl(coordinates, { provider: "osrm", apiUrl: "https://routing.example" })).toContain(`/route/v1/driving/${coordinates}`);
    expect(buildRoutingUrl(coordinates, { provider: "google", apiUrl: "https://routes.googleapis.com/directions/v2:computeRoutes" })).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
  });
  it("decodes Google polylines into GeoJSON coordinate order", () => {
    expect(decodeGooglePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]);
  });
  it("builds a server-authenticated Google Routes request without putting the key in the URL or body", () => {
    const request = buildGoogleRouteRequest(pickup, destination, "server-only-key");
    expect(request).toMatchObject({ method: "POST", headers: { "x-goog-api-key": "server-only-key", "x-goog-fieldmask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline" } });
    expect(JSON.parse(request.body)).toEqual({ origin: { location: { latLng: pickup } }, destination: { location: { latLng: destination } }, travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE" });
    expect(request.body).not.toContain("server-only-key");
  });
  it("returns provider-authoritative OSRM distance, duration and geometry", async () => {
    const provider = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "Ok", routes: [{ distance: 7432.4, duration: 1118.7, geometry: { type: "LineString", coordinates: [[-10.8074, 6.3156], [-10.7492, 6.3058]] } }] }), { status: 200 }));
    await expect(calculateRoadRoute(pickup, destination, provider)).resolves.toEqual({ distanceM: 7432, durationSec: 1119, geometry: [[-10.8074, 6.3156], [-10.7492, 6.3058]] });
  });
  it("returns Google road distance, duration and decoded geometry for the production route shape", async () => {
    useGoogle();
    const provider = vi.fn().mockResolvedValue(new Response(JSON.stringify({ routes: [{ distanceMeters: 12_345, duration: "1567s", polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" } }] }), { status: 200 }));
    await expect(calculateRoadRoute({ latitude: 6.31598, longitude: -10.73624 }, { latitude: 6.25694, longitude: -10.70213 }, provider)).resolves.toEqual({ distanceM: 12_345, durationSec: 1567, geometry: [[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]] });
  });
  it("rejects identical or invalid locations before calling the provider", async () => {
    const provider = vi.fn(); await expect(calculateRoadRoute(pickup, pickup, provider)).rejects.toMatchObject({ code: "INVALID_LOCATION" });
    await expect(calculateRoadRoute({ latitude: 95, longitude: 0 }, destination, provider)).rejects.toBeInstanceOf(RoutingError); expect(provider).not.toHaveBeenCalled();
  });
  it("separates unavailable routes from network failures", async () => {
    await expect(calculateRoadRoute(pickup, destination, vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "NoRoute", routes: [] }), { status: 200 })))).rejects.toMatchObject({ code: "ROUTE_UNAVAILABLE" });
    await expect(calculateRoadRoute(pickup, destination, vi.fn().mockRejectedValue(new Error("offline")))).rejects.toMatchObject({ code: "ROUTING_NETWORK_FAILURE" });
  });
  it.each([
    [400, "INVALID_ARGUMENT", "ROUTING_CONFIGURATION_ERROR", 502],
    [401, "UNAUTHENTICATED", "ROUTING_CONFIGURATION_ERROR", 503],
    [403, "PERMISSION_DENIED", "ROUTING_CONFIGURATION_ERROR", 503],
    [404, "NOT_FOUND", "ROUTE_UNAVAILABLE", 422],
    [429, "RESOURCE_EXHAUSTED", "ROUTING_RATE_LIMITED", 503],
    [500, "INTERNAL", "ROUTING_PROVIDER_FAILURE", 503]
  ])("maps Google HTTP %i safely", async (status, providerStatus, code, httpStatus) => {
    useGoogle();
    const response = new Response(JSON.stringify({ error: { code: status, status: providerStatus, message: "safe provider explanation" } }), { status });
    await expect(calculateRoadRoute(pickup, destination, vi.fn().mockResolvedValue(response))).rejects.toMatchObject({ code, httpStatus });
  });
  it("distinguishes zero routes, malformed responses and invalid polylines", async () => {
    useGoogle();
    await expect(calculateRoadRoute(pickup, destination, vi.fn().mockResolvedValue(new Response(JSON.stringify({ routes: [] }))))).rejects.toMatchObject({ code: "ROUTE_UNAVAILABLE" });
    await expect(calculateRoadRoute(pickup, destination, vi.fn().mockResolvedValue(new Response(JSON.stringify({ routes: [{ distanceMeters: "wrong" }] }))))).rejects.toMatchObject({ code: "ROUTING_RESPONSE_INVALID" });
    await expect(calculateRoadRoute(pickup, destination, vi.fn().mockResolvedValue(new Response(JSON.stringify({ routes: [{ distanceMeters: 10, duration: "2s", polyline: { encodedPolyline: "_" } }] }))))).rejects.toMatchObject({ code: "ROUTING_RESPONSE_INVALID" });
  });
});
