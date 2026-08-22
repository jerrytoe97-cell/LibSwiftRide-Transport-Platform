import { describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
  config: {
    KYC_SCANNER_URL: "https://scanner.example.test/v1/scan",
    KYC_SCANNER_TOKEN: "protected-test-token-value",
    KYC_SCANNER_TIMEOUT_MS: 5_000
  }
}));

import { requestKycWebhookScan } from "./kyc-storage.js";

const checksum = "a".repeat(64);
const input = { downloadUrl: "https://private-storage.example.test/signed", checksum, mimeType: "application/pdf", sizeBytes: 128 };

describe("production KYC scanner webhook", () => {
  it("authenticates the request and accepts only a checksum-bound clean verdict", async () => {
    const scanner = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ verdict: "clean", checksum }), { status: 200 }));
    await expect(requestKycWebhookScan(input, scanner)).resolves.toBeUndefined();
    const request = scanner.mock.calls[0]![1]!;
    expect(request.method).toBe("POST");
    expect(request.headers).toMatchObject({ authorization: "Bearer protected-test-token-value", "content-type": "application/json" });
    expect(JSON.parse(String(request.body))).toEqual(input);
  });

  it.each([
    ["infected", new Response(JSON.stringify({ verdict: "infected", checksum }), { status: 200 })],
    ["checksum mismatch", new Response(JSON.stringify({ verdict: "clean", checksum: "b".repeat(64) }), { status: 200 })],
    ["malformed response", new Response("not-json", { status: 200 })],
    ["provider failure", new Response(null, { status: 503 })]
  ])("fails closed for %s", async (_label, response) => {
    await expect(requestKycWebhookScan(input, vi.fn<typeof fetch>().mockResolvedValue(response))).rejects.toThrow();
  });

  it("fails closed when the scanner cannot be reached", async () => {
    await expect(requestKycWebhookScan(input, vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")))).rejects.toThrow("could not be reached");
  });
});
