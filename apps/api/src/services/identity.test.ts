import { describe, expect, it } from "vitest";
import { liberianPhoneLookupCandidates, normalizeLiberianPhone, selectAuthenticatedIdentity, strongPasswordSchema } from "./identity.js";

describe("identity normalization", () => {
  it.each([
    ["0776344235", "+231776344235"],
    ["231776344235", "+231776344235"],
    ["+231776344235", "+231776344235"],
    ["+231 776 344 235", "+231776344235"]
  ])("normalizes %s", (input, expected) => expect(normalizeLiberianPhone(input)).toBe(expected));

  it("provides canonical and legacy lookup candidates", () => {
    expect(liberianPhoneLookupCandidates("0776344235")).toEqual(["+231776344235", "0776344235"]);
  });

  it("rejects invalid numbers and weak passwords", () => {
    expect(() => normalizeLiberianPhone("12345")).toThrow("valid Liberian number");
    expect(strongPasswordSchema.safeParse("short-password").success).toBe(false);
    expect(strongPasswordSchema.safeParse("Strong-password-123!").success).toBe(true);
  });

  it("selects the one active legacy or canonical identity whose password matches", async () => {
    const candidates = [
      { id: "legacy", status: "ACTIVE", passwordHash: "old-hash" },
      { id: "canonical", status: "ACTIVE", passwordHash: "reset-hash" }
    ];
    const selected = await selectAuthenticatedIdentity(candidates, "new-password", async (hash, password) =>
      hash === "reset-hash" && password === "new-password"
    );
    expect(selected?.id).toBe("canonical");
  });

  it("fails closed when no identity or multiple identities match", async () => {
    const candidates = [
      { id: "legacy", status: "ACTIVE", passwordHash: "same-hash" },
      { id: "canonical", status: "ACTIVE", passwordHash: "same-hash" }
    ];
    const verify = async (hash: string) => hash === "same-hash";
    await expect(selectAuthenticatedIdentity(candidates, "password", verify)).resolves.toBeNull();
    await expect(selectAuthenticatedIdentity([], "password", verify)).resolves.toBeNull();
  });
});
