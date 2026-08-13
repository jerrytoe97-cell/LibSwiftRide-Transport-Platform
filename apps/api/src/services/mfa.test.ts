import { describe, expect, it } from "vitest";
import { decryptMfaSecret, encryptMfaSecret, generateRecoveryCodes, recoveryCodeHash, requiresMfa, totp, verifyTotp } from "./mfa.js";

describe("staff MFA", () => {
  it("requires MFA only for privileged roles", () => {
    expect(["ADMIN", "SUPPORT", "DISPATCHER", "FLEET_MANAGER", "BUSINESS_MANAGER"].every(requiresMfa)).toBe(true);
    expect(requiresMfa("PASSENGER")).toBe(false);
    expect(requiresMfa("DRIVER")).toBe(false);
  });

  it("matches the RFC 6238 SHA-1 test vector with six digits", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(totp(secret, 59_000)).toBe("287082");
    expect(verifyTotp(secret, "287082", 59_000)).toBe(true);
    expect(verifyTotp(secret, "287083", 59_000)).toBe(false);
  });

  it("encrypts secrets with authenticated encryption", () => {
    const encrypted = encryptMfaSecret("JBSWY3DPEHPK3PXP", "dedicated-test-key-at-least-32-characters");
    expect(encrypted).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptMfaSecret(encrypted, "dedicated-test-key-at-least-32-characters")).toBe("JBSWY3DPEHPK3PXP");
    expect(() => decryptMfaSecret(encrypted, "different-dedicated-key-at-least-32-chars")).toThrow();
  });

  it("generates unique human-readable recovery codes and stable hashes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    expect(codes.every((code) => /^[A-F0-9]{4}-[A-F0-9]{4}$/.test(code))).toBe(true);
    expect(recoveryCodeHash(codes[0]!.toLowerCase())).toBe(recoveryCodeHash(codes[0]!));
  });
});
