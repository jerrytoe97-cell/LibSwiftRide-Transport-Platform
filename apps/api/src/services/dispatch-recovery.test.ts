import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib.js", () => ({ prisma: { rideOffer: { findMany: vi.fn() }, ride: { findMany: vi.fn() }, $transaction: vi.fn() } }));
vi.mock("./dispatch.js", () => ({ matchDriver: vi.fn() }));
import { prisma } from "../lib.js";
import { matchDriver } from "./dispatch.js";
import { recoverDispatch, SEARCH_TTL_MS } from "./dispatch-recovery.js";

const tx = { ride: { updateMany: vi.fn() }, rideOffer: { updateMany: vi.fn() }, driver: { updateMany: vi.fn() }, rideEvent: { create: vi.fn() }, notification: { create: vi.fn() } };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.rideOffer.findMany).mockResolvedValue([]);
  vi.mocked(prisma.ride.findMany).mockResolvedValue([]);
  vi.mocked(prisma.$transaction).mockImplementation((async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)) as never);
  tx.ride.updateMany.mockResolvedValue({ count: 1 });
});
describe("durable dispatch recovery", () => {
  it("does not release a driver when acceptance already won the race", async () => {
    vi.mocked(prisma.rideOffer.findMany).mockResolvedValue([{ rideId: "ride", driverId: "driver" }] as never);
    tx.ride.updateMany.mockResolvedValue({ count: 0 });
    await recoverDispatch();
    expect(tx.driver.updateMany).not.toHaveBeenCalled();
    expect(tx.rideEvent.create).not.toHaveBeenCalled();
  });
  it("expires offers atomically without reactivating suspended drivers", async () => {
    vi.mocked(prisma.rideOffer.findMany).mockResolvedValue([{ rideId: "ride", driverId: "driver" }] as never);
    await recoverDispatch();
    expect(tx.driver.updateMany).toHaveBeenCalledWith({ where: { id: "driver", status: "ON_TRIP" }, data: { status: "OFFLINE" } });
    expect(tx.rideOffer.updateMany).toHaveBeenCalledOnce();
  });
  it("retries recent searches and cancels stale searches only once", async () => {
    const now = new Date();
    vi.mocked(prisma.ride.findMany).mockResolvedValue([{ id: "recent", passengerId: "p", requestedAt: now, scheduledFor: null }, { id: "stale", passengerId: "p", requestedAt: new Date(+now - SEARCH_TTL_MS), scheduledFor: null }] as never);
    await recoverDispatch(now);
    expect(matchDriver).toHaveBeenCalledWith("recent");
    expect(tx.notification.create).toHaveBeenCalledOnce();
    tx.ride.updateMany.mockResolvedValue({ count: 0 });
    await recoverDispatch(now);
    expect(tx.notification.create).toHaveBeenCalledOnce();
  });
});
