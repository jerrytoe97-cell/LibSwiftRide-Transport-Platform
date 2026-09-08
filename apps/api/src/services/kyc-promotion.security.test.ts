import { createHash } from "node:crypto";
import { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "../config.js";
import { verifyAndScanKycObject } from "./kyc-storage.js";

const originalConfig = { ...config };
afterEach(() => { vi.restoreAllMocks(); Object.assign(config, originalConfig); });
describe("KYC immutable promotion", () => {
  it.each(["clean", "missing-version", "checksum-mismatch"])("fails closed or promotes only scanned bytes: %s", async (scenario) => {
    Object.assign(config, { KYC_STORAGE_PROVIDER: "s3", KYC_S3_BUCKET: "fictional-test", KYC_SCANNER_PROVIDER: "sandbox" });
    const bytes = new TextEncoder().encode("%PDF-fictional-test");
    const writes: PutObjectCommand[] = [];
    const send = vi.spyOn(S3Client.prototype, "send").mockImplementation((async (command: unknown) => {
      if (command instanceof HeadObjectCommand) return { ContentLength: bytes.length, ContentType: "application/pdf", Metadata: { fictional: String(config.KYC_FICTIONAL_ONLY), classification: "restricted-kyc" }, ServerSideEncryption: config.KYC_S3_SERVER_SIDE_ENCRYPTION, ETag: scenario === "missing-version" ? undefined : "immutable-version" };
      if (command instanceof GetObjectCommand) {
        expect(command.input.IfMatch).toBe("immutable-version");
        return { Body: { transformToByteArray: async () => bytes } };
      }
      if (command instanceof PutObjectCommand) writes.push(command);
      return {};
    }) as never);
    const result = verifyAndScanKycObject({ storageKey: "kyc/quarantine/fictional/document", mimeType: "application/pdf", sizeBytes: bytes.length, checksum: scenario === "checksum-mismatch" ? "0".repeat(64) : createHash("sha256").update(bytes).digest("hex") });
    if (scenario !== "clean") {
      await expect(result).rejects.toThrow();
      expect(writes).toHaveLength(0);
    } else {
      await expect(result).resolves.toMatchObject({ scanStatus: "CLEAN" });
      expect(writes).toHaveLength(1);
      expect(writes[0]!.input.Body).toEqual(bytes);
      expect(writes[0]!.input.Key).toMatch(/^kyc\/clean\//);
      expect(send.mock.calls.some(([command]) => command.constructor.name === "CopyObjectCommand")).toBe(false);
    }
  });
});
