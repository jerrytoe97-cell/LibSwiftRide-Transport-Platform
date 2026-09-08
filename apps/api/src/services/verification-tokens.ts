import type { Prisma } from "@prisma/client";

export async function lockIdentity(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}

export async function consumeVerificationToken(tx: Prisma.TransactionClient, id: string, type: string) {
  const consumed = await tx.verificationToken.updateMany({
    where: { id, type, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() }
  });
  if (consumed.count !== 1) throw Object.assign(new Error("Token is invalid or expired"), { status: 400, code: "INVALID_TOKEN" });
}
