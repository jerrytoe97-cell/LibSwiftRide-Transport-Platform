import { describe, expect, it, vi } from "vitest";
import { decodeRideRealtimeEvent, encodeRideRealtimeEvent, publishRideRealtimeEvent, RIDE_REALTIME_CHANNEL } from "./ride-realtime.js";

describe("ride realtime fan-out", () => {
  it("round-trips a ride-scoped payload", () => {
    const event = { rideId: "ride-1", payload: JSON.stringify({ type: "driver.location", latitude: 6.3 }) };
    expect(decodeRideRealtimeEvent(encodeRideRealtimeEvent(event))).toEqual(event);
  });

  it.each(["", "null", "{}", '{"rideId":"ride-1"}', '{"rideId":1,"payload":"x"}'])("rejects an invalid envelope: %s", (value) => {
    expect(decodeRideRealtimeEvent(value)).toBeNull();
  });

  it("publishes on the versioned shared channel", async () => {
    const publish = vi.fn().mockResolvedValue(2);
    const event = { rideId: "ride-1", payload: '{"type":"chat.message"}' };
    await expect(publishRideRealtimeEvent({ publish } as never, event)).resolves.toBe(2);
    expect(publish).toHaveBeenCalledWith(RIDE_REALTIME_CHANNEL, JSON.stringify(event));
  });
});
