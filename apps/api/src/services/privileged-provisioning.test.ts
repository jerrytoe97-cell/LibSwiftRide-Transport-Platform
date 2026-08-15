import { describe, expect, it } from "vitest";
import { consumeStartupProvisioningEnvironment, parsePrivilegedAccounts, PRIVILEGED_PROVISIONING_CONFIRMATION } from "./privileged-provisioning.js";

const validAccount = { phone: "+231770000001", email: "Admin.Staging@example.com", password: "Staging-only-Strong-123!", firstName: "Staging", lastName: "Admin", role: "ADMIN" };

describe("privileged account provisioning input", () => {
  it("accepts approved roles and normalizes email without exposing the password", () => {
    const account = parsePrivilegedAccounts(JSON.stringify([validAccount]))[0]!;
    expect(account.email).toBe("admin.staging@example.com");
    expect(account.phone).toBe("+231770000001");
    expect(account.role).toBe("ADMIN");
  });

  it("rejects public roles, weak passwords, duplicates and missing organisation names", () => {
    expect(() => parsePrivilegedAccounts(JSON.stringify([{ ...validAccount, role: "PASSENGER" }]))).toThrow();
    expect(() => parsePrivilegedAccounts(JSON.stringify([{ ...validAccount, password: "too-short" }]))).toThrow();
    expect(() => parsePrivilegedAccounts(JSON.stringify([validAccount, validAccount]))).toThrow();
    expect(() => parsePrivilegedAccounts(JSON.stringify([{ ...validAccount, role: "FLEET_MANAGER" }]))).toThrow();
    expect(parsePrivilegedAccounts(JSON.stringify([{ ...validAccount, phone: "0770000001" }]))[0]!.phone).toBe("+231770000001");
  });

  it("consumes startup credentials and fails closed for partial or unauthorized configuration", () => {
    const disabled: NodeJS.ProcessEnv = {};
    expect(consumeStartupProvisioningEnvironment(disabled)).toBeNull();

    const enabled: NodeJS.ProcessEnv = {
      PRIVILEGED_PROVISIONING_CONFIRM: PRIVILEGED_PROVISIONING_CONFIRMATION,
      PRIVILEGED_ACCOUNTS_JSON: JSON.stringify([validAccount])
    };
    expect(consumeStartupProvisioningEnvironment(enabled)).toBeTruthy();
    expect(enabled.PRIVILEGED_PROVISIONING_CONFIRM).toBeUndefined();
    expect(enabled.PRIVILEGED_ACCOUNTS_JSON).toBeUndefined();

    const incomplete: NodeJS.ProcessEnv = { PRIVILEGED_PROVISIONING_CONFIRM: PRIVILEGED_PROVISIONING_CONFIRMATION };
    expect(() => consumeStartupProvisioningEnvironment(incomplete)).toThrow("incomplete or unauthorized");
    expect(incomplete.PRIVILEGED_PROVISIONING_CONFIRM).toBeUndefined();
  });
});
