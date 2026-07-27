import { prisma } from "../lib.js";

export async function queueDocumentExpiryReminders(now = new Date()) {
  const cutoff = new Date(now.getTime() + 30 * 86_400_000);
  const documents = await prisma.kycDocument.findMany({
    where: { expiresAt: { gt: now, lte: cutoff }, expiryReminderSentAt: null },
    include: { kycCase: { include: { driver: { select: { userId: true } } } } },
    take: 100
  });
  for (const document of documents) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.kycDocument.updateMany({ where: { id: document.id, expiryReminderSentAt: null }, data: { expiryReminderSentAt: now } });
      if (!claimed.count) return;
      const notification = { userId: document.kycCase.driver.userId, template: "document-expiry", title: "Driver document expiring", body: `${document.type.replaceAll("_", " ")} expires on ${document.expiresAt!.toISOString().slice(0, 10)}. Upload a renewed document to remain eligible.` };
      await tx.notification.createMany({ data: [{ ...notification, channel: "IN_APP" }, { ...notification, channel: "PUSH" }] });
    });
  }
  return documents.length;
}
