import { z } from "zod";
import { prisma } from "../lib.js";
import { verifyAccessToken, type AuthUser } from "../auth.js";
import { lockIdentity } from "./verification-tokens.js";

const outboundEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("driver.location"), rideId: z.string(), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), at: z.string(), remainingDistanceM: z.number().nonnegative().optional(), etaSeconds: z.number().nonnegative().optional() }),
  z.object({ type: z.literal("chat.message"), rideId: z.string(), id: z.string(), senderId: z.string(), content: z.string().max(500), createdAt: z.string() })
]);
type RideScope = { passengerId: string; status: string; driver: { userId: string; fleet: { managerId: string } | null } | null };
export function permitsRideEvent(user: AuthUser, ride: RideScope, type: "driver.location" | "chat.message") {
  if (["COMPLETED", "CANCELLED"].includes(ride.status)) return false;
  const passenger = ["PASSENGER", "BUSINESS_MANAGER"].includes(user.role) && ride.passengerId === user.sub;
  const driver = user.role === "DRIVER" && ride.driver?.userId === user.sub;
  if (type === "chat.message") return Boolean(passenger || driver);
  if (passenger || driver || ["ADMIN", "DISPATCHER", "SUPPORT"].includes(user.role)) return true;
  return user.role === "FLEET_MANAGER" && ride.driver?.fleet?.managerId === user.sub;
}

async function withRideAuthorization(token: string, rideId: string, type: "driver.location" | "chat.message", deliver: () => void) {
  try {
    const initial = await verifyAccessToken(token);
    return await prisma.$transaction(async (tx) => {
      // Serialize delivery with logout/reset/status changes; recheck after waiting.
      await lockIdentity(tx, initial.sub);
      const user = await verifyAccessToken(token, tx);
      await tx.$queryRaw`SELECT id FROM "Ride" WHERE id = ${rideId} FOR SHARE`;
      // Fleet scope can change independently of the ride. Hold both links stable
      // until the event is handed to the socket, then read current ownership.
      await tx.$queryRaw`SELECT id FROM "Driver" WHERE id = (SELECT "driverId" FROM "Ride" WHERE id = ${rideId}) FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM "Fleet" WHERE id = (SELECT d."fleetId" FROM "Driver" d JOIN "Ride" r ON r."driverId" = d.id WHERE r.id = ${rideId}) FOR SHARE`;
      const ride = await tx.ride.findUnique({ where: { id: rideId }, select: { passengerId: true, status: true, driver: { select: { userId: true, fleet: { select: { managerId: true } } } } } });
      if (!ride || !permitsRideEvent(user, ride, type)) return false;
      // No await between the authorization result and handing bytes to the socket.
      deliver();
      return true;
    });
  } catch { return false; }
}
export async function authorizeRideSubscription(token: string, rideId: string) {
  return withRideAuthorization(token, rideId, "driver.location", () => undefined);
}
export async function deliverAuthorizedRideEvent(token: string, rideId: string, payload: string, send: (data: string) => void) {
  let event: z.infer<typeof outboundEvent>;
  try { event = outboundEvent.parse(JSON.parse(payload)); } catch { return false; }
  if (event.rideId !== rideId) return false;
  return withRideAuthorization(token, rideId, event.type, () => send(JSON.stringify(event)));
}
