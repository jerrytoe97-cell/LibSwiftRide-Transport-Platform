import { prisma, redis } from "../lib.js";
import { transactionalEmailContent } from "./transactional-email-templates.js";

const ONLINE_TTL_SECONDS = 120;

export async function updateDriverLocation(userId: string, latitude: number, longitude: number) {
  const driver = await prisma.driver.findUnique({ where: { userId }, select: { id: true, status: true } });
  if (!driver || !["AVAILABLE", "ON_TRIP"].includes(driver.status)) throw new Error("Driver is not available for location updates");
  const at = new Date().toISOString();
  await redis
    .multi()
    .geoadd("drivers:geo", longitude, latitude, driver.id)
    .set(`driver:location:${driver.id}`, JSON.stringify({ latitude, longitude, at }), "EX", ONLINE_TTL_SECONDS)
    .exec();
  return { driverId: driver.id, latitude, longitude, at };
}

export async function matchDriver(rideId: string) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride || ride.status !== "SEARCHING") return null;
  const rejectedDriverIds = new Set((await prisma.rideOffer.findMany({
    where: { rideId, status: "REJECTED" },
    select: { driverId: true }
  })).map((offer) => offer.driverId));
  const candidates = await redis.geosearch(
    "drivers:geo",
    "FROMLONLAT",
    Number(ride.pickupLongitude),
    Number(ride.pickupLatitude),
    "BYRADIUS",
    10,
    "km",
    "ASC",
    "COUNT",
    20
  ) as string[];
  for (const driverId of candidates) {
    if (rejectedDriverIds.has(driverId)) continue;
    const online = await redis.exists(`driver:location:${driverId}`);
    if (!online) {
      await redis.zrem("drivers:geo", driverId);
      continue;
    }
    const assigned = await prisma.$transaction(async (tx) => {
      const driver = await tx.driver.updateMany({ where: { id: driverId, status: "AVAILABLE", verifiedAt: { not: null }, vehicle: { active: true } }, data: { status: "ON_TRIP" } });
      if (!driver.count) return null;
      const claimed = await tx.ride.updateMany({ where: { id: ride.id, status: "SEARCHING", driverId: null }, data: { driverId, status: "DRIVER_ASSIGNED" } });
      if (!claimed.count) {
        await tx.driver.update({ where: { id: driverId }, data: { status: "AVAILABLE" } });
        return null;
      }
      await tx.rideOffer.upsert({
        where: { rideId_driverId: { rideId, driverId } },
        update: { status: "OFFERED", offeredAt: new Date(), respondedAt: null },
        create: { rideId, driverId }
      });
      await tx.rideEvent.create({ data: { rideId, type: "DRIVER_ASSIGNED", metadata: { driverId } } });
      return tx.ride.findUnique({ where: { id: rideId }, include: { driver: { include: { user: true, vehicle: true } } } });
    });
    if (assigned) {
      const driverNotice = { userId: assigned.driver!.userId, template: "ride-assigned", title: "New ride assignment", body: `Pickup at ${assigned.pickupAddress}. Open the driver app to accept.` };
      const passengerNotice = { userId: assigned.passengerId, template: "driver-assigned", title: "Driver assigned", body: "A verified driver has been assigned to your ride." };
      await prisma.notification.createMany({ data: [
        { ...driverNotice, channel: "IN_APP" }, { ...driverNotice, channel: "PUSH" },
        ...(assigned.driver!.user.email ? [{ userId: assigned.driver!.userId, channel: "EMAIL" as const, ...transactionalEmailContent({ template: "dispatch-assignment", rideReference: `LSR-${assigned.id.slice(0, 8).toUpperCase()}`, pickup: assigned.pickupAddress }) }] : []),
        { ...passengerNotice, channel: "IN_APP" }, { ...passengerNotice, channel: "PUSH" }
      ] }).catch(() => undefined);
      return assigned;
    }
  }
  return null;
}

export async function activateScheduledRides(now = new Date()) {
  const due = await prisma.ride.findMany({
    where: { status: "REQUESTED", scheduledFor: { lte: new Date(now.getTime() + 5 * 60_000) } },
    select: { id: true },
    orderBy: { scheduledFor: "asc" },
    take: 50
  });
  for (const ride of due) {
    const activated = await prisma.ride.updateMany({ where: { id: ride.id, status: "REQUESTED" }, data: { status: "SEARCHING" } });
    if (activated.count) {
      await prisma.rideEvent.create({ data: { rideId: ride.id, type: "SCHEDULED_RIDE_ACTIVATED" } });
      const reservation = await prisma.ride.findUnique({ where: { id: ride.id }, select: { passengerId: true, pickupAddress: true } });
      if (reservation) await prisma.notification.createMany({ data: [
        { userId: reservation.passengerId, channel: "IN_APP", template: "reservation-active", title: "Scheduled ride is starting", body: `We are finding a driver for your pickup at ${reservation.pickupAddress}.` },
        { userId: reservation.passengerId, channel: "PUSH", template: "reservation-active", title: "Scheduled ride is starting", body: "We are finding a driver for your scheduled ride." }
      ] }).catch(() => undefined);
      void matchDriver(ride.id);
    }
  }
  return due.length;
}
