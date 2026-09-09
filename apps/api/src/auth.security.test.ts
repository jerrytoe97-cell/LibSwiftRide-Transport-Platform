import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticate, issueTokens, rotateRefreshToken, verifyAccessToken } from "./auth.js";
import { prisma } from "./lib.js";

// Stateful storage seam: exercises real signing, verification and HTTP middleware.
// PostgreSQL race/rollback coverage lives in the database acceptance suite.
let account: any;
let sessions: any[];
beforeEach(() => {
  vi.restoreAllMocks();
  account = { id: "fictional-user", role: "PASSENGER", status: "ACTIVE", securityVersion: 0 };
  vi.spyOn(prisma, "$queryRaw").mockResolvedValue([]);
  vi.spyOn(prisma.user, "findUniqueOrThrow").mockImplementation((async () => account) as never);
  sessions = [];
  vi.spyOn(prisma.user, "findUnique").mockImplementation((async () => account) as never);
  vi.spyOn(prisma.refreshToken, "create").mockImplementation((async ({ data }: any) => {
    const row = { ...data, id: data.id ?? String(sessions.length), revokedAt: null };
    sessions.push(row); return row;
  }) as never);
  vi.spyOn(prisma.refreshToken, "findUnique").mockImplementation((async ({ where }: any) => {
    const row = sessions.find((r) => where.id ? r.id === where.id : r.tokenHash === where.tokenHash);
    return row ? { ...row, user: account } : null;
  }) as never);
  vi.spyOn(prisma.refreshToken, "update").mockImplementation((async ({ where, data }: any) => {
    const row = sessions.find((r) => r.id === where.id); Object.assign(row, data); return row;
  }) as never);
  vi.spyOn(prisma.refreshToken, "updateMany").mockImplementation((async ({ where, data }: any) => {
    const rows = sessions.filter((r) => (!where.id || r.id === where.id) && (!where.userId || r.userId === where.userId) && r.revokedAt === null && r.expiresAt > new Date());
    rows.forEach((r) => Object.assign(r, data)); return { count: rows.length };
  }) as never);
  vi.spyOn(prisma, "$transaction").mockImplementation(async (operation: any) => operation(prisma));
});
const app = express(); app.get("/private", authenticate, (req, res) => res.json(req.user));

describe("session security", () => {
  it("rejects access immediately after its session is revoked", async () => {
    const tokens = await issueTokens({ sub: account.id, role: account.role });
    sessions[0].revokedAt = new Date();
    await expect(verifyAccessToken(tokens.accessToken)).rejects.toThrow();
  });
  it("does not upgrade an old passenger token to a privileged current role", async () => {
    const tokens = await issueTokens({ sub: account.id, role: "PASSENGER" });
    account.role = "ADMIN";
    await request(app).get("/private").set("authorization", `Bearer ${tokens.accessToken}`).expect(401);
  });
  it.each(["SUSPENDED", "DEACTIVATED"])("rejects refresh and access for %s accounts", async (status) => {
    const tokens = await issueTokens({ sub: account.id, role: account.role }); account.status = status;
    await expect(rotateRefreshToken(tokens.refreshToken)).rejects.toThrow();
    await expect(verifyAccessToken(tokens.accessToken)).rejects.toThrow();
  });
  it("consumes a refresh token at most once under concurrent calls", async () => {
    const tokens = await issueTokens({ sub: account.id, role: account.role });
    const results = await Promise.allSettled([rotateRefreshToken(tokens.refreshToken), rotateRefreshToken(tokens.refreshToken)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(sessions.filter((r) => !r.revokedAt)).toHaveLength(1);
  });
  it("permits an active session and preserves verified MFA claims", async () => {
    account.role = "ADMIN";
    const tokens = await issueTokens({ sub: account.id, role: "ADMIN", mfa: true });
    const response = await request(app).get("/private").set("authorization", `Bearer ${tokens.accessToken}`).expect(200);
    expect(response.body).toMatchObject({ sub: account.id, role: "ADMIN", mfa: true });
  });
});
