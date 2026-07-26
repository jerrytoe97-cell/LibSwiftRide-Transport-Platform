import type { NotificationChannel, Prisma } from "@prisma/client";
import { prisma } from "../lib.js";
import { config } from "../config.js";

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

const delivery = {
  EMAIL: { url: config.EMAIL_DELIVERY_URL, token: config.EMAIL_DELIVERY_TOKEN },
  SMS: { url: config.SMS_DELIVERY_URL, token: config.SMS_DELIVERY_TOKEN },
  PUSH: { url: config.PUSH_DELIVERY_URL, token: config.PUSH_DELIVERY_TOKEN }
} as const;

export async function deliverPendingNotifications(limit = 25) {
  const pending = await prisma.notification.findMany({ where: { status: "PENDING", channel: { in: ["EMAIL", "SMS", "PUSH"] } }, orderBy: { createdAt: "asc" }, take: limit, include: { user: { select: { email: true, phone: true, devices: { where: { active: true }, select: { pushToken: true } } } } } });
  for (const notification of pending) {
    if (config.NOTIFICATION_PROVIDER === "sandbox") {
      if (config.NODE_ENV !== "production") {
        await prisma.notification.update({ where: { id: notification.id }, data: { status: "SENT", sentAt: new Date() } });
      }
      continue;
    }
    const provider = delivery[notification.channel as keyof typeof delivery];
    if (!provider?.url || !provider.token) continue;
    try {
      const response = await fetch(provider.url, {
        method: "POST",
        headers: { authorization: `Bearer ${provider.token}`, "content-type": "application/json", "idempotency-key": notification.id },
        body: JSON.stringify({
          id: notification.id, channel: notification.channel, to: notification.channel === "EMAIL" ? notification.user.email : notification.channel === "SMS" ? notification.user.phone : notification.user.devices.map((device) => device.pushToken),
          template: notification.template, title: notification.title, body: notification.body, data: notification.data
        })
      });
      if (!response.ok) throw new Error(`Delivery returned ${response.status}`);
      await prisma.notification.update({ where: { id: notification.id }, data: { status: "SENT", sentAt: new Date() } });
    } catch {
      await prisma.notification.update({ where: { id: notification.id }, data: { status: "FAILED" } });
    }
  }
  return pending.length;
}
