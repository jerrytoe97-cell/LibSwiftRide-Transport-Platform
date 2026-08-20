import { describe, expect, it } from "vitest";
import { sandboxScanKycFile, validateKycFile, validateKycScannerResult } from "./kyc-storage.js";

describe("KYC file validation", () => {
  it("accepts matching JPEG, PNG and PDF magic bytes", () => {
    expect(() => validateKycFile(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg")).not.toThrow();
    expect(() => validateKycFile(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")).not.toThrow();
    expect(() => validateKycFile(new TextEncoder().encode("%PDF-test"), "application/pdf")).not.toThrow();
  });

  it("rejects mismatched content and the sandbox scanner rejects EICAR", () => {
    expect(() => validateKycFile(new TextEncoder().encode("not-a-pdf"), "application/pdf")).toThrow("does not match");
    expect(() => sandboxScanKycFile(new TextEncoder().encode("%PDF-EICAR-STANDARD-ANTIVIRUS-TEST-FILE"))).toThrow("malware");
  });

  it("fails closed on infected, malformed, or checksum-mismatched production scanner responses", () => {
    const checksum = "a".repeat(64);
    expect(() => validateKycScannerResult({ verdict: "clean", checksum }, checksum)).not.toThrow();
    expect(() => validateKycScannerResult({ verdict: "infected", checksum }, checksum)).toThrow("malware");
    expect(() => validateKycScannerResult({ verdict: "clean", checksum: "b".repeat(64) }, checksum)).toThrow("invalid response");
    expect(() => validateKycScannerResult({ verdict: "unknown", checksum }, checksum)).toThrow("invalid response");
  });
});
