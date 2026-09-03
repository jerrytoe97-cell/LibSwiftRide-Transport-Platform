import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@libswiftride/sdk";
import { reverseGeocode, searchAddresses } from "./reverse-geocoding.js";

describe("GPS address lookup", () => {
  afterEach(() => vi.restoreAllMocks());
  it("returns a readable provider address", async () => {
    const request = vi.spyOn(apiClient, "request").mockResolvedValue({ data: { address: "Synthetic Street, Monrovia, Liberia", latitude: 6.31, longitude: -10.8 } });
    await expect(reverseGeocode(6.31, -10.8)).resolves.toBe("Synthetic Street, Monrovia, Liberia");
    expect(request).toHaveBeenCalledWith("/locations/reverse", expect.objectContaining({ method: "POST", body: JSON.stringify({ latitude: 6.31, longitude: -10.8 }) }));
  });
  it("searches through the API without requiring any provider token in the client", async () => {
    const place = { id: "synthetic", address: "Synthetic Street", latitude: 6.31, longitude: -10.8 };
    const request = vi.spyOn(apiClient, "request").mockResolvedValue({ data: [place] });
    await expect(searchAddresses("Synthetic", new AbortController().signal)).resolves.toEqual([place]);
    expect(request).toHaveBeenCalledWith("/locations/search", expect.objectContaining({ method: "POST", body: '{"query":"Synthetic"}' }));
  });
  it("does not invent an address on empty results or provider errors", async () => {
    const request = vi.spyOn(apiClient, "request").mockResolvedValue({ data: null });
    await expect(reverseGeocode(6.31, -10.8)).rejects.toThrow("manually");
    request.mockRejectedValue(new Error("Address lookup unavailable"));
    await expect(reverseGeocode(6.31, -10.8)).rejects.toThrow("unavailable");
  });
  it("rejects invalid GPS and malformed search results", async () => {
    const request = vi.spyOn(apiClient, "request").mockResolvedValue({ data: [{ address: "Invalid", latitude: 100, longitude: 0 }] });
    await expect(reverseGeocode(100, 0)).rejects.toThrow("Invalid GPS");
    expect(request).not.toHaveBeenCalled();
    await expect(searchAddresses("Synthetic", new AbortController().signal)).rejects.toThrow("Invalid address");
  });
});
