import { describe, expect, it, vi } from "vitest";
import { buildRoutingRequest, buildRoutingUrl, calculateRoadRoute, RoutingError } from "./routing.js";

const pickup = { latitude: 6.3156, longitude: -10.8074 };
const destination = { latitude: 6.3058, longitude: -10.7492 };

describe("road routing", () => {
  it("builds provider-specific URLs without changing coordinate order", () => {
    const coordinates = "-10.8074,6.3156;-10.7492,6.3058";
    expect(buildRoutingUrl(coordinates, { provider: "osrm", apiUrl: "https://routing.example" }))
      .toContain(`/route/v1/driving/${coordinates}`);
    expect(buildRoutingUrl(coordinates, { provider: "mapbox", apiUrl: "https://api.mapbox.com/directions/v5/mapbox/driving", mapboxToken: "token-with-special/value" }))
      .toBe(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?alternatives=false&steps=false&geometries=geojson&overview=full&radiuses=unlimited;unlimited&access_token=token-with-special%2Fvalue`);
  });

  it("rejects an unconfigured Mapbox provider", () => {
    expect(() => buildRoutingUrl("1,2;3,4", { provider: "mapbox", apiUrl: "https://api.mapbox.com/directions/v5/mapbox/driving" }))
      .toThrow("Routing service is not configured");
  });

  it("builds an authenticated Google Routes POST request without putting the key in the URL", () => {
    const request = buildRoutingRequest(pickup, destination, {
      provider: "google", apiUrl: "https://routes.googleapis.com/directions/v2:computeRoutes", googleApiKey: "synthetic-google-key"
    });
    expect(request.url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
    expect(request.init).toMatchObject({
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": "synthetic-google-key",
        "x-goog-fieldmask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline"
      }
    });
    expect(JSON.parse(request.init.body!)).toMatchObject({
      origin: { location: { latLng: pickup } }, destination: { location: { latLng: destination } },
      travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE", computeAlternativeRoutes: false
    });
    expect(JSON.stringify(request)).not.toContain("?key=");
  });

  it("normalizes a Google route response and decoded polyline", async () => {
    const provider = vi.fn().mockResolvedValue(Response.json({ routes: [{
      distanceMeters: 7432, duration: "1119s", polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" }
    }] }));
    await expect(calculateRoadRoute(pickup, destination, provider, {
      provider: "google", apiUrl: "https://routes.googleapis.com/directions/v2:computeRoutes", googleApiKey: "synthetic-google-key"
    })).resolves.toEqual({
      distanceM: 7432, durationSec: 1119,
      geometry: [[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]
    });
  });

  it("returns provider-authoritative distance, duration and GeoJSON coordinates", async () => {
    const provider = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "Ok", routes: [{ distance: 7_432.4, duration: 1_118.7, geometry: { type: "LineString", coordinates: [[-10.8074, 6.3156], [-10.78, 6.31], [-10.7492, 6.3058]] } }] }), { status: 200 }));
    const route = await calculateRoadRoute(pickup, destination, provider);
    expect(route).toEqual({ distanceM: 7432, durationSec: 1119, geometry: [[-10.8074, 6.3156], [-10.78, 6.31], [-10.7492, 6.3058]] });
    expect(provider).toHaveBeenCalledWith(expect.stringContaining("geometries=geojson&overview=full"), expect.objectContaining({ attempts: 2 }));
  });

  it("rejects identical or invalid locations before calling the provider", async () => {
    const provider = vi.fn();
    await expect(calculateRoadRoute(pickup, pickup, provider)).rejects.toMatchObject({ code: "INVALID_LOCATION" });
    await expect(calculateRoadRoute({ latitude: 95, longitude: 0 }, destination, provider)).rejects.toBeInstanceOf(RoutingError);
    expect(provider).not.toHaveBeenCalled();
  });

  it("separates unavailable routes from network failures", async () => {
    await expect(calculateRoadRoute(pickup, destination, vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "NoRoute", routes: [] }), { status: 200 })))).rejects.toMatchObject({ code: "ROUTE_UNAVAILABLE" });
    await expect(calculateRoadRoute(pickup, destination, vi.fn().mockRejectedValue(new Error("offline")))).rejects.toMatchObject({ code: "ROUTING_NETWORK_FAILURE" });
  });
});
