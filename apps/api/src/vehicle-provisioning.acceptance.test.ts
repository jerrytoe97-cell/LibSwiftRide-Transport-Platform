import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { prisma, redis } from "./lib.js";
import { api } from "./routes.js";
import { issueTokens } from "./auth.js";
import { completeKycDocument, reviewKyc, submitKyc } from "./services/kyc-operations.js";
import { matchDriver } from "./services/dispatch.js";
import { provisionVehicle } from "./services/vehicle-provisioning.js";
const app = express(); app.use(express.json()); app.use("/api/v1", api);
afterAll(async () => { await prisma.$disconnect(); await redis.quit(); });
async function fixture() {
  const base = { firstName: "Fictional", lastName: "Compliance", passwordHash: "unusable-test", status: "ACTIVE" as const };
  const admin = await prisma.user.create({ data: { ...base, phone: `fictional-admin-${randomUUID()}`, role: "ADMIN" } });
  const user = await prisma.user.create({ data: { ...base, phone: `fictional-driver-${randomUUID()}`, role: "DRIVER", driver: { create: { licenseNumber: randomUUID(), kycCase: { create: {} } } } }, include: { driver: { include: { kycCase: true } } } });
  const passenger = await prisma.user.create({ data: { ...base, phone: `fictional-passenger-${randomUUID()}`, role: "PASSENGER" } });
  const driverId = user.driver!.id; const caseId = user.driver!.kycCase!.id;
  for (const type of ["DRIVER_LICENSE", "VEHICLE_REGISTRATION", "INSURANCE", "INSPECTION", "PROFILE_PHOTO"] as const) await completeKycDocument({ userId: user.id, caseId, type, storageKey: `kyc/clean/${randomUUID()}`, checksum: "a".repeat(64), sizeBytes: 4, mimeType: "image/jpeg", scannedAt: new Date() });
  await submitKyc(user.id); await reviewKyc({ caseId, actorId: admin.id, decision: "APPROVED" });
  const dates = new Date(Date.now() + 365 * 86_400_000).toISOString();
  const input = { make: "Fictional", model: "Test", year: 2025, color: "White", plateNumber: randomUUID().slice(0, 20), insuranceExpiresAt: dates, inspectionExpiresAt: dates, registrationExpiresAt: dates, evidenceReference: `fictional-review-${randomUUID()}` };
  const adminToken = (await issueTokens({ sub: admin.id, role: "ADMIN", mfa: true })).accessToken;
  const driverToken = (await issueTokens({ sub: user.id, role: "DRIVER" })).accessToken;
  const ride = await prisma.ride.create({ data: { passengerId: passenger.id, idempotencyKey: randomUUID(), status: "SEARCHING", pickupAddress: "Fictional pickup", pickupLatitude: 0, pickupLongitude: -10.8, destinationAddress: "Fictional dropoff", destinationLatitude: 0.01, destinationLongitude: -10.79, estimatedDistanceM: 1000, estimatedDurationSec: 300, fareMinor: 1000, driverEarningsMinor: 860, companyCommissionMinor: 140 } });
  return { user, admin, driverId, caseId, adminToken, driverToken, input, ride };
}
const invalidConditions = ["inactive-account", "unapproved-kyc", "missing-vehicle", "missing-document", "unreviewed-document", "inactive-vehicle", "unattested", "insurance-expired", "inspection-expired", "registration-expired"];
async function invalidate(f: Awaited<ReturnType<typeof fixture>>, vehicleId: string, condition: string) {
  if (condition === "inactive-account") await prisma.user.update({ where: { id: f.user.id }, data: { status: "SUSPENDED" } });
  if (condition === "unapproved-kyc") await prisma.kycCase.update({ where: { id: f.caseId }, data: { status: "REJECTED" } });
  if (condition === "missing-vehicle") await prisma.vehicle.delete({ where: { id: vehicleId } });
  if (condition === "missing-document") await prisma.kycDocument.delete({ where: { kycCaseId_type: { kycCaseId: f.caseId, type: "INSURANCE" } } });
  if (condition === "unreviewed-document") await prisma.kycDocument.update({ where: { kycCaseId_type: { kycCaseId: f.caseId, type: "INSURANCE" } }, data: { verifiedAt: null } });
  if (condition === "inactive-vehicle") await prisma.vehicle.update({ where: { id: vehicleId }, data: { active: false } });
  if (condition === "unattested") await prisma.vehicle.update({ where: { id: vehicleId }, data: { complianceVerifiedAt: null, complianceVerifiedById: null } });
  if (condition.endsWith("-expired")) {
    const field = condition === "insurance-expired" ? "insuranceExpiresAt" : condition === "inspection-expired" ? "inspectionExpiresAt" : "registrationExpiresAt";
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { [field]: new Date(0) } });
  }
}
describe.sequential("audited vehicle eligibility", () => {
  it("rejects provisioning after administrator suspension without an assignment or audit", async () => {
    const f = await fixture();
    await prisma.user.update({ where: { id: f.admin.id }, data: { status: "SUSPENDED" } });
    await expect(provisionVehicle(f.driverId, f.admin.id, f.input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.vehicle.count({ where: { driverId: f.driverId } })).toBe(0);
  });
  it("allows only one driver to claim the same unassigned vehicle concurrently", async () => {
    const first = await fixture(); const second = await fixture();
    const vehicle = await prisma.vehicle.create({ data: { make: "Fictional", model: "Shared", year: 2025, color: "White", plateNumber: randomUUID() } });
    const results = await Promise.allSettled([
      provisionVehicle(first.driverId, first.admin.id, { ...first.input, vehicleId: vehicle.id }),
      provisionVehicle(second.driverId, second.admin.id, { ...second.input, vehicleId: vehicle.id })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { entityId: vehicle.id, action: "VEHICLE_COMPLIANCE_ATTESTED" } })).toBe(1);
    const assigned = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    expect([first.driverId, second.driverId]).toContain(assigned.driverId);
  });
  it("provisions through the admin API, records an audit, then allows online status and assignment", async () => {
    const f = await fixture();
    await request(app).post(`/api/v1/admin/drivers/${f.driverId}/vehicle`).set("authorization", `Bearer ${f.driverToken}`).send(f.input).expect(403);
    const response = await request(app).post(`/api/v1/admin/drivers/${f.driverId}/vehicle`).set("authorization", `Bearer ${f.adminToken}`).send(f.input).expect(200);
    expect(response.body.data.complianceVerifiedById).toBe(f.admin.id);
    expect(await prisma.auditLog.count({ where: { entityId: response.body.data.id, action: "VEHICLE_COMPLIANCE_ATTESTED" } })).toBe(1);
    await request(app).post("/api/v1/drivers/me/availability").set("authorization", `Bearer ${f.driverToken}`).send({ status: "AVAILABLE" }).expect(200);
    await request(app).post(`/api/v1/dispatch/rides/${f.ride.id}/assign`).set("authorization", `Bearer ${f.adminToken}`).send({ driverId: f.driverId }).expect(200);
    expect(await prisma.rideOffer.count({ where: { rideId: f.ride.id, driverId: f.driverId, status: "OFFERED" } })).toBe(1);
  });
  it.each(invalidConditions)("rejects online, automatic dispatch and manual assignment for %s", async (condition) => {
    const f = await fixture(); const vehicle = await provisionVehicle(f.driverId, f.admin.id, f.input);
    await invalidate(f, vehicle.id, condition);
    const online = await request(app).post("/api/v1/drivers/me/availability").set("authorization", `Bearer ${f.driverToken}`).send({ status: "AVAILABLE" });
    expect([401, 409, 422]).toContain(online.status);
    // Model a driver who was online before compliance became invalid.
    await prisma.driver.update({ where: { id: f.driverId }, data: { status: "AVAILABLE" } });
    await redis.geoadd("drivers:geo", -10.8, 0, f.driverId);
    await redis.set(`driver:location:${f.driverId}`, "fictional-presence", "EX", 120);
    expect(await matchDriver(f.ride.id)).toBeNull();
    await request(app).post(`/api/v1/dispatch/rides/${f.ride.id}/assign`).set("authorization", `Bearer ${f.adminToken}`).send({ driverId: f.driverId }).expect(409);
    expect(await prisma.rideOffer.count({ where: { rideId: f.ride.id } })).toBe(0);
  });
  it.each(invalidConditions)("rechecks %s at acceptance after a valid assignment", async (condition) => {
    const f = await fixture(); const vehicle = await provisionVehicle(f.driverId, f.admin.id, f.input);
    await prisma.driver.update({ where: { id: f.driverId }, data: { status: "AVAILABLE" } });
    await request(app).post(`/api/v1/dispatch/rides/${f.ride.id}/assign`).set("authorization", `Bearer ${f.adminToken}`).send({ driverId: f.driverId }).expect(200);
    await invalidate(f, vehicle.id, condition);
    await request(app).post(`/api/v1/drivers/rides/${f.ride.id}/accept`).set("authorization", `Bearer ${f.driverToken}`).expect(condition === "inactive-account" ? 401 : 409);
    expect((await prisma.ride.findUniqueOrThrow({ where: { id: f.ride.id } })).status).toBe("DRIVER_ASSIGNED");
  });
});
