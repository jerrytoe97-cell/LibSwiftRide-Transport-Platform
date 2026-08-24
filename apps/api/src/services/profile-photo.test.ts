import { describe, expect, it } from "vitest";
import { PROFILE_PHOTO_MAX_BYTES, canShareRideContact, validateProfilePhoto } from "./profile-photo.js";

describe("private profile photos", () => {
  it.each([
    ["image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0x00])],
    ["image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["image/webp", new TextEncoder().encode("RIFF0000WEBP")]
  ])("accepts valid %s content", (mimeType, bytes) => expect(validateProfilePhoto(bytes, mimeType)).toMatchObject({ mimeType }));
  it("rejects unsupported, mismatched and oversized files", () => {
    expect(() => validateProfilePhoto(new Uint8Array([1]), "image/gif")).toThrow("JPEG, PNG, or WebP");
    expect(() => validateProfilePhoto(new Uint8Array([1, 2, 3]), "image/jpeg")).toThrow("does not match");
    expect(() => validateProfilePhoto(new Uint8Array(PROFILE_PHOTO_MAX_BYTES + 1), "image/jpeg")).toThrow("2 MB");
  });
  it("shares contact only between assigned participants while a ride is active", () => {
    const ride = { status: "IN_PROGRESS", passengerId: "passenger-a", driver: { userId: "driver-a" } };
    expect(canShareRideContact(ride, "passenger-a")).toBe(true);
    expect(canShareRideContact(ride, "driver-a")).toBe(true);
    expect(canShareRideContact(ride, "passenger-b")).toBe(false);
    expect(canShareRideContact({ ...ride, status: "COMPLETED" }, "passenger-a")).toBe(false);
    expect(canShareRideContact({ ...ride, status: "CANCELLED" }, "driver-a")).toBe(false);
    expect(canShareRideContact({ ...ride, status: "SEARCHING", driver: null }, "passenger-a")).toBe(false);
  });
});
