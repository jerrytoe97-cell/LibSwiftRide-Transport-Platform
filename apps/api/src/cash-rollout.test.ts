import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

// Test the HTTP payment policy independently of the unavailable local database.
// Authentication/role enforcement have their own acceptance and route-contract tests.
vi.mock("./auth.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./auth.js")>(),
  authenticate: (req: any, _res: any, next: () => void) => { req.user = { sub: "fictional-passenger", role: "PASSENGER" }; next(); },
  authorize: () => (_req: any, _res: any, next: () => void) => next()
}));
vi.mock("./config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config.js")>();
  return { ...actual, config: { ...actual.config, PAYMENTS_ENABLED: false } };
});

import { api } from "./routes.js";
import { prisma } from "./lib.js";
const app = express(); app.use(express.json()); app.use("/api/v1", api);
const booking = { pickup: { address: "Fictional pickup", latitude: 6.3, longitude: -10.8 }, destination: { address: "Fictional destination", latitude: 6.31, longitude: -10.79 }, rideType: "ECONOMY" };
afterEach(() => vi.restoreAllMocks());

describe("cash-on-arrival rollout", () => {
  it("blocks manual electronic confirmation and webhooks before reading or mutating payments", async () => {
    const lookup = vi.spyOn(prisma.payment, "findUnique");
    const transaction = vi.spyOn(prisma, "$transaction");
    await request(app).post("/api/v1/payments/fictional/confirm-mobile-money").send({}).expect(422);
    await request(app).post("/api/v1/payments/webhooks/MTN_MOMO").send({ providerRef: "fictional", status: "CAPTURED" }).expect(503);
    expect(lookup).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each(["ORANGE_MONEY", "MTN_MOMO", "STRIPE", "WALLET"])("rejects %s bookings and charges before any database or provider operation", async (method) => {
    const lookup = vi.spyOn(prisma.ride, "findUnique");
    const rideResponse = await request(app).post("/api/v1/rides").set("idempotency-key", "fictional-key").send({ ...booking, paymentMethod: method }).expect(422);
    expect(rideResponse.body.error.code).toBe("PAYMENT_METHOD_DISABLED");
    const paymentResponse = await request(app).post("/api/v1/rides/fictional-ride/payments").set("idempotency-key", "fictional-key").send({ method }).expect(422);
    expect(paymentResponse.body.error.code).toBe("PAYMENT_METHOD_DISABLED");
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each(["ORANGE_MONEY", "MTN_MOMO"])("does not return transfer instructions for %s", async (method) => {
    const response = await request(app).get(`/api/v1/payments/mobile-money/${method}/display`).expect(422);
    expect(response.body.error.code).toBe("PAYMENT_METHOD_DISABLED");
    expect(response.body.data).toBeUndefined();
  });

  it.each(["CASH", undefined])("keeps cash booking replay available with payment method %s", async (paymentMethod) => {
    const lookup = vi.spyOn(prisma.ride, "findUnique").mockResolvedValue({ id: "fictional-existing-ride", paymentMethod: "CASH" } as never);
    const response = await request(app).post("/api/v1/rides").set("idempotency-key", "fictional-key").send({ ...booking, paymentMethod }).expect(200);
    expect(response.body.data.paymentMethod).toBe("CASH");
    expect(lookup).toHaveBeenCalledOnce();
  });
});
