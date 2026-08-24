import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { api } from "./routes.js";

type RouteLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: { securityControl?: string; roles?: readonly string[] } }>;
  };
};

const routes = ((api as unknown as { stack: RouteLayer[] }).stack)
  .flatMap((layer) => layer.route ? [{ method: Object.keys(layer.route.methods)[0]!.toUpperCase(), path: layer.route.path, handlers: layer.route.stack.map((item) => item.handle) }] : []);

const publicRoutes = new Set([
  "POST /auth/register",
  "POST /auth/login",
  "POST /auth/mfa/enrollment/start",
  "POST /auth/mfa/enrollment/confirm",
  "POST /auth/mfa/challenge",
  "POST /auth/demo-login",
  "POST /auth/refresh",
  "POST /auth/logout",
  "POST /auth/email-verification/confirm",
  "POST /auth/password-reset/request",
  "POST /auth/password-reset/confirm",
  "GET /trip-shares/:token",
  "POST /payments/webhooks/:provider"
]);

describe("API authorization contract", () => {
  it("requires authentication on every route that is not explicitly public or signed", () => {
    const unprotected = routes
      .filter((route) => !publicRoutes.has(`${route.method} ${route.path}`))
      .filter((route) => !route.handlers.some((handler) => handler.securityControl === "authenticate"))
      .map((route) => `${route.method} ${route.path}`);
    expect(unprotected).toEqual([]);
  });

  it("keeps the public allow-list narrow and fully represented", () => {
    const implemented = new Set(routes.map((route) => `${route.method} ${route.path}`));
    expect([...publicRoutes].filter((route) => !implemented.has(route))).toEqual([]);
  });

  it("keeps peer photos authenticated and ride-scoped", () => {
    for (const path of ["/profile/photo", "/rides/:id/peer-photo"]) {
      const matching = routes.filter((route) => route.path === path);
      expect(matching.length).toBeGreaterThan(0);
      expect(matching.every((route) => route.handlers.some((handler) => handler.securityControl === "authenticate"))).toBe(true);
    }
  });

  it("does not use an unrestricted user include in participant ride detail", () => {
    const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
    const detail = source.slice(source.indexOf('api.get("/rides/:id"'), source.indexOf('api.get("/rides/:id/peer-photo"'));
    expect(detail).not.toContain("user: true");
    expect(detail).not.toContain("passwordHash");
    expect(detail).toContain("canShareRideContact");
  });

  it.each([
    ["POST", "/rides/quote", ["PASSENGER"]],
    ["POST", "/rides", ["PASSENGER"]],
    ["PUT", "/profile/photo", ["PASSENGER", "DRIVER"]],
    ["POST", "/drivers/rides/:id/accept", ["DRIVER"]],
    ["POST", "/drivers/rides/:id/reject", ["DRIVER"]],
    ["POST", "/drivers/kyc/submit", ["DRIVER"]],
    ["POST", "/drivers/kyc/uploads", ["DRIVER"]],
    ["POST", "/drivers/kyc/uploads/complete", ["DRIVER"]],
    ["GET", "/admin/kyc", ["ADMIN"]],
    ["POST", "/admin/kyc/:id/review", ["ADMIN"]],
    ["POST", "/admin/kyc/documents/:id/access", ["ADMIN"]],
    ["POST", "/dispatch/rides/:id/assign", ["DISPATCHER", "ADMIN"]],
    ["POST", "/payments/:id/confirm-mobile-money", ["ADMIN", "SUPPORT"]],
    ["GET", "/corporate/account", ["BUSINESS_MANAGER", "ADMIN"]],
    ["POST", "/fleet/drivers", ["FLEET_MANAGER", "ADMIN"]],
    ["GET", "/admin/audit-logs", ["ADMIN"]]
  ])("enforces role boundaries for %s %s", (method, path, expectedRoles) => {
    const route = routes.find((candidate) => candidate.method === method && candidate.path === path);
    const authorization = route?.handlers.find((handler) => handler.securityControl === "authorize");
    expect(authorization?.roles).toEqual(expectedRoles);
  });
});
