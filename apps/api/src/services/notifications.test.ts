import { describe, expect, it } from "vitest";
import { createResendEmailRequest } from "./notifications.js";

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
