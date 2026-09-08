import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({ config: {
  NODE_ENV: "test", PAYMENTS_ENABLED: true, PAYMENT_PROVIDER: "mobile-money",
  MTN_MOMO_API_URL: "https://fictional-provider.invalid/payments",
  MTN_MOMO_API_TOKEN: "fictional-test-token"
} }));

import { paymentProvider } from "./payments.js";

afterEach(() => vi.unstubAllGlobals());

describe("refund provider contract", () => {
  it("preserves the refund idempotency key and amount across a retry", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await paymentProvider("MTN_MOMO").refund("provider/ref", 1000, "fictional-refund-key")).toEqual({ status: "PENDING" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toBe("https://fictional-provider.invalid/payments/provider%2Fref/refunds");
      expect(new Headers(init.headers).get("idempotency-key")).toBe("fictional-refund-key");
      expect(JSON.parse(init.body)).toEqual({ amountMinor: 1000 });
    }
  });

  it.each([0, -1, 1.5, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1])("rejects invalid minor units %s before contacting the provider", async (amount) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(paymentProvider("MTN_MOMO").refund("provider-ref", amount, "fictional-key")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a nonempty provider reference and a header-safe idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    for (const [reference, key] of [["", "fictional-key"], ["provider-ref", ""], ["provider-ref", "bad\r\nkey"]]) {
      await expect(paymentProvider("MTN_MOMO").refund(reference!, 1000, key!)).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects permanent provider failure without retrying it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 422 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(paymentProvider("MTN_MOMO").refund("provider-ref", 1000, "fictional-key")).rejects.toThrow("refund failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not report an unconfigured or cash refund as executed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(paymentProvider("ORANGE_MONEY").refund("provider-ref", 1000, "fictional-key")).rejects.toThrow("not configured");
    await expect(paymentProvider("CASH").refund("cash-ref", 1000, "fictional-key")).rejects.toThrow("manual reconciliation");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
