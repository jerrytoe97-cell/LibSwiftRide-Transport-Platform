import type { Prisma } from "@prisma/client";

export function eligibleDriverWhere(now = new Date()): Prisma.DriverWhereInput {
  return {
    verifiedAt: { not: null }, user: { is: { status: "ACTIVE", role: "DRIVER" } },
    kycCase: { is: { status: "APPROVED" } },
    vehicle: { is: { active: true, insuranceExpiresAt: { gt: now }, inspectionExpiresAt: { gt: now }, registrationExpiresAt: { gt: now } } }
  };
}
