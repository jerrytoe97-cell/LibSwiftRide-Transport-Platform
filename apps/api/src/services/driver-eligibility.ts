import type { Prisma } from "@prisma/client";
import { lockIdentity } from "./verification-tokens.js";

export async function lockDriverIdentity(tx: Prisma.TransactionClient, driverId: string) {
  const driver = await tx.driver.findUnique({ where: { id: driverId }, select: { userId: true } });
  if (driver) await lockIdentity(tx, driver.userId);
}

export function eligibleDriverWhere(now = new Date()): Prisma.DriverWhereInput {
  return {
    verifiedAt: { not: null }, user: { is: { status: "ACTIVE", role: "DRIVER" } },
    kycCase: { is: { status: "APPROVED", AND: (["DRIVER_LICENSE", "VEHICLE_REGISTRATION", "INSURANCE", "INSPECTION", "PROFILE_PHOTO"] as const).map((type) => ({ documents: { some: { type, scanStatus: "CLEAN", verifiedAt: { not: null } } } })) } },
    vehicle: { is: { active: true, complianceVerifiedAt: { not: null }, complianceVerifiedById: { not: null }, insuranceExpiresAt: { gt: now }, inspectionExpiresAt: { gt: now }, registrationExpiresAt: { gt: now } } }
  };
}
