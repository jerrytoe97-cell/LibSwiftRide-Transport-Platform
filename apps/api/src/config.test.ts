import { describe, expect, it } from "vitest";
import { parseEnvironment } from "./config.js";

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://app:secret@db.internal:5432/libswiftride",
  REDIS_URL: "rediss://redis.internal:6379",
  ROUTING_API_URL: "https://routing.internal.example/v1",
  CORS_ORIGINS: "https://passenger.example.com,https://driver.example.com",
  JWT_ACCESS_SECRET: "prod-access-7f4d8c1a9e2b6f3d0c5a8e1b4d7f9c2a",
  JWT_REFRESH_SECRET: "prod-refresh-3a8e1d6f9c2b5a7e0d4f8c1b6a9e3d5f",
  MFA_ENCRYPTION_KEY: "prod-mfa-6f2a9c4e8b1d5f7a3c0e6b9d2f4a8c1e",
  PAYMENT_WEBHOOK_SECRET: "prod-webhook-8d2f6a1c5e9b3d7f",
  METRICS_TOKEN: "prod-metrics-4c8e2a6f9d3b7e1c",
  PAYMENTS_ENABLED: "false",
  PAYMENT_PROVIDER: "sandbox",
  DEMO_MODE: "false"
} satisfies NodeJS.ProcessEnv;

describe("production environment safeguards", () => {
  it("accepts isolated HTTPS staging-style production configuration with payments disabled", () => {
    expect(parseEnvironment(production)).toMatchObject({ NODE_ENV: "production", PAYMENTS_ENABLED: false });
  });

  it("accepts Mapbox routing only with a server-side token", () => {
    expect(parseEnvironment({
      ...production,
      ROUTING_PROVIDER: "mapbox",
      ROUTING_API_URL: "https://api.mapbox.com/directions/v5/mapbox/driving",
      MAPBOX_ROUTING_TOKEN: "mapbox-routing-token-value"
    })).toMatchObject({ ROUTING_PROVIDER: "mapbox" });
    expect(() => parseEnvironment({
      ...production,
      ROUTING_PROVIDER: "mapbox",
      ROUTING_API_URL: "https://api.mapbox.com/directions/v5/mapbox/driving"
    })).toThrow("Invalid environment");
  });

  it("requires complete protected email configuration when production delivery is enabled", () => {
    expect(() => parseEnvironment({ ...production, NOTIFICATION_PROVIDER: "hooks", EMAIL_PROVIDER: "resend" })).toThrow("Invalid environment");
    expect(parseEnvironment({
      ...production,
      NOTIFICATION_PROVIDER: "hooks",
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "support@libswiftride.example",
      RESEND_API_KEY: "resend-key-with-at-least-32-characters"
    })).toMatchObject({ NOTIFICATION_PROVIDER: "hooks", EMAIL_PROVIDER: "resend" });
    expect(() => parseEnvironment({
      ...production,
      NOTIFICATION_PROVIDER: "hooks",
      EMAIL_PROVIDER: "hooks"
    })).toThrow("Invalid environment");
  });

  it.each([
    ["wildcard CORS", { CORS_ORIGINS: "*" }],
    ["non-TLS CORS", { CORS_ORIGINS: "http://passenger.example.com" }],
    ["public routing demo", { ROUTING_API_URL: "https://router.project-osrm.org" }],
    ["reused JWT secret", { JWT_REFRESH_SECRET: production.JWT_ACCESS_SECRET }],
    ["placeholder secret", { JWT_ACCESS_SECRET: "replace-with-at-least-32-random-characters" }]
  ])("rejects %s", (_label, override) => {
    expect(() => parseEnvironment({ ...production, ...override })).toThrow("Invalid environment");
  });
});
