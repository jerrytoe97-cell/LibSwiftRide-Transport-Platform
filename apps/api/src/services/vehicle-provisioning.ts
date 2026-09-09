import { z } from "zod";
import { prisma } from "../lib.js";
import { lockIdentity } from "./verification-tokens.js";
import { SecurityOperationError } from "./security-operation.js";
import { requireActiveAdministrator } from "./active-administrator.js";

export const vehicleProvisioningSchema = z.object({
  vehicleId: z.uuid().optional(), fleetId: z.uuid().nullable().optional(),
  make: z.string().trim().min(1).max(80), model: z.string().trim().min(1).max(80),
  year: z.number().int().min(1990).max(new Date().getUTCFullYear() + 1), color: z.string().trim().min(1).max(40),
  plateNumber: z.string().trim().min(3).max(30),
  insuranceExpiresAt: z.coerce.date(), inspectionExpiresAt: z.coerce.date(), registrationExpiresAt: z.coerce.date(),
  evidenceReference: z.string().trim().min(8).max(200)
}).refine((v) => [v.insuranceExpiresAt, v.inspectionExpiresAt, v.registrationExpiresAt].every((d) => d > new Date()), "All required document expiry dates must be in the future");

export async function provisionVehicle(driverId: string, actorId: string, raw: unknown) {
  const input = vehicleProvisioningSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const lookup = await tx.driver.findUnique({ where: { id: driverId }, select: { userId: true } });
    if (!lookup) throw new SecurityOperationError(404, "DRIVER_NOT_FOUND", "Driver not found");
    await lockIdentity(tx, lookup.userId);
    await requireActiveAdministrator(tx, actorId);
    const driver = await tx.driver.findUniqueOrThrow({ where: { id: driverId }, include: { user: true, vehicle: true, kycCase: { include: { documents: true } } } });
    if (driver.user.status !== "ACTIVE" || driver.user.role !== "DRIVER" || !driver.verifiedAt || driver.kycCase?.status !== "APPROVED") throw new SecurityOperationError(409, "DRIVER_NOT_READY", "An active driver account and approved KYC are required");
    if (["ON_TRIP", "SUSPENDED"].includes(driver.status)) throw new SecurityOperationError(409, "DRIVER_LOCKED", "Vehicle assignment cannot change during a trip or suspension");
    for (const type of ["DRIVER_LICENSE", "VEHICLE_REGISTRATION", "INSURANCE", "INSPECTION", "PROFILE_PHOTO"] as const) {
      if (!driver.kycCase.documents.some((d) => d.type === type && d.scanStatus === "CLEAN" && d.verifiedAt)) throw new SecurityOperationError(422, "DOCUMENTS_REQUIRED", "All required documents must be present, scanned and reviewed");
    }
    const fleetId = input.fleetId === undefined ? driver.fleetId : input.fleetId;
    if (fleetId && !await tx.fleet.findUnique({ where: { id: fleetId } })) throw new SecurityOperationError(422, "FLEET_NOT_FOUND", "Fleet not found");
    let existing = input.vehicleId ? await tx.vehicle.findUnique({ where: { id: input.vehicleId } }) : driver.vehicle;
    if (input.vehicleId && !existing) throw new SecurityOperationError(404, "VEHICLE_NOT_FOUND", "Vehicle not found");
    if (existing) {
      await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${existing.id} FOR UPDATE`;
      existing = await tx.vehicle.findUniqueOrThrow({ where: { id: existing.id } });
      if ((existing.driverId && existing.driverId !== driverId) || (input.vehicleId && existing.fleetId !== fleetId)) throw new SecurityOperationError(409, "VEHICLE_ASSIGNED", "Vehicle belongs to another driver or fleet");
    }
    if (driver.vehicle && existing?.id !== driver.vehicle.id) throw new SecurityOperationError(409, "VEHICLE_ASSIGNED", "Review the currently assigned vehicle before replacing it");
    const { vehicleId: _id, evidenceReference, fleetId: _fleet, ...details } = input;
    if ([input.insuranceExpiresAt, input.inspectionExpiresAt, input.registrationExpiresAt].some((date) => date <= new Date())) throw new SecurityOperationError(409, "VEHICLE_DOCUMENT_EXPIRED", "A document expired while the assignment was being reviewed");
    const data = { ...details, driverId, fleetId, active: true, complianceVerifiedAt: new Date(), complianceVerifiedById: actorId };
    const vehicle = existing ? await tx.vehicle.update({ where: { id: existing.id }, data }) : await tx.vehicle.create({ data });
    await tx.driver.update({ where: { id: driverId }, data: { fleetId, status: "OFFLINE" } });
    for (const [type, expiresAt] of [["INSURANCE", input.insuranceExpiresAt], ["INSPECTION", input.inspectionExpiresAt], ["VEHICLE_REGISTRATION", input.registrationExpiresAt]] as const) await tx.kycDocument.update({ where: { kycCaseId_type: { kycCaseId: driver.kycCase.id, type } }, data: { expiresAt } });
    await tx.auditLog.create({ data: { actorId, action: "VEHICLE_COMPLIANCE_ATTESTED", entityType: "Vehicle", entityId: vehicle.id, metadata: { driverId, fleetId, caseId: driver.kycCase.id, evidenceReference, insuranceExpiresAt: input.insuranceExpiresAt.toISOString(), inspectionExpiresAt: input.inspectionExpiresAt.toISOString(), registrationExpiresAt: input.registrationExpiresAt.toISOString() } } });
    return vehicle;
  });
}
