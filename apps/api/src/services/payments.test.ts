import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { paymentProvider, verifyWebhookSignature } from "./payments.js";

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

describe("payment provider safety gate", () => {
  it("keeps cash available while external providers are disabled", () => {
    expect(paymentProvider("CASH").method).toBe("CASH");
    expect(() => paymentProvider("ORANGE_MONEY")).toThrow("disabled");
    expect(() => paymentProvider("MTN_MOMO")).toThrow("disabled");
    expect(() => paymentProvider("STRIPE")).toThrow("disabled");
  });
});
