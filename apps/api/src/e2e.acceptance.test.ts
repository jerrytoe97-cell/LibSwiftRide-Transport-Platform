import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { api } from "./routes.js";
import { hashPassword, issueTokens } from "./auth.js";
import { prisma, redis } from "./lib.js";

const app = express();
app.use(express.json());
app.use("/api/v1", api);
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ZodError) return res.status(422).json({ error: { code: "VALIDATION_ERROR" } });
  return res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
});

const suffix = `${Date.now()}${Math.floor(Math.random() * 1_000)}`;
const passengerPhone = `077${suffix.slice(-7)}`;
const driverPhone = `088${suffix.slice(-7)}`;
let adminToken = "";
let passengerToken = "";
let driverToken = "";
let passengerId = "";
let driverId = "";
let rideId = "";

describe.sequential("end-to-end acceptance", () => {
  beforeAll(async () => {
    await redis.connect().catch(() => undefined);
    const admin = await prisma.user.create({ data: { phone: `055${suffix.slice(-7)}`, email: `admin-${suffix}@example.test`, passwordHash: await hashPassword("Acceptance-only-password-123!"), firstName: "Acceptance", lastName: "Admin", role: "ADMIN", status: "ACTIVE" } });
    adminToken = (await issueTokens({ sub: admin.id, role: admin.role })).accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await redis.quit().catch(() => undefined);
  });

  it("registers and verifies a passenger email", async () => {
    const registered = await request(app).post("/api/v1/auth/register").send({ phone: passengerPhone, email: `passenger-${suffix}@example.test`, password: "Passenger-password-123!", firstName: "Test", lastName: "Passenger", role: "PASSENGER" }).expect(201);
    passengerId = registered.body.data.id;
    passengerToken = registered.body.tokens.accessToken;
    await request(app).post("/api/v1/auth/email-verification/request").set("authorization", `Bearer ${passengerToken}`).expect(202);
    const notification = await prisma.notification.findFirstOrThrow({ where: { userId: passengerId, template: "email-verification" }, orderBy: { createdAt: "desc" } });
    const token = notification.body.replace("Verification token: ", "");
    await request(app).post("/api/v1/auth/email-verification/confirm").send({ token }).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: passengerId } })).emailVerifiedAt).not.toBeNull();
  });

  it("registers, submits and approves driver verification", async () => {
    const registered = await request(app).post("/api/v1/auth/register").send({ phone: driverPhone, email: `driver-${suffix}@example.test`, password: "Driver-password-123!", firstName: "Test", lastName: "Driver", role: "DRIVER" }).expect(201);
    driverToken = registered.body.tokens.accessToken;
    const onboarded = await request(app).post("/api/v1/drivers/onboarding").set("authorization", `Bearer ${driverToken}`).send({ licenseNumber: `LIC-${suffix}`, nationalIdRef: `test-id-${suffix}` }).expect(200);
    driverId = onboarded.body.data.id;
    for (const type of ["NATIONAL_ID", "DRIVER_LICENSE", "PROFILE_PHOTO"]) {
      await request(app).put(`/api/v1/drivers/kyc/documents/${type}`).set("authorization", `Bearer ${driverToken}`).send({ storageKey: `acceptance/${suffix}/${type}`, mimeType: "image/jpeg", checksum: "a".repeat(64) }).expect(200);
    }
    const submitted = await request(app).post("/api/v1/drivers/kyc/submit").set("authorization", `Bearer ${driverToken}`).expect(200);
    await request(app).post(`/api/v1/admin/kyc/${submitted.body.data.id}/review`).set("authorization", `Bearer ${adminToken}`).send({ decision: "APPROVED" }).expect(200);
    await prisma.vehicle.create({ data: { driverId, make: "Toyota", model: "Prius", year: 2022, color: "White", plateNumber: `T${suffix.slice(-6)}` } });
    await request(app).post("/api/v1/drivers/me/availability").set("authorization", `Bearer ${driverToken}`).send({ status: "AVAILABLE" }).expect(200);
  });

  it("books, assigns and completes the full ride lifecycle with SOS", async () => {
    const booked = await request(app).post("/api/v1/rides").set("authorization", `Bearer ${passengerToken}`).set("idempotency-key", `ride-${suffix}`).send({
      pickup: { address: "Broad Street, Monrovia", latitude: 6.3156, longitude: -10.8074 },
      destination: { address: "SKD Complex, Paynesville", latitude: 6.3058, longitude: -10.7492 },
      paymentMethod: "CASH"
    }).expect(201);
    rideId = booked.body.data.id;
    await request(app).post(`/api/v1/dispatch/rides/${rideId}/assign`).set("authorization", `Bearer ${adminToken}`).send({ driverId }).expect(200);
    for (const status of ["DRIVER_ARRIVING", "DRIVER_ARRIVED"]) await request(app).post(`/api/v1/rides/${rideId}/transitions`).set("authorization", `Bearer ${driverToken}`).send({ status }).expect(200);
    await request(app).post(`/api/v1/rides/${rideId}/transitions`).set("authorization", `Bearer ${passengerToken}`).send({ status: "PASSENGER_BOARDED" }).expect(200);
    await request(app).post(`/api/v1/rides/${rideId}/sos`).set("authorization", `Bearer ${passengerToken}`).send({ category: "SECURITY", latitude: 6.31, longitude: -10.8 }).expect(201);
    await request(app).post(`/api/v1/rides/${rideId}/transitions`).set("authorization", `Bearer ${driverToken}`).send({ status: "IN_PROGRESS" }).expect(200);
    await request(app).post(`/api/v1/rides/${rideId}/transitions`).set("authorization", `Bearer ${driverToken}`).send({ status: "COMPLETED" }).expect(200);
    const ride = await prisma.ride.findUniqueOrThrow({ where: { id: rideId } });
    expect(ride.driverEarningsMinor + ride.companyCommissionMinor).toBe(ride.fareMinor);
    expect(ride.driverEarningsMinor).toBe(Math.floor(ride.fareMinor * 8_800 / 10_000));
    expect(await prisma.safetyIncident.count({ where: { rideId } })).toBe(1);
  });

  it("protects cancellation, refunds and manual Mobile Money confirmation from replay", async () => {
    const cancelled = await prisma.ride.create({ data: { passengerId, idempotencyKey: `cancel-${suffix}`, status: "SEARCHING", pickupAddress: "A", pickupLatitude: 6.3, pickupLongitude: -10.8, destinationAddress: "B", destinationLatitude: 6.31, destinationLongitude: -10.79, estimatedDistanceM: 1000, estimatedDurationSec: 300, fareMinor: 1000, driverEarningsMinor: 880, companyCommissionMinor: 120, paymentMethod: "MTN_MOMO" } });
    await request(app).post(`/api/v1/rides/${cancelled.id}/transitions`).set("authorization", `Bearer ${passengerToken}`).send({ status: "CANCELLED", cancellationReason: "Plans changed" }).expect(200);
    const paidRide = await prisma.ride.create({ data: { passengerId, idempotencyKey: `paid-${suffix}`, status: "CANCELLED", pickupAddress: "A", pickupLatitude: 6.3, pickupLongitude: -10.8, destinationAddress: "B", destinationLatitude: 6.31, destinationLongitude: -10.79, estimatedDistanceM: 1000, estimatedDurationSec: 300, fareMinor: 1000, driverEarningsMinor: 880, companyCommissionMinor: 120, paymentMethod: "MTN_MOMO" } });
    const payment = await prisma.payment.create({ data: { rideId: paidRide.id, provider: "MANUAL", idempotencyKey: `payment-${suffix}`, amountMinor: 1000, method: "MTN_MOMO", status: "PENDING" } });
    const confirmationKey = `confirm-${suffix}`;
    const confirmation = () => request(app).post(`/api/v1/payments/${payment.id}/confirm-mobile-money`).set("authorization", `Bearer ${adminToken}`).set("idempotency-key", confirmationKey).send({ providerReference: `provider-${suffix}`, evidenceReference: `evidence-${suffix}` });
    await confirmation().expect(200);
    await confirmation().expect(200);
    expect(await prisma.manualPaymentConfirmation.count({ where: { paymentId: payment.id } })).toBe(1);
    const refundKey = `refund-${suffix}`;
    const refund = () => request(app).post(`/api/v1/rides/${paidRide.id}/refunds`).set("authorization", `Bearer ${adminToken}`).set("idempotency-key", refundKey).send({ amountMinor: 500, reason: "Acceptance test refund" });
    await refund().expect(201);
    await refund().expect(201);
    expect(await prisma.refund.count({ where: { idempotencyKey: refundKey } })).toBe(1);
  });

  it("executes corporate, fleet, dispatcher and admin ownership workflows", async () => {
    const manager = await prisma.user.create({ data: { phone: `044${suffix.slice(-7)}`, email: `manager-${suffix}@example.test`, passwordHash: await hashPassword("Manager-password-123!"), firstName: "Business", lastName: "Manager", role: "PASSENGER", status: "ACTIVE" } });
    const managerToken = (await issueTokens({ sub: manager.id, role: manager.role })).accessToken;
    const account = await request(app).post("/api/v1/admin/corporate/accounts").set("authorization", `Bearer ${adminToken}`).send({ name: "Acceptance Company", billingEmail: `billing-${suffix}@example.test`, managerId: manager.id, monthlyBudgetMinor: 100_000 }).expect(201);
    await request(app).post("/api/v1/corporate/employees").set("authorization", `Bearer ${managerToken}`).send({ accountId: account.body.data.id, userId: passengerId, monthlyLimitMinor: 50_000 }).expect(201);
    await request(app).get("/api/v1/corporate/account").set("authorization", `Bearer ${managerToken}`).expect(200);
    const fleetManager = await prisma.user.create({ data: { phone: `033${suffix.slice(-7)}`, passwordHash: await hashPassword("Fleet-password-123!"), firstName: "Fleet", lastName: "Manager", role: "FLEET_MANAGER", status: "ACTIVE" } });
    const fleet = await prisma.fleet.create({ data: { name: "Acceptance Fleet", managerId: fleetManager.id } });
    const fleetToken = (await issueTokens({ sub: fleetManager.id, role: fleetManager.role })).accessToken;
    await request(app).post("/api/v1/fleet/drivers").set("authorization", `Bearer ${fleetToken}`).send({ fleetId: fleet.id, driverId }).expect(201);
    await request(app).get("/api/v1/fleet/overview").set("authorization", `Bearer ${fleetToken}`).expect(200);
    await request(app).get("/api/v1/dispatch/rides").set("authorization", `Bearer ${adminToken}`).expect(200);
    await request(app).get("/api/v1/admin/audit-logs").set("authorization", `Bearer ${adminToken}`).expect(200);
  });
});
