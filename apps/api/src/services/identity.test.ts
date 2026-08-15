import { describe, expect, it } from "vitest";
import { liberianPhoneLookupCandidates, normalizeLiberianPhone, strongPasswordSchema } from "./identity.js";

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
});
