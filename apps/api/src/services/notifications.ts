import type { NotificationChannel, Prisma } from "@prisma/client";
import { prisma } from "../lib.js";

export async function queueNotification(input: {
  userId: string;
  channel: NotificationChannel;
  template: string;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}) {
  const { data, ...notification } = input;
  return prisma.notification.create({ data: { ...notification, ...(data ? { data } : {}) } });
}

export async function markNotificationRead(userId: string, id: string) {
  return prisma.notification.updateMany({
    where: { id, userId },
    data: { status: "READ", readAt: new Date() }
  });
}
