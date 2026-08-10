import { describe, expect, it } from "vitest";
import { parsePrivilegedAccounts } from "./privileged-provisioning.js";

const validAccount = { phone: "+231770000001", email: "Admin.Staging@example.com", password: "Staging-only-Strong-123!", firstName: "Staging", lastName: "Admin", role: "ADMIN" };

describe("privileged account provisioning input", () => {
  it("accepts approved roles and normalizes email without exposing the password", () => {
    const account = parsePrivilegedAccounts(JSON.stringify([validAccount]))[0]!;
    expect(account.email).toBe("admin.staging@example.com");
    expect(account.role).toBe("ADMIN");
  });

  it("rejects public roles, weak passwords, duplicates and missing organisation names", () => {
    expect(() => parsePrivilegedAccounts(JSON.stringify([{ ...validAccount, role: "PASSENGER" }]))).toThrow();
    expect(() => parsePrivilegedAccounts(JSON.stringify([{ ...validAccount, password: "too-short" }]))).toThrow();
    expect(() => parsePrivilegedAccounts(JSON.stringify([validAccount, validAccount]))).toThrow();
    expect(() => parsePrivilegedAccounts(JSON.stringify([{ ...validAccount, role: "FLEET_MANAGER" }]))).toThrow();
  });
});
