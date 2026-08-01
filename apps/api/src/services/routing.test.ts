import { describe, expect, it, vi } from "vitest";
import { calculateRoadRoute, RoutingError } from "./routing.js";

const pickup = { latitude: 6.3156, longitude: -10.8074 };
const destination = { latitude: 6.3058, longitude: -10.7492 };

describe("road routing", () => {
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
