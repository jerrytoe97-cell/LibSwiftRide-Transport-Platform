import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PaymentMethod } from "@prisma/client";

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

class StripeProvider implements PaymentProvider {
  readonly method = "STRIPE" as const;
  async createPayment(request: PaymentRequest) {
    return {
      providerRef: `stripe_${randomUUID()}`,
      status: "PENDING" as const,
      checkoutUrl: `${request.returnUrl ?? "https://example.invalid"}/payment/pending`
    };
  }
  async refund() {}
}

class CashProvider implements PaymentProvider {
  readonly method = "CASH" as const;
  async createPayment() {
    return { providerRef: `cash_${randomUUID()}`, status: "AUTHORIZED" as const };
  }
  async refund() {}
}

const providers: Partial<Record<PaymentMethod, PaymentProvider>> = {
  ORANGE_MONEY: new SandboxMobileMoneyProvider("ORANGE_MONEY"),
  MTN_MOMO: new SandboxMobileMoneyProvider("MTN_MOMO"),
  STRIPE: new StripeProvider(),
  CASH: new CashProvider()
};

export function paymentProvider(method: PaymentMethod) {
  const provider = providers[method];
  if (!provider) throw new Error(`Payment method ${method} is not configured`);
  return provider;
}
