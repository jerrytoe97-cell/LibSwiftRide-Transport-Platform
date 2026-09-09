import { createHash, randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "./lib.js";
import { issueTokens, rotateRefreshToken, revokeRefreshToken, verifyAccessToken } from "./auth.js";
import { api } from "./routes.js";

const app = express(); app.use(express.json()); app.use("/api/v1", api);
afterAll(() => prisma.$disconnect());
async function fixture() {
  return prisma.user.create({ data: { phone: `fictional-session-${randomUUID()}`, email: `${randomUUID()}@example.test`, emailVerifiedAt: new Date(), firstName: "Fictional", lastName: "Session", passwordHash: "unusable-test-fixture", role: "PASSENGER", status: "ACTIVE" } });
}
describe("PostgreSQL session concurrency", () => {
  it("permits exactly one concurrent refresh and retains one session family", async () => {
    const user = await fixture(); const original = await issueTokens({ sub: user.id, role: user.role });
    const results = await Promise.allSettled([rotateRefreshToken(original.refreshToken), rotateRefreshToken(original.refreshToken)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rows = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(new Set(rows.map((r) => r.familyId)).size).toBe(1);
    expect(rows.filter((r) => !r.revokedAt)).toHaveLength(1);
  });
  it("revoking the original token also revokes a concurrently issued successor", async () => {
    const user = await fixture(); const original = await issueTokens({ sub: user.id, role: user.role });
    const [rotation] = await Promise.allSettled([rotateRefreshToken(original.refreshToken), revokeRefreshToken(original.refreshToken)]);
    expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    await expect(verifyAccessToken(original.accessToken)).rejects.toThrow();
    if (rotation.status === "fulfilled") await expect(verifyAccessToken(rotation.value.accessToken)).rejects.toThrow();
  });
  it("password reset invalidates simultaneous refresh and rejects stale credential snapshots", async () => {
    const user = await fixture(); const original = await issueTokens({ sub: user.id, role: user.role });
    const resetToken = randomUUID() + randomUUID();
    await prisma.verificationToken.create({ data: { userId: user.id, type: "PASSWORD_RESET", tokenHash: createHash("sha256").update(resetToken).digest("hex"), expiresAt: new Date(Date.now() + 60_000) } });
    const [rotation, reset] = await Promise.allSettled([rotateRefreshToken(original.refreshToken), request(app).post("/api/v1/auth/password-reset/confirm").send({ token: resetToken, password: "New-fictional-password-123!" })]);
    expect(reset.status).toBe("fulfilled");
    if (reset.status === "fulfilled") expect(reset.value.status).toBe(200);
    expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    await expect(verifyAccessToken(original.accessToken)).rejects.toThrow();
    if (rotation.status === "fulfilled") await expect(verifyAccessToken(rotation.value.accessToken)).rejects.toThrow();
    await expect(issueTokens({ sub: user.id, role: user.role }, undefined, user.securityVersion)).rejects.toThrow();
  });
  it("status changes revoke concurrent refresh and reactivation does not restore old access", async () => {
    const user = await fixture();
    const admin = await prisma.user.create({ data: { phone: `fictional-admin-${randomUUID()}`, firstName: "Fictional", lastName: "Admin", passwordHash: "unusable-test", role: "ADMIN", status: "ACTIVE" } });
    const adminToken = (await issueTokens({ sub: admin.id, role: admin.role, mfa: true })).accessToken;
    const original = await issueTokens({ sub: user.id, role: user.role });
    const [rotation, status] = await Promise.allSettled([rotateRefreshToken(original.refreshToken), request(app).patch(`/api/v1/admin/passengers/${user.id}/status`).set("authorization", `Bearer ${adminToken}`).send({ status: "SUSPENDED" })]);
    expect(status.status).toBe("fulfilled"); if (status.status === "fulfilled") expect(status.value.status).toBe(200);
    await request(app).patch(`/api/v1/admin/passengers/${user.id}/status`).set("authorization", `Bearer ${adminToken}`).send({ status: "ACTIVE" }).expect(200);
    await expect(verifyAccessToken(original.accessToken)).rejects.toThrow();
    if (rotation.status === "fulfilled") await expect(verifyAccessToken(rotation.value.accessToken)).rejects.toThrow();
  });
});
