import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "./lib.js";
import { issueTokens } from "./auth.js";
import { api } from "./routes.js";
import { calculateFare } from "./services/fare.js";
const app = express(); app.use(express.json()); app.use("/api/v1", api);
afterAll(() => prisma.$disconnect());

describe("first-ride referral settlement concurrency", () => {
  it("rewards only one of two simultaneous completions without reducing either driver's share", async () => {
    const base = { firstName: "Fictional", lastName: "Referral", passwordHash: "unusable-test", status: "ACTIVE" as const };
    const referrer = await prisma.user.create({ data: { ...base, role: "PASSENGER", phone: `fictional-${randomUUID()}` } });
    const passenger = await prisma.user.create({ data: { ...base, role: "PASSENGER", phone: `fictional-${randomUUID()}` } });
    const referral = await prisma.referral.create({ data: { referrerId: referrer.id, referredUserId: passenger.id } });
    const rides: Array<{ id: string; token: string; driverUserId: string }> = [];
    const pricing = calculateFare({ distanceM: 1000, durationSec: 300 });
    for (let index = 0; index < 2; index += 1) {
      const driver = await prisma.user.create({ data: { ...base, role: "DRIVER", phone: `fictional-${randomUUID()}`, driver: { create: { licenseNumber: randomUUID(), status: "ON_TRIP" } } }, include: { driver: true } });
      // Already-in-progress fictional rides isolate completion and referral
      // locking; provisioning and assignment are covered separately.
      const ride = await prisma.ride.create({ data: { passengerId: passenger.id, driverId: driver.driver!.id, idempotencyKey: randomUUID(), status: "IN_PROGRESS", pickupAddress: "Fictional A", pickupLatitude: 0, pickupLongitude: 0, destinationAddress: "Fictional B", destinationLatitude: 0, destinationLongitude: 0, estimatedDistanceM: 1000, estimatedDurationSec: 300, fareMinor: pricing.fareMinor, driverEarningsMinor: pricing.driverEarningsMinor, companyCommissionMinor: pricing.companyCommissionMinor, baseFareMinor: pricing.baseFareMinor, paymentMethod: "CASH" } });
      rides.push({ id: ride.id, token: (await issueTokens({ sub: driver.id, role: "DRIVER" })).accessToken, driverUserId: driver.id });
    }
    const results = await Promise.all(rides.map((ride) => request(app).post(`/api/v1/rides/${ride.id}/transitions`).set("authorization", `Bearer ${ride.token}`).send({ status: "COMPLETED" })));
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    const reward = await prisma.ledgerJournal.findUniqueOrThrow({ where: { idempotencyKey: `referral-reward:${referral.id}` }, include: { entries: true } });
    const rewardedRide = await prisma.ride.findUniqueOrThrow({ where: { id: reward.reference } });
    const expectedReward = Math.round(rewardedRide.fareMinor * 200 / 10_000);
    expect((await prisma.referral.findUniqueOrThrow({ where: { id: referral.id } })).rewardMinor).toBe(expectedReward);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: referrer.id } })).balanceMinor).toBe(expectedReward);
    expect(reward.entries.find((entry) => entry.account === "REFERRAL_EXPENSE")?.debitMinor).toBe(BigInt(expectedReward));
    for (const fixture of rides) {
      const ride = await prisma.ride.findUniqueOrThrow({ where: { id: fixture.id } });
      expect(ride.companyCommissionMinor).toBe(Math.round(ride.fareMinor * 1400 / 10_000));
      expect(ride.driverEarningsMinor).toBe(ride.fareMinor - ride.companyCommissionMinor);
      expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: fixture.driverUserId } })).balanceMinor).toBe(-ride.companyCommissionMinor);
      await request(app).post(`/api/v1/rides/${ride.id}/transitions`).set("authorization", `Bearer ${fixture.token}`).send({ status: "COMPLETED" }).expect(409);
    }
    expect(await prisma.ledgerJournal.count({ where: { idempotencyKey: `referral-reward:${referral.id}` } })).toBe(1);
    expect(await prisma.walletTransaction.count({ where: { idempotencyKey: `referral-reward:${referral.id}` } })).toBe(1);
  });
});
