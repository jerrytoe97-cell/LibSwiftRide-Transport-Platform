import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { consumeVerificationToken } from "./verification-tokens.js";

describe("one-use verification credentials", () => {
  it.each(["PASSWORD_RESET", "EMAIL_VERIFY", "MFA_LOGIN", "MFA_ENROLL"])("consumes %s once", async (type) => {
    let used = false;
    const tx = { verificationToken: { updateMany: async ({ where }: any) => {
      expect(where).toMatchObject({ id: "fictional-token", type, usedAt: null });
      expect(where.expiresAt.gt).toBeInstanceOf(Date);
      if (used) return { count: 0 }; used = true; return { count: 1 };
    } } } as unknown as Prisma.TransactionClient;
    const results = await Promise.allSettled([consumeVerificationToken(tx, "fictional-token", type), consumeVerificationToken(tx, "fictional-token", type)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ code: "INVALID_TOKEN", status: 400 });
  });
});
