import { prisma } from "../lib.js";
import { transactionalEmailContent } from "./transactional-email-templates.js";

export async function queueDocumentExpiryReminders(now = new Date()) {
  const cutoff = new Date(now.getTime() + 30 * 86_400_000);
  const documents = await prisma.kycDocument.findMany({
    where: { expiresAt: { gt: now, lte: cutoff }, expiryReminderSentAt: null },
    include: {
      kycCase: {
        include: {
          driver: {
            select: {
              userId: true,
              user: { select: { email: true } },
              fleet: { select: { managerId: true, manager: { select: { email: true } } } }
            }
          }
        }
      }
    },
    take: 100
  });
  for (const document of documents) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.kycDocument.updateMany({ where: { id: document.id, expiryReminderSentAt: null }, data: { expiryReminderSentAt: now } });
      if (!claimed.count) return;
      const notification = { userId: document.kycCase.driver.userId, template: "document-expiry", title: "Driver document expiring", body: `${document.type.replaceAll("_", " ")} expires on ${document.expiresAt!.toISOString().slice(0, 10)}. Upload a renewed document to remain eligible.` };
      const email = transactionalEmailContent({ template: "fleet-document-expiry", documentName: document.type.replaceAll("_", " "), expiryDate: document.expiresAt!.toISOString().slice(0, 10) });
      await tx.notification.createMany({ data: [
        { ...notification, channel: "IN_APP" }, { ...notification, channel: "PUSH" },
        ...(document.kycCase.driver.user.email ? [{ userId: document.kycCase.driver.userId, channel: "EMAIL" as const, ...email }] : []),
        ...(document.kycCase.driver.fleet?.manager.email ? [{ userId: document.kycCase.driver.fleet.managerId, channel: "EMAIL" as const, ...email }] : [])
      ] });
    });
  }
  return documents.length;
}
