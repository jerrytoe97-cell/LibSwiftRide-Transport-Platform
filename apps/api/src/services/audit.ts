import type { Prisma } from "@prisma/client";
import { prisma } from "../lib.js";

export function writeAudit(input: {
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  ipAddress?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.auditLog.create({ data: input });
}
