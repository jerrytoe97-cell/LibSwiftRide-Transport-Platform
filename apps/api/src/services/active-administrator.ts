import type { Prisma } from "@prisma/client";
import { SecurityOperationError } from "./security-operation.js";

// Keep role/status stable until the privileged mutation commits.
export async function requireActiveAdministrator(tx: Prisma.TransactionClient, actorId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actorId} FOR SHARE`;
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, status: true } });
  if (actor?.role !== "ADMIN" || actor.status !== "ACTIVE") {
    throw new SecurityOperationError(403, "FORBIDDEN", "An active administrator is required");
  }
}
