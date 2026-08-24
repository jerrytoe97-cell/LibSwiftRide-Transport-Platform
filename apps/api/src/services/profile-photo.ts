export const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const profilePhotoMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export function validateProfilePhoto(bytes: Uint8Array, mimeType: string) {
  if (!profilePhotoMimeTypes.includes(mimeType as typeof profilePhotoMimeTypes[number])) throw Object.assign(new Error("Profile photos must be JPEG, PNG, or WebP images"), { code: "PROFILE_PHOTO_TYPE_UNSUPPORTED" });
  if (!bytes.length || bytes.length > PROFILE_PHOTO_MAX_BYTES) throw Object.assign(new Error("Profile photos must be no larger than 2 MB"), { code: "PROFILE_PHOTO_TOO_LARGE" });
  const valid = mimeType === "image/jpeg"
    ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mimeType === "image/png"
      ? bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
      : bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (!valid) throw Object.assign(new Error("Profile photo content does not match its declared image type"), { code: "PROFILE_PHOTO_TYPE_MISMATCH" });
  return { mimeType: mimeType as typeof profilePhotoMimeTypes[number], sizeBytes: bytes.length };
}

export const contactSharingRideStatuses = ["DRIVER_ASSIGNED", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "PASSENGER_BOARDED", "IN_PROGRESS"] as const;
export function canShareRideContact(ride: { status: string; passengerId: string; driver?: { userId: string } | null }, userId: string) {
  return contactSharingRideStatuses.includes(ride.status as typeof contactSharingRideStatuses[number]) && (ride.passengerId === userId || ride.driver?.userId === userId);
}
