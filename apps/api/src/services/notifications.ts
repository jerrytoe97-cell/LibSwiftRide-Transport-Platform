import type { NotificationChannel, Prisma } from "@prisma/client";
import nodemailer from "nodemailer";
import { prisma } from "../lib.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { resilientFetch } from "./http-client.js";
import { renderTransactionalEmailHtml } from "./transactional-email-templates.js";

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

export function createResendEmailRequest(input: { id: string; to: string; title: string; body: string }, apiKey: string, from: string, replyTo: string) {
  return {
    url: RESEND_EMAIL_URL,
    init: {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": input.id
      },
      body: JSON.stringify({ from: `LibSwiftRide Support <${from}>`, reply_to: replyTo, to: [input.to], subject: input.title, text: input.body, html: renderTransactionalEmailHtml(input.title, input.body) }),
      timeoutMs: 8_000,
      attempts: 2
    }
  } as const;
}

export function createZohoSmtpTransport(input: { host: string; port: number; secure: boolean; user: string; appPassword: string }) {
  return nodemailer.createTransport({
    host: input.host,
    port: input.port,
    secure: input.secure,
    requireTLS: true,
    auth: { user: input.user, pass: input.appPassword },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true, servername: input.host },
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 8_000
  });
}

type ZohoSmtpTransport = ReturnType<typeof createZohoSmtpTransport>;
let zohoSmtpTransport: ZohoSmtpTransport | null = null;

function configuredZohoSmtpTransport() {
  if (!config.ZOHO_SMTP_USER || !config.ZOHO_SMTP_APP_PASSWORD) return null;
  zohoSmtpTransport ??= createZohoSmtpTransport({
    host: config.ZOHO_SMTP_HOST,
    port: config.ZOHO_SMTP_PORT,
    secure: config.ZOHO_SMTP_SECURE,
    user: config.ZOHO_SMTP_USER,
    appPassword: config.ZOHO_SMTP_APP_PASSWORD
  });
  return zohoSmtpTransport;
}

export function safeSmtpErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") return { errorType: "unknown" };
  const smtpError = error as { name?: unknown; code?: unknown; command?: unknown; responseCode?: unknown };
  return {
    errorType: typeof smtpError.name === "string" ? smtpError.name : "unknown",
    ...(typeof smtpError.code === "string" ? { smtpCode: smtpError.code } : {}),
    ...(typeof smtpError.command === "string" ? { smtpCommand: smtpError.command } : {}),
    ...(typeof smtpError.responseCode === "number" ? { smtpResponseCode: smtpError.responseCode } : {})
  };
}

export async function verifySmtpTransport(transport: Pick<ZohoSmtpTransport, "verify">) {
  await transport.verify();
}

export async function verifyZohoSmtpTransport() {
  if (config.NOTIFICATION_PROVIDER !== "hooks" || config.EMAIL_PROVIDER !== "zoho") return false;
  const transport = configuredZohoSmtpTransport();
  if (!transport) throw new Error("Zoho SMTP credentials are not configured");
  await verifySmtpTransport(transport);
  return true;
}

export function createZohoEmailMessage(input: { id: string; to: string; title: string; body: string }, from: string, replyTo: string) {
  return {
    from: `LibSwiftRide Support <${from}>`,
    replyTo,
    to: input.to,
    subject: input.title,
    text: input.body,
    html: renderTransactionalEmailHtml(input.title, input.body),
    messageId: `<${input.id}@libswiftride.com>`,
    headers: { "X-LibSwiftRide-Notification-ID": input.id }
  };
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
    const resend = notification.channel === "EMAIL" && config.EMAIL_PROVIDER === "resend" && notification.user.email && config.RESEND_API_KEY && config.EMAIL_FROM && config.EMAIL_REPLY_TO
      ? createResendEmailRequest({ id: notification.id, to: notification.user.email, title: notification.title, body: notification.body }, config.RESEND_API_KEY, config.EMAIL_FROM, config.EMAIL_REPLY_TO)
      : null;
    const zohoTransport = notification.channel === "EMAIL" && config.EMAIL_PROVIDER === "zoho" ? configuredZohoSmtpTransport() : null;
    const zoho = zohoTransport && notification.user.email && config.EMAIL_FROM && config.EMAIL_REPLY_TO
      ? {
          transport: zohoTransport,
          message: createZohoEmailMessage({ id: notification.id, to: notification.user.email, title: notification.title, body: notification.body }, config.EMAIL_FROM, config.EMAIL_REPLY_TO)
        }
      : null;
    const provider = delivery[notification.channel as keyof typeof delivery];
    if (!resend && !zoho && (!provider?.url || !provider.token)) continue;
    try {
      const response = zoho ? (await zoho.transport.sendMail(zoho.message), { ok: true, status: 250 }) : resend ? await resilientFetch(resend.url, resend.init) : await resilientFetch(provider!.url!, {
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
      await prisma.notification.update({ where: { id: notification.id }, data: { status: "SENT", sentAt: new Date(), ...(notification.template === "password-reset" ? { body: "Sensitive password-reset instructions were delivered and removed from the queue." } : {}) } });
    } catch (error) {
      const attemptCount = notification.attemptCount + 1;
      logger.warn({
        notificationId: notification.id,
        channel: notification.channel,
        provider: zoho ? "zoho" : resend ? "resend" : "hook",
        attemptCount,
        ...(zoho ? safeSmtpErrorDetails(error) : { errorType: error instanceof Error ? error.name : "unknown" })
      }, "notification delivery failed");
      await prisma.notification.update({ where: { id: notification.id }, data: { status: "FAILED", attemptCount: { increment: 1 }, nextAttemptAt: attemptCount < 5 ? new Date(Date.now() + Math.min(15 * 60_000, 2 ** attemptCount * 30_000)) : null } });
    }
  }
  return pending.length;
}
