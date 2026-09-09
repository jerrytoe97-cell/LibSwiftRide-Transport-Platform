import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@prisma/client";
import { prisma } from "./lib.js";
import { issueTokens, revokeRefreshToken } from "./auth.js";
import { authorizeRideSubscription, deliverAuthorizedRideEvent } from "./services/realtime-authorization.js";
let rideId: string; let driverId: string; let replacementId: string;
const users = new Map<string, { id: string; role: UserRole }>();
async function token(name: string) { const user = users.get(name)!; return issueTokens({ sub: user.id, role: user.role, mfa: true }); }
const location = () => JSON.stringify({ type: "driver.location", rideId, latitude: 6.3, longitude: -10.8, at: new Date().toISOString(), passwordHash: "must-be-stripped" });
beforeAll(async () => {
  for (const [name, role] of [["passenger", "PASSENGER"], ["otherPassenger", "PASSENGER"], ["driver", "DRIVER"], ["otherDriver", "DRIVER"], ["fleet", "FLEET_MANAGER"], ["otherFleet", "FLEET_MANAGER"], ["admin", "ADMIN"], ["dispatcher", "DISPATCHER"], ["support", "SUPPORT"], ["business", "BUSINESS_MANAGER"]] as const) {
    const user = await prisma.user.create({ data: { phone: `fictional-ws-${randomUUID()}`, firstName: "Fictional", lastName: name, passwordHash: "unusable-test", role, status: "ACTIVE" } }); users.set(name, user);
  }
  const fleet = await prisma.fleet.create({ data: { name: "Fictional fleet", managerId: users.get("fleet")!.id } });
  await prisma.fleet.create({ data: { name: "Other fictional fleet", managerId: users.get("otherFleet")!.id } });
  driverId = (await prisma.driver.create({ data: { userId: users.get("driver")!.id, licenseNumber: randomUUID(), fleetId: fleet.id } })).id;
  replacementId = (await prisma.driver.create({ data: { userId: users.get("otherDriver")!.id, licenseNumber: randomUUID() } })).id;
  rideId = (await prisma.ride.create({ data: { passengerId: users.get("passenger")!.id, driverId, idempotencyKey: randomUUID(), status: "IN_PROGRESS", pickupAddress: "Fictional A", pickupLatitude: 6.3, pickupLongitude: -10.8, destinationAddress: "Fictional B", destinationLatitude: 6.31, destinationLongitude: -10.79, estimatedDistanceM: 1000, estimatedDurationSec: 300, fareMinor: 1000, driverEarningsMinor: 860, companyCommissionMinor: 140 } })).id;
});
afterAll(() => prisma.$disconnect());
describe.sequential("outbound ride authorization with PostgreSQL", () => {
  it.each([["passenger", true], ["otherPassenger", false], ["driver", true], ["otherDriver", false], ["fleet", true], ["otherFleet", false], ["admin", true], ["dispatcher", true], ["support", true], ["business", false]] as const)("enforces location scope for %s", async (name, allowed) => {
    const tokens = await token(name); const send = vi.fn();
    expect(await authorizeRideSubscription(tokens.accessToken, rideId)).toBe(allowed);
    expect(await deliverAuthorizedRideEvent(tokens.accessToken, rideId, location(), send)).toBe(allowed);
    expect(send).toHaveBeenCalledTimes(allowed ? 1 : 0);
    if (allowed) expect(send.mock.calls[0]![0]).not.toContain("passwordHash");
  });
  it.each(["fleet", "otherFleet", "admin", "dispatcher", "support", "business", "otherPassenger", "otherDriver"])("does not disclose private chat to %s", async (name) => {
    const tokens = await token(name); const send = vi.fn();
    expect(await deliverAuthorizedRideEvent(tokens.accessToken, rideId, JSON.stringify({ type: "chat.message", rideId, id: randomUUID(), senderId: users.get("passenger")!.id, content: "Fictional private message", createdAt: new Date().toISOString() }), send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it("rechecks a revoked session for an existing subscription", async () => {
    const tokens = await token("passenger"); const send = vi.fn();
    expect(await authorizeRideSubscription(tokens.accessToken, rideId)).toBe(true);
    await revokeRefreshToken(tokens.refreshToken);
    expect(await deliverAuthorizedRideEvent(tokens.accessToken, rideId, location(), send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it.each(["passenger", "driver"])("delivers private chat only to its participant %s", async (name) => {
    const tokens = await token(name); const send = vi.fn();
    expect(await deliverAuthorizedRideEvent(tokens.accessToken, rideId, JSON.stringify({ type: "chat.message", rideId, id: randomUUID(), senderId: users.get("passenger")!.id, content: "Fictional message", createdAt: new Date().toISOString() }), send)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("rechecks fleet membership even when the ride assignment is unchanged", async () => {
    const tokens = await token("fleet"); const send = vi.fn();
    const driver = await prisma.driver.findUniqueOrThrow({ where: { id: driverId } });
    expect(await authorizeRideSubscription(tokens.accessToken, rideId)).toBe(true);
    await prisma.driver.update({ where: { id: driverId }, data: { fleetId: null } });
    try {
      expect(await deliverAuthorizedRideEvent(tokens.accessToken, rideId, location(), send)).toBe(false);
      expect(send).not.toHaveBeenCalled();
    } finally { await prisma.driver.update({ where: { id: driverId }, data: { fleetId: driver.fleetId } }); }
  });
  it("removes access when the trip is reassigned away from the driver and fleet", async () => {
    const driver = await token("driver"); const fleet = await token("fleet"); const send = vi.fn();
    await prisma.ride.update({ where: { id: rideId }, data: { driverId: replacementId } });
    try {
      expect(await deliverAuthorizedRideEvent(driver.accessToken, rideId, location(), send)).toBe(false);
      expect(await deliverAuthorizedRideEvent(fleet.accessToken, rideId, location(), send)).toBe(false);
      expect(send).not.toHaveBeenCalled();
    } finally { await prisma.ride.update({ where: { id: rideId }, data: { driverId } }); }
  });
  it("rejects unknown event types and envelope/ride mismatches", async () => {
    const tokens = await token("admin"); const send = vi.fn();
    expect(await deliverAuthorizedRideEvent(tokens.accessToken, rideId, JSON.stringify({ type: "admin.secret", rideId }), send)).toBe(false);
    expect(await deliverAuthorizedRideEvent(tokens.accessToken, randomUUID(), location(), send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
