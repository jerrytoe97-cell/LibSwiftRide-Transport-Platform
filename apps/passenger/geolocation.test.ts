import { describe, expect, it, vi } from "vitest";
import { getMostAccuratePosition } from "./geolocation.js";

function position(latitude: number, longitude: number, accuracy: number) {
  return { coords: { latitude, longitude, accuracy } } as GeolocationPosition;
}

describe("high-accuracy pickup location", () => {
  it("keeps watching until a sufficiently accurate fresh reading arrives", async () => {
    const clearWatch = vi.fn();
    const geolocation = {
      watchPosition(success: PositionCallback, _error: PositionErrorCallback | null, options?: PositionOptions) {
        expect(options).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
        setTimeout(() => success(position(6.31, -10.80, 80)), 0);
        setTimeout(() => success(position(6.3156, -10.8074, 8)), 1);
        return 7;
      },
      clearWatch
    } as unknown as Geolocation;
    await expect(getMostAccuratePosition(geolocation, { desiredAccuracyM: 15, timeoutMs: 100 }))
      .resolves.toMatchObject({ coords: { latitude: 6.3156, longitude: -10.8074, accuracy: 8 } });
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it("returns the best available reading when the accuracy target is not reached", async () => {
    const geolocation = {
      watchPosition(success: PositionCallback) {
        setTimeout(() => success(position(6.3, -10.8, 90)), 0);
        setTimeout(() => success(position(6.31, -10.81, 35)), 1);
        return 9;
      },
      clearWatch: vi.fn()
    } as unknown as Geolocation;
    await expect(getMostAccuratePosition(geolocation, { desiredAccuracyM: 10, timeoutMs: 10 }))
      .resolves.toMatchObject({ coords: { accuracy: 35 } });
  });
});
