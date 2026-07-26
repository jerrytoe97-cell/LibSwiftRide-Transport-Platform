import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "./payments.js";

describe("payment webhook verification", () => {
  const secret = "webhook-secret-at-least-16";
  const payload = JSON.stringify({ providerRef: "payment-1", status: "CAPTURED" });

  it("accepts an authentic raw payload", () => {
    const signature = createHmac("sha256", secret).update(payload).digest("hex");
    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
  });

  it("rejects a modified payload and malformed signature", () => {
    const signature = createHmac("sha256", secret).update(payload).digest("hex");
    expect(verifyWebhookSignature(`${payload} `, signature, secret)).toBe(false);
    expect(verifyWebhookSignature(payload, "not-hex", secret)).toBe(false);
  });
});
