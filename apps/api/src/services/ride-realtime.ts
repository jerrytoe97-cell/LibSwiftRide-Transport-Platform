import type { Redis } from "ioredis";

export const RIDE_REALTIME_CHANNEL = "libswiftride:ride-realtime:v1";

export type RideRealtimeEvent = { rideId: string; payload: string };

export function encodeRideRealtimeEvent(event: RideRealtimeEvent) {
  if (!event.rideId || !event.payload) throw new Error("Invalid ride realtime event");
  return JSON.stringify(event);
}

export function decodeRideRealtimeEvent(value: string): RideRealtimeEvent | null {
  try {
    const event: unknown = JSON.parse(value);
    if (!event || typeof event !== "object") return null;
    const candidate = event as Partial<RideRealtimeEvent>;
    if (typeof candidate.rideId !== "string" || !candidate.rideId || typeof candidate.payload !== "string" || !candidate.payload) return null;
    return { rideId: candidate.rideId, payload: candidate.payload };
  } catch {
    return null;
  }
}

export async function publishRideRealtimeEvent(redis: Redis, event: RideRealtimeEvent) {
  return redis.publish(RIDE_REALTIME_CHANNEL, encodeRideRealtimeEvent(event));
}
