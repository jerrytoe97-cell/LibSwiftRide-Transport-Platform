import { describe, expect, it } from "vitest";
import { canRequestFare, isValidTripLocation } from "./trip-input.js";

const pickup = { address: "Broad Street, Monrovia", latitude: 6.3156, longitude: -10.8074 };
const destination = { address: "SKD Complex, Paynesville", latitude: 6.3058, longitude: -10.7492 };

describe("fare request input", () => {
  it("requires selected coordinates rather than an address label alone", () => {
    expect(isValidTripLocation({ address: "Broad Street", latitude: Number.NaN, longitude: Number.NaN })).toBe(false);
    expect(canRequestFare(pickup, destination)).toBe(true);
  });

  it("rejects identical and out-of-range route points", () => {
    expect(canRequestFare(pickup, pickup)).toBe(false);
    expect(canRequestFare({ ...pickup, latitude: 91 }, destination)).toBe(false);
  });
});
