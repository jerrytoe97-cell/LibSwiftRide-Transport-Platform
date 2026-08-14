import type { NotificationChannel, Prisma } from "@prisma/client";
import { prisma } from "../lib.js";
import { config } from "../config.js";
import { resilientFetch } from "./http-client.js";

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

const RESEND_EMAIL_URL = "https://api.resend.com/emails";

export function createResendEmailRequest(input: { id: string; to: string; title: string; body: string }, apiKey: string, from: string) {
  return {
    url: RESEND_EMAIL_URL,
    init: {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": input.id
      },
      body: JSON.stringify({ from, to: [input.to], subject: input.title, text: input.body }),
      timeoutMs: 8_000,
      attempts: 2
    }
  } as const;
}

export async function deliverPendingNotifications(limit = 25) {
  const now = new Date();
  const pending = await prisma.notification.findMany({ where: { channel: { in: ["EMAIL", "SMS", "PUSH"] }, attemptCount: { lt: 5 }, OR: [{ status: "PENDING" }, { status: "FAILED", nextAttemptAt: { lte: now } }] }, orderBy: { createdAt: "asc" }, take: limit, include: { user: { select: { email: true, phone: true, devices: { where: { active: true }, select: { pushToken: true } } } } } });
  for (const notification of pending) {
    if (config.NOTIFICATION_PROVIDER === "sandbox") {
      if (config.NODE_ENV !== "production") {
        await prisma.notification.update({ where: { id: notification.id }, data: { status: "SENT", sentAt: new Date() } });
      }
      continue;
    }
    const resend = notification.channel === "EMAIL" && config.EMAIL_PROVIDER === "resend" && notification.user.email && config.RESEND_API_KEY && config.EMAIL_FROM
      ? createResendEmailRequest({ id: notification.id, to: notification.user.email, title: notification.title, body: notification.body }, config.RESEND_API_KEY, config.EMAIL_FROM)
      : null;
    const provider = delivery[notification.channel as keyof typeof delivery];
    if (!resend && (!provider?.url || !provider.token)) continue;
    try {
      const response = resend ? await resilientFetch(resend.url, resend.init) : await resilientFetch(provider!.url!, {
        method: "POST",
        headers: { authorization: `Bearer ${provider!.token}`, "content-type": "application/json", "idempotency-key": notification.id },
        body: JSON.stringify({
          id: notification.id, channel: notification.channel, to: notification.channel === "EMAIL" ? notification.user.email : notification.channel === "SMS" ? notification.user.phone : notification.user.devices.map((device) => device.pushToken),
          template: notification.template, title: notification.title, body: notification.body, data: notification.data
        }),
        timeoutMs: 8_000,
        attempts: 2
      });
      if (!response.ok) throw new Error(`Delivery returned ${response.status}`);
      await prisma.notification.update({ where: { id: notification.id }, data: { status: "SENT", sentAt: new Date() } });
    } catch {
      const attemptCount = notification.attemptCount + 1;
      await prisma.notification.update({ where: { id: notification.id }, data: { status: "FAILED", attemptCount: { increment: 1 }, nextAttemptAt: attemptCount < 5 ? new Date(Date.now() + Math.min(15 * 60_000, 2 ** attemptCount * 30_000)) : null } });
    }
  }
  return pending.length;
}
