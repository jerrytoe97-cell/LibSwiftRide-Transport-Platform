import { prisma } from "../lib.js";
import { matchDriver } from "./dispatch.js";

export const OFFER_TTL_MS = 60_000;
export const SEARCH_TTL_MS = 10 * 60_000;

// Ride/offer rows are the durable work queue. Conditional updates make concurrent
// sweeps safe and recover bookings whose original matching process crashed.
export async function recoverDispatch(now = new Date()) {
  const expired = await prisma.rideOffer.findMany({
    where: { status: "OFFERED", offeredAt: { lte: new Date(now.getTime() - OFFER_TTL_MS) }, ride: { status: "DRIVER_ASSIGNED" } },
    select: { rideId: true, driverId: true }, take: 100, orderBy: { offeredAt: "asc" }
  });
  for (const offer of expired) await prisma.$transaction(async (tx) => {
    const claimed = await tx.ride.updateMany({ where: { id: offer.rideId, driverId: offer.driverId, status: "DRIVER_ASSIGNED" }, data: { status: "SEARCHING", driverId: null } });
    if (!claimed.count) return;
    await tx.rideOffer.updateMany({ where: { rideId: offer.rideId, driverId: offer.driverId, status: "OFFERED" }, data: { status: "REJECTED", respondedAt: now } });
    await tx.driver.updateMany({ where: { id: offer.driverId, status: "ON_TRIP" }, data: { status: "OFFLINE" } });
    await tx.rideEvent.create({ data: { rideId: offer.rideId, type: "RIDE_OFFER_EXPIRED", metadata: { driverId: offer.driverId } } });
  });
  const searching = await prisma.ride.findMany({ where: { status: "SEARCHING", driverId: null }, select: { id: true, passengerId: true, requestedAt: true, scheduledFor: true }, orderBy: { requestedAt: "asc" }, take: 100 });
  for (const ride of searching) {
    const searchStartedAt = ride.scheduledFor ?? ride.requestedAt;
    if (searchStartedAt.getTime() <= now.getTime() - SEARCH_TTL_MS) {
      await prisma.$transaction(async (tx) => {
        const cancelled = await tx.ride.updateMany({ where: { id: ride.id, status: "SEARCHING", driverId: null }, data: { status: "CANCELLED", cancelledAt: now, cancellationReason: "No eligible driver available within search time" } });
        if (!cancelled.count) return;
        await tx.rideEvent.create({ data: { rideId: ride.id, type: "RIDE_SEARCH_EXPIRED" } });
        await tx.notification.create({ data: { userId: ride.passengerId, channel: "IN_APP", template: "ride-search-expired", title: "No driver available", body: "Your request expired without a driver. You can request another ride." } });
      });
    } else await matchDriver(ride.id);
  }
  return { expiredOffers: expired.length, examinedRides: searching.length };
}
