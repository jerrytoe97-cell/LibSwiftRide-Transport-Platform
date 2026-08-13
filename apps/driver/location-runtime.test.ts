import { afterEach, describe, expect, it, vi } from "vitest";
import { startLocationTracking, type LocationSample } from "./location-runtime.js";

const sample: LocationSample = { latitude: 6.3156, longitude: -10.8074, accuracyM: 8, heading: 90, speedMps: 4, capturedAt: "2026-08-13T12:00:00.000Z" };

describe("driver location runtime", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses and stops the native background-location bridge when packaged", async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn().mockResolvedValue(undefined);
    const listeners = new Map<string, EventListener>();
    vi.stubGlobal("window", {
      LibSwiftRideNativeLocation: { start, stop },
      addEventListener: vi.fn((name: string, listener: EventListener) => listeners.set(name, listener)),
      removeEventListener: vi.fn((name: string) => listeners.delete(name)),
    });
    const onLocation = vi.fn();
    const cleanup = await startLocationTracking({ onLocation, onError: vi.fn() });
    expect(start).toHaveBeenCalledWith({ minimumIntervalMs: 2_000, minimumDistanceM: 5 });
    listeners.get("libswiftride:native-location")?.({ detail: sample } as unknown as Event);
    expect(onLocation).toHaveBeenCalledWith(sample);
    await cleanup();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("reports blocked insecure contexts before requesting browser GPS", async () => {
    vi.stubGlobal("window", { location: { hostname: "driver.example.test" }, isSecureContext: false });
    vi.stubGlobal("navigator", { geolocation: { watchPosition: vi.fn() } });
    const onError = vi.fn();
    await startLocationTracking({ onLocation: vi.fn(), onError });
    expect(onError).toHaveBeenCalledWith("NOT_SECURE");
    expect(navigator.geolocation.watchPosition).not.toHaveBeenCalled();
  });

  it("requests high-accuracy foreground GPS and clears the watcher", async () => {
    const clearWatch = vi.fn();
    const watchPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: sample.latitude, longitude: sample.longitude, accuracy: sample.accuracyM, heading: sample.heading, speed: sample.speedMps }, timestamp: Date.parse(sample.capturedAt) } as GeolocationPosition);
      return 42;
    });
    vi.stubGlobal("window", { location: { hostname: "localhost" }, isSecureContext: true });
    vi.stubGlobal("navigator", { geolocation: { watchPosition, clearWatch } });
    const onLocation = vi.fn();
    const cleanup = await startLocationTracking({ onLocation, onError: vi.fn() });
    expect(watchPosition.mock.calls[0]?.[2]).toMatchObject({ enableHighAccuracy: true, maximumAge: 3_000, timeout: 20_000 });
    expect(onLocation).toHaveBeenCalledWith(sample);
    await cleanup();
    expect(clearWatch).toHaveBeenCalledWith(42);
  });

  it.each([
    [1, "PERMISSION_DENIED"],
    [2, "UNAVAILABLE"],
    [3, "TIMEOUT"],
  ] as const)("maps browser geolocation error %s without leaking device details", async (code, expected) => {
    const watchPosition = vi.fn((_success: PositionCallback, failure: PositionErrorCallback) => {
      failure({ code, message: "sensitive device message", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
      return 9;
    });
    vi.stubGlobal("window", { location: { hostname: "localhost" }, isSecureContext: true });
    vi.stubGlobal("navigator", { geolocation: { watchPosition, clearWatch: vi.fn() } });
    const onError = vi.fn();
    await startLocationTracking({ onLocation: vi.fn(), onError });
    expect(onError).toHaveBeenCalledWith(expected);
    expect(onError).not.toHaveBeenCalledWith("sensitive device message");
  });

  it("fails closed when the packaged native bridge cannot start", async () => {
    const listeners = new Map<string, EventListener>();
    vi.stubGlobal("window", {
      LibSwiftRideNativeLocation: { start: vi.fn().mockRejectedValue(new Error("native unavailable")), stop: vi.fn() },
      addEventListener: vi.fn((name: string, listener: EventListener) => listeners.set(name, listener)),
      removeEventListener: vi.fn((name: string) => listeners.delete(name)),
    });
    const onError = vi.fn();
    const cleanup = await startLocationTracking({ onLocation: vi.fn(), onError });
    expect(onError).toHaveBeenCalledWith("UNAVAILABLE");
    expect(listeners.size).toBe(0);
    await cleanup();
  });
});
