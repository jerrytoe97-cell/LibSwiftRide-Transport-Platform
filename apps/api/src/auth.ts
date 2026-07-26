import argon2 from "argon2";
import { createHash, randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { config } from "./config.js";
import { prisma } from "./lib.js";

export type AuthUser = { sub: string; role: string };
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

export async function verifyAccessToken(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, accessSecret);
  if (!payload.sub || !payload.role) throw new Error("Invalid access token payload");
  return { sub: payload.sub, role: String(payload.role) };
}

export async function issueTokens(user: AuthUser) {
  const accessToken = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" }).setSubject(user.sub).setIssuedAt()
    .setExpirationTime(config.ACCESS_TOKEN_TTL).sign(accessSecret);
  const tokenId = randomUUID();
  const refreshToken = await new SignJWT({ role: user.role, jti: tokenId })
    .setProtectedHeader({ alg: "HS256" }).setSubject(user.sub).setIssuedAt()
    .setExpirationTime(`${config.REFRESH_TOKEN_TTL_DAYS}d`).sign(refreshSecret);
  await prisma.refreshToken.create({
    data: {
      userId: user.sub,
      tokenHash: digest(refreshToken),
      expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000)
    }
  });
  return { accessToken, refreshToken };
}

export async function rotateRefreshToken(token: string) {
  const { payload } = await jwtVerify(token, refreshSecret);
  if (!payload.sub || !payload.role) throw new Error("Invalid refresh token");
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: digest(token) } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) throw new Error("Refresh token is expired or revoked");
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  return issueTokens({ sub: payload.sub, role: String(payload.role) });
}

export async function revokeRefreshToken(token: string) {
  await prisma.refreshToken.updateMany({ where: { tokenHash: digest(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Bearer token required" } });
  try {
    req.user = await verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token is invalid or expired" } });
  }
}

export const authorize = (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction) =>
    req.user && roles.includes(req.user.role)
      ? next()
      : res.status(403).json({ error: { code: "FORBIDDEN", message: "Insufficient permission" } });
