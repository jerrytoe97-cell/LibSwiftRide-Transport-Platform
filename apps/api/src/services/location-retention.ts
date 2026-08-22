import { prisma } from "../lib.js";

const BATCH_SIZE = 1_000;
const MAX_BATCHES_PER_RUN = 10;

export function routePointRetentionCutoff(now: Date, retentionDays: number) {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) throw new Error("Route-point retention must be between 1 and 365 days");
  return new Date(now.getTime() - retentionDays * 86_400_000);
}

export async function purgeExpiredRoutePoints(retentionDays: number, now = new Date()) {
  const cutoff = routePointRetentionCutoff(now, retentionDays);
  let deleted = 0;
  for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
    const expired = await prisma.routePoint.findMany({
      where: { recordedAt: { lt: cutoff }, ride: { status: { in: ["COMPLETED", "CANCELLED"] } } },
      select: { id: true },
      orderBy: { recordedAt: "asc" },
      take: BATCH_SIZE
    });
    if (!expired.length) break;
    const result = await prisma.routePoint.deleteMany({ where: { id: { in: expired.map((point) => point.id) }, recordedAt: { lt: cutoff } } });
    deleted += result.count;
    if (expired.length < BATCH_SIZE) break;
  }
  return { deleted, cutoff };
}
