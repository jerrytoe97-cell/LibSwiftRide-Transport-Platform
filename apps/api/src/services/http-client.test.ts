import { afterEach, describe, expect, it, vi } from "vitest";
import { resilientFetch } from "./http-client.js";

describe("resilientFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("retries transient provider responses with the same idempotent request", async () => {
    const provider = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", provider);
    const response = await resilientFetch("https://provider.invalid", { method: "POST", attempts: 2, headers: { "idempotency-key": "stable-key" } });
    expect(response.status).toBe(200);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(provider.mock.calls[0]?.[1]?.headers).toEqual(provider.mock.calls[1]?.[1]?.headers);
  });

  it("does not retry permanent validation failures", async () => {
    const provider = vi.fn().mockResolvedValue(new Response(null, { status: 422 }));
    vi.stubGlobal("fetch", provider);
    expect((await resilientFetch("https://provider.invalid", { attempts: 3 })).status).toBe(422);
    expect(provider).toHaveBeenCalledTimes(1);
  });
});
