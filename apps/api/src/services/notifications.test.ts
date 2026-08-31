import { describe, expect, it, vi } from "vitest";
import { createResendEmailRequest, createZohoEmailMessage, createZohoSmtpTransport, safeSmtpErrorDetails, verifySmtpTransport } from "./notifications.js";

describe("Resend email delivery request", () => {
  it("uses bearer authentication, idempotency and a plain-text recipient payload", () => {
    const request = createResendEmailRequest(
      { id: "notification-id", to: "owner@example.test", title: "Reset password", body: "One-time reset instructions" },
      "provider-secret-used-only-in-this-test",
      "support@example.test",
      "support@example.test"
    );
    expect(request.url).toBe("https://api.resend.com/emails");
    expect(request.init.headers).toMatchObject({ authorization: "Bearer provider-secret-used-only-in-this-test", "idempotency-key": "notification-id" });
    expect(JSON.parse(request.init.body)).toMatchObject({ from: "LibSwiftRide Support <support@example.test>", reply_to: "support@example.test", to: ["owner@example.test"], subject: "Reset password", text: "One-time reset instructions" });
    expect(JSON.parse(request.init.body).html).toContain("LibSwiftRide");
    expect(JSON.parse(request.init.body).html).toContain("One-time reset instructions");
  });
});

describe("Zoho SMTP email delivery", () => {
  it("requires authenticated TLS with certificate verification", () => {
    const transport = createZohoSmtpTransport({ host: "smtppro.zoho.com", port: 465, secure: true, user: "support@libswiftride.com", appPassword: "test-only-app-password" });
    expect((transport.options as Record<string, unknown>)).toMatchObject({
      host: "smtppro.zoho.com",
      port: 465,
      secure: true,
      requireTLS: true,
      auth: { user: "support@libswiftride.com", pass: "test-only-app-password" },
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true, servername: "smtppro.zoho.com" }
    });
  });

  it("verifies the configured transporter without sending a message", async () => {
    const verify = vi.fn().mockResolvedValue(true);
    await verifySmtpTransport({ verify });
    expect(verify).toHaveBeenCalledOnce();
  });

  it("preserves sender, reply-to, accessible content, and notification identity", () => {
    const message = createZohoEmailMessage(
      { id: "notification-id", to: "passenger@example.test", title: "Verify your email", body: "One-time verification instructions" },
      "support@libswiftride.com",
      "support@libswiftride.com"
    );
    expect(message).toMatchObject({
      from: "LibSwiftRide Support <support@libswiftride.com>",
      replyTo: "support@libswiftride.com",
      to: "passenger@example.test",
      subject: "Verify your email",
      text: "One-time verification instructions",
      messageId: "<notification-id@libswiftride.com>",
      headers: { "X-LibSwiftRide-Notification-ID": "notification-id" }
    });
    expect(message.html).toContain("LibSwiftRide");
  });

  it("logs only non-sensitive SMTP diagnostics", () => {
    const details = safeSmtpErrorDetails(Object.assign(new Error("Authentication failed for support@libswiftride.com using secret-value"), {
      code: "EAUTH",
      command: "AUTH PLAIN",
      responseCode: 535,
      response: "535 credentials rejected"
    }));
    expect(details).toEqual({ errorType: "Error", smtpCode: "EAUTH", smtpCommand: "AUTH PLAIN", smtpResponseCode: 535 });
    expect(JSON.stringify(details)).not.toContain("support@libswiftride.com");
    expect(JSON.stringify(details)).not.toContain("secret-value");
    expect(JSON.stringify(details)).not.toContain("credentials rejected");
  });
});
