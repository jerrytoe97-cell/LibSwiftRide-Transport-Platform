import argon2 from "argon2";
import { createHash, randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { config } from "./config.js";
import { prisma } from "./lib.js";
import { requiresMfa } from "./services/mfa.js";
import type { Prisma } from "@prisma/client";
import { lockIdentity } from "./services/verification-tokens.js";

export type AuthUser = { sub: string; role: string; mfa?: boolean };
declare global {
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

const accessSecret = new TextEncoder().encode(config.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(config.JWT_REFRESH_SECRET);

export const hashPassword = (password: string) => argon2.hash(password);
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export async function verifyAccessToken(token: string, database: Pick<Prisma.TransactionClient, "refreshToken"> = prisma): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, accessSecret, { algorithms: ["HS256"] });
  if (!payload.sub || typeof payload.role !== "string" || typeof payload.sid !== "string") throw new Error("Invalid access token payload");
  const session = await database.refreshToken.findUnique({ where: { id: payload.sid }, include: { user: { select: { id: true, role: true, status: true, securityVersion: true } } } });
  if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= new Date()) throw new Error("Session is unavailable");
  const user = session.user;
  if (user.status !== "ACTIVE" || user.role !== payload.role || user.securityVersion !== payload.sv || (requiresMfa(user.role) && payload.mfa !== true)) throw new Error("Account authorization changed");
  return { sub: user.id, role: user.role, mfa: payload.mfa === true };
}

export async function issueTokens(user: AuthUser, database?: Prisma.TransactionClient, expectedVersion?: number, familyId: string = randomUUID()): Promise<{ accessToken: string; refreshToken: string }> {
  if (!database) return prisma.$transaction((tx) => issueTokens(user, tx, expectedVersion, familyId));
  await lockIdentity(database, user.sub);
  const current = await database.user.findUniqueOrThrow({ where: { id: user.sub } });
  if (current.status !== "ACTIVE" || current.role !== user.role || (expectedVersion !== undefined && current.securityVersion !== expectedVersion)) throw Object.assign(new Error("Account authorization changed"), { status: 401, code: "INVALID_TOKEN" });
  const tokenId = randomUUID();
  const accessToken = await new SignJWT({ role: user.role, mfa: user.mfa === true, sid: tokenId, sv: current.securityVersion })
    .setProtectedHeader({ alg: "HS256" }).setSubject(user.sub).setIssuedAt()
    .setExpirationTime(config.ACCESS_TOKEN_TTL).sign(accessSecret);
  const refreshToken = await new SignJWT({ role: user.role, mfa: user.mfa === true, jti: tokenId, sv: current.securityVersion })
    .setProtectedHeader({ alg: "HS256" }).setSubject(user.sub).setIssuedAt()
    .setExpirationTime(`${config.REFRESH_TOKEN_TTL_DAYS}d`).sign(refreshSecret);
  await database.refreshToken.create({
    data: {
      id: tokenId,
      familyId,
      userId: user.sub,
      tokenHash: digest(refreshToken),
      expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000)
    }
  });
  return { accessToken, refreshToken };
}

export async function rotateRefreshToken(token: string) {
  const { payload } = await jwtVerify(token, refreshSecret, { algorithms: ["HS256"] });
  if (!payload.sub || typeof payload.role !== "string") throw new Error("Invalid refresh token");
  return prisma.$transaction(async (tx) => {
    await lockIdentity(tx, payload.sub!);
    const stored = await tx.refreshToken.findUnique({ where: { tokenHash: digest(token) }, include: { user: { select: { id: true, role: true, status: true, securityVersion: true } } } });
    if (!stored || stored.userId !== payload.sub || stored.revokedAt || stored.expiresAt <= new Date()) throw new Error("Refresh token is expired or revoked");
    const user = stored.user;
    if (user.status !== "ACTIVE" || user.role !== payload.role || user.securityVersion !== payload.sv || (requiresMfa(user.role) && payload.mfa !== true)) throw new Error("Account authorization changed");
    const consumed = await tx.refreshToken.updateMany({ where: { id: stored.id, revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date() } });
    if (consumed.count !== 1) throw new Error("Refresh token already consumed");
    return issueTokens({ sub: user.id, role: user.role, mfa: payload.mfa === true }, tx, user.securityVersion, stored.familyId);
  });
}

export async function revokeRefreshToken(token: string) {
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: digest(token) } });
  if (stored) await revokeSessionFamily(stored.userId, stored.id);
}

export async function revokeSessionFamily(userId: string, sessionId: string) {
  return prisma.$transaction(async (tx) => {
    await lockIdentity(tx, userId);
    const session = await tx.refreshToken.findFirst({ where: { id: sessionId, userId } });
    if (!session) return false;
    await tx.refreshToken.updateMany({ where: { userId, familyId: session.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditLog.create({ data: { actorId: userId, action: "SESSION_FAMILY_REVOKED", entityType: "RefreshToken", entityId: sessionId } });
    return true;
  });
}

type SecurityMiddleware = ((req: Request, res: Response, next: NextFunction) => unknown) & {
  securityControl: "authenticate" | "authorize";
  roles?: readonly string[];
};

const authenticateHandler = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Bearer token required" } });
  try {
    req.user = await verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token is invalid or expired" } });
  }
};

export const authenticate = Object.assign(authenticateHandler, { securityControl: "authenticate" as const }) as SecurityMiddleware;

export const authorize = (...roles: string[]) => {
  const handler = (req: Request, res: Response, next: NextFunction) =>
    req.user && roles.includes(req.user.role)
      ? next()
      : res.status(403).json({ error: { code: "FORBIDDEN", message: "Insufficient permission" } });
  return Object.assign(handler, { securityControl: "authorize" as const, roles: [...roles] }) as SecurityMiddleware;
};
