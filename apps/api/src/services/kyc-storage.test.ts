import { describe, expect, it } from "vitest";
import { validateKycFile } from "./kyc-storage.js";

describe("KYC file validation", () => {
  it("accepts matching JPEG, PNG and PDF magic bytes", () => {
    expect(() => validateKycFile(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg")).not.toThrow();
    expect(() => validateKycFile(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")).not.toThrow();
    expect(() => validateKycFile(new TextEncoder().encode("%PDF-test"), "application/pdf")).not.toThrow();
  });

  it("rejects mismatched content and the EICAR test signature", () => {
    expect(() => validateKycFile(new TextEncoder().encode("not-a-pdf"), "application/pdf")).toThrow("does not match");
    expect(() => validateKycFile(new TextEncoder().encode("%PDF-EICAR-STANDARD-ANTIVIRUS-TEST-FILE"), "application/pdf")).toThrow("malware");
  });
});
