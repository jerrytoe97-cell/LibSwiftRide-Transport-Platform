import { prisma, redis } from "../lib.js";

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
    const online = await redis.exists(`driver:location:${driverId}`);
    if (!online) {
      await redis.zrem("drivers:geo", driverId);
      continue;
    }
    const assigned = await prisma.$transaction(async (tx) => {
      const driver = await tx.driver.updateMany({ where: { id: driverId, status: "AVAILABLE" }, data: { status: "ON_TRIP" } });
      if (!driver.count) return null;
      const claimed = await tx.ride.updateMany({ where: { id: ride.id, status: "SEARCHING", driverId: null }, data: { driverId, status: "DRIVER_ASSIGNED" } });
      if (!claimed.count) {
        await tx.driver.update({ where: { id: driverId }, data: { status: "AVAILABLE" } });
        return null;
      }
      await tx.rideEvent.create({ data: { rideId, type: "DRIVER_ASSIGNED", metadata: { driverId } } });
      return tx.ride.findUnique({ where: { id: rideId }, include: { driver: { include: { user: true, vehicle: true } } } });
    });
    if (assigned) return assigned;
  }
  return null;
}
