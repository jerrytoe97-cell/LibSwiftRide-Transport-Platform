import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PaymentMethod } from "@prisma/client";
import { config } from "../config.js";

export type PaymentRequest = {
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  phone?: string;
  returnUrl?: string;
};

export type PaymentResult = {
  providerRef: string;
  status: "PENDING" | "AUTHORIZED" | "CAPTURED";
  checkoutUrl?: string;
};

export interface PaymentProvider {
  readonly method: PaymentMethod;
  createPayment(request: PaymentRequest): Promise<PaymentResult>;
  refund(providerRef: string, amountMinor: number): Promise<void>;
}

export function verifyWebhookSignature(rawBody: string, signatureHex: string, secret: string) {
  if (!/^[0-9a-f]+$/i.test(signatureHex) || signatureHex.length % 2 !== 0) return false;
  const signature = Buffer.from(signatureHex, "hex");
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return signature.length === expected.length && timingSafeEqual(signature, expected);
}

class SandboxMobileMoneyProvider implements PaymentProvider {
  constructor(readonly method: "ORANGE_MONEY" | "MTN_MOMO") {}
  async createPayment() {
    return { providerRef: `${this.method.toLowerCase()}_${randomUUID()}`, status: "PENDING" as const };
  }
  async refund() {}
}

class HookPaymentProvider implements PaymentProvider {
  constructor(readonly method: "ORANGE_MONEY" | "MTN_MOMO" | "STRIPE", private url?: string, private token?: string) {}
  async createPayment(request: PaymentRequest) {
    if (!this.url || !this.token) {
      if (config.NODE_ENV === "production") throw new Error(`${this.method} credentials are not configured`);
      return { providerRef: `${this.method.toLowerCase()}_${randomUUID()}`, status: "PENDING" as const };
    }
    const response = await fetch(this.url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json", "idempotency-key": request.idempotencyKey },
      body: JSON.stringify({ ...request, method: this.method })
    });
    if (!response.ok) throw new Error(`${this.method} provider rejected the payment request`);
    const result = await response.json() as PaymentResult;
    if (!result.providerRef || !["PENDING", "AUTHORIZED", "CAPTURED"].includes(result.status)) throw new Error(`${this.method} provider returned an invalid response`);
    return result;
  }
  async refund(providerRef: string, amountMinor: number) {
    if (!this.url || !this.token) throw new Error(`${this.method} refund provider is not configured`);
    const response = await fetch(`${this.url}/${encodeURIComponent(providerRef)}/refunds`, {
      method: "POST", headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({ amountMinor })
    });
    if (!response.ok) throw new Error(`${this.method} refund failed`);
  }
}

class CashProvider implements PaymentProvider {
  readonly method = "CASH" as const;
  async createPayment() {
    return { providerRef: `cash_${randomUUID()}`, status: "AUTHORIZED" as const };
  }
  async refund() {}
}

const providers: Partial<Record<PaymentMethod, PaymentProvider>> = {
  ORANGE_MONEY: config.PAYMENT_PROVIDER === "sandbox" ? new SandboxMobileMoneyProvider("ORANGE_MONEY") : new HookPaymentProvider("ORANGE_MONEY", config.ORANGE_MONEY_API_URL, config.ORANGE_MONEY_API_TOKEN),
  MTN_MOMO: config.PAYMENT_PROVIDER === "sandbox" ? new SandboxMobileMoneyProvider("MTN_MOMO") : new HookPaymentProvider("MTN_MOMO", config.MTN_MOMO_API_URL, config.MTN_MOMO_API_TOKEN),
  STRIPE: config.PAYMENT_PROVIDER === "sandbox" ? new HookPaymentProvider("STRIPE") : new HookPaymentProvider("STRIPE", config.STRIPE_PAYMENT_HOOK_URL, config.STRIPE_API_TOKEN),
  CASH: new CashProvider()
};

export function paymentProvider(method: PaymentMethod) {
  const provider = providers[method];
  if (!provider) throw new Error(`Payment method ${method} is not configured`);
  return provider;
}
