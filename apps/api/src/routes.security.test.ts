import { describe, expect, it } from "vitest";
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

  it.each([
    ["POST", "/rides", ["PASSENGER"]],
    ["POST", "/drivers/rides/:id/accept", ["DRIVER"]],
    ["POST", "/drivers/rides/:id/reject", ["DRIVER"]],
    ["POST", "/drivers/kyc/submit", ["DRIVER"]],
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
