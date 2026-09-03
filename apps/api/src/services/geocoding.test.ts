import { describe, expect, it, vi } from "vitest";
import { geocode } from "./geocoding.js";

const settings = { enabled: true, token: "synthetic-test-credential" };
const feature = { geometry: { type: "Point", coordinates: [-10.8, 6.31] }, properties: { mapbox_id: "synthetic", full_address: "Synthetic Street, Monrovia" } };
describe("server-side address lookup", () => {
  it("uses permanent Liberia geocoding and returns only normalized places", async () => {
    const provider = vi.fn().mockResolvedValue(Response.json({ features: [feature] }));
    await expect(geocode({ query: "Synthetic Street" }, provider, settings)).resolves.toEqual([{ id: "synthetic", address: "Synthetic Street, Monrovia", latitude: 6.31, longitude: -10.8 }]);
    const url = new URL(provider.mock.calls[0]![0]);
    expect(url.pathname).toBe("/search/geocode/v6/forward");
    expect(url.searchParams.get("country")).toBe("LR");
    expect(url.searchParams.get("permanent")).toBe("true");
    expect(provider).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ timeoutMs: 8000, attempts: 1, redirect: "error" }));
  });
  it("reverse geocodes without an invalid multi-type limit", async () => {
    const provider = vi.fn().mockResolvedValue(Response.json({ features: [feature] }));
    await geocode({ latitude: 6.31, longitude: -10.8 }, provider, settings);
    const url = new URL(provider.mock.calls[0]![0]);
    expect(url.pathname).toBe("/search/geocode/v6/reverse");
    expect(url.searchParams.has("limit")).toBe(false);
  });
  it("does not call the provider when disabled or input is invalid", async () => {
    const provider = vi.fn();
    await expect(geocode({ query: "Synthetic" }, provider, { ...settings, enabled: false })).rejects.toThrow("unavailable");
    await expect(geocode({ latitude: 100, longitude: 0 }, provider, settings)).rejects.toThrow();
    await expect(geocode({ query: "x;y" }, provider, settings)).rejects.toThrow();
    expect(provider).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])("sanitizes provider HTTP %s failures", async (status) => {
    await expect(geocode({ query: "Synthetic" }, vi.fn().mockResolvedValue(new Response(null, { status })), settings)).rejects.toThrow("Address lookup is unavailable");
  });
  it("fails closed on timeout, malformed JSON and invalid coordinates without leaking provider errors", async () => {
    for (const provider of [vi.fn().mockRejectedValue(new Error("synthetic URL/token must not escape")),
      vi.fn().mockResolvedValue(new Response("invalid json")),
      vi.fn().mockResolvedValue(Response.json({ features: [{ ...feature, geometry: { type: "Point", coordinates: [999, 0] } }] }))]) {
      await expect(geocode({ query: "Synthetic" }, provider, settings)).rejects.toThrow(/^Address lookup is unavailable\./);
    }
  });
});
