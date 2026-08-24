import { describe, expect, it, vi } from "vitest";
import { coordinateAddress, estimateValidationError, quoteRequestBody, reverseGeocode } from "./booking.js";

const pickup = { address: "GPS location", latitude: 6.3156, longitude: -10.8074 };
const destination = { address: "SKD Complex", latitude: 6.25694, longitude: -10.70213 };

describe("Passenger fare estimate inputs", () => {
  it("enables an estimate from valid GPS pickup and destination coordinates", () => {
    expect(estimateValidationError(true, pickup, destination)).toBe("");
  });

  it("explains invalid, identical and offline estimate states", () => {
    expect(estimateValidationError(true, { ...pickup, latitude: Number.NaN }, destination)).toContain("valid pickup");
    expect(estimateValidationError(true, pickup, pickup)).toContain("different locations");
    expect(estimateValidationError(false, pickup, destination)).toContain("offline");
  });

  it("builds the authenticated API client's quote payload from coordinates", () => {
    expect(JSON.parse(quoteRequestBody(pickup, destination, "ECONOMY", " SAVE2 "))).toEqual({ pickup, destination, rideType: "ECONOMY", promoCode: "SAVE2" });
  });
});

describe("GPS reverse geocoding", () => {
  it("returns Google's exact formatted address", async () => {
    const geocode = vi.fn().mockResolvedValue({ results: [{ formatted_address: "Broad Street, Monrovia, Liberia" }] });
    const importLibrary = vi.fn().mockResolvedValue({ Geocoder: class { geocode = geocode; } });
    const loadMaps = vi.fn().mockResolvedValue({ importLibrary });

    await expect(reverseGeocode(6.3156, -10.8074, "browser-key", loadMaps)).resolves.toBe("Broad Street, Monrovia, Liberia");
    expect(loadMaps).toHaveBeenCalledWith("browser-key");
    expect(importLibrary).toHaveBeenCalledWith("geocoding");
    expect(geocode).toHaveBeenCalledWith({ location: { lat: 6.3156, lng: -10.8074 } });
  });

  it("uses a coordinate label when Google returns no readable results", async () => {
    const importLibrary = vi.fn().mockResolvedValue({ Geocoder: class { geocode = vi.fn().mockResolvedValue({ results: [] }); } });
    await expect(reverseGeocode(6.3156, -10.8074, "browser-key", vi.fn().mockResolvedValue({ importLibrary })))
      .resolves.toBe(coordinateAddress(6.3156, -10.8074));
  });

  it("uses a coordinate label without a browser key and surfaces provider failures", async () => {
    await expect(reverseGeocode(6.3156, -10.8074, undefined)).resolves.toBe(coordinateAddress(6.3156, -10.8074));
    const importLibrary = vi.fn().mockResolvedValue({ Geocoder: class { geocode = vi.fn().mockRejectedValue(new Error("REQUEST_DENIED")); } });
    await expect(reverseGeocode(6.3156, -10.8074, "browser-key", vi.fn().mockResolvedValue({ importLibrary })))
      .rejects.toThrow("readable address service is temporarily unavailable");
  });
});
