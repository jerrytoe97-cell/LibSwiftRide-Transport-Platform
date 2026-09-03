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
  it("requires explicit surge activation", () => {
    expect(parseEnvironment(production).SURGE_PRICING_ENABLED).toBe(false);
    expect(parseEnvironment({ ...production, SURGE_PRICING_ENABLED: "true" }).SURGE_PRICING_ENABLED).toBe(true);
    expect(() => parseEnvironment({ ...production, SURGE_PRICING_ENABLED: "yes" })).toThrow();
  });
  it("keeps geocoding disabled until a server credential is configured", () => {
    expect(parseEnvironment(production).GEOCODING_ENABLED).toBe(false);
    expect(() => parseEnvironment({ ...production, GEOCODING_ENABLED: "true" })).toThrow("GEOCODING_API_TOKEN");
    expect(parseEnvironment({ ...production, GEOCODING_ENABLED: "true", GEOCODING_API_TOKEN: "synthetic-geocoding-test-key" }).GEOCODING_ENABLED).toBe(true);
  });
  it("allows an empty KYC bucket only while KYC storage is disabled", () => {
    expect(parseEnvironment({ ...production, KYC_STORAGE_PROVIDER: "disabled", KYC_S3_BUCKET: "" }))
      .toMatchObject({ KYC_STORAGE_PROVIDER: "disabled", KYC_S3_BUCKET: undefined });
    expect(() => parseEnvironment({ ...production, KYC_STORAGE_PROVIDER: "s3", KYC_S3_BUCKET: "" }))
      .toThrow("Invalid environment");
  });

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
      EMAIL_REPLY_TO: "support@libswiftride.example",
      RESEND_API_KEY: "resend-key-with-at-least-32-characters"
    })).toMatchObject({ NOTIFICATION_PROVIDER: "hooks", EMAIL_PROVIDER: "resend" });
    expect(() => parseEnvironment({
      ...production,
      NOTIFICATION_PROVIDER: "hooks",
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "support@libswiftride.example",
      RESEND_API_KEY: "resend-key-with-at-least-32-characters"
    })).toThrow("Invalid environment");
    expect(() => parseEnvironment({
      ...production,
      NOTIFICATION_PROVIDER: "hooks",
      EMAIL_PROVIDER: "hooks"
    })).toThrow("Invalid environment");
    expect(parseEnvironment({
      ...production,
      NOTIFICATION_PROVIDER: "hooks",
      EMAIL_PROVIDER: "zoho",
      EMAIL_FROM: "support@libswiftride.com",
      EMAIL_REPLY_TO: "support@libswiftride.com",
      ZOHO_SMTP_USER: "support@libswiftride.com",
      ZOHO_SMTP_APP_PASSWORD: "123456789012"
    })).toMatchObject({ EMAIL_PROVIDER: "zoho", ZOHO_SMTP_HOST: "smtppro.zoho.com", ZOHO_SMTP_PORT: 465, ZOHO_SMTP_SECURE: true });
    expect(() => parseEnvironment({
      ...production,
      NOTIFICATION_PROVIDER: "hooks",
      EMAIL_PROVIDER: "zoho",
      EMAIL_FROM: "support@libswiftride.com",
      EMAIL_REPLY_TO: "support@libswiftride.com",
      ZOHO_SMTP_USER: "support@libswiftride.com"
    })).toThrow("Invalid environment");
    expect(() => parseEnvironment({
      ...production,
      NOTIFICATION_PROVIDER: "hooks",
      EMAIL_PROVIDER: "zoho",
      EMAIL_FROM: "support@libswiftride.com",
      EMAIL_REPLY_TO: "support@libswiftride.com",
      ZOHO_SMTP_USER: "support@libswiftride.com",
      ZOHO_SMTP_APP_PASSWORD: "123456789012",
      ZOHO_SMTP_PORT: "465",
      ZOHO_SMTP_SECURE: "false"
    })).toThrow("Invalid environment");
    expect(parseEnvironment({
      ...production,
      NOTIFICATION_PROVIDER: "hooks",
      EMAIL_PROVIDER: "zoho",
      EMAIL_FROM: "support@libswiftride.com",
      EMAIL_REPLY_TO: "support@libswiftride.com",
      ZOHO_SMTP_USER: "support@libswiftride.com",
      ZOHO_SMTP_APP_PASSWORD: "Ab12Cd34Ef56",
      ZOHO_SMTP_PORT: "587",
      ZOHO_SMTP_SECURE: "false"
    })).toMatchObject({ ZOHO_SMTP_PORT: 587, ZOHO_SMTP_SECURE: false });
    expect(parseEnvironment({
      ...production,
      NOTIFICATION_PROVIDER: "hooks",
      EMAIL_PROVIDER: "zoho",
      EMAIL_FROM: "support@libswiftride.com",
      EMAIL_REPLY_TO: "support@libswiftride.com",
      ZOHO_SMTP_USER: "support@libswiftride.com",
      ZOHO_SMTP_APP_PASSWORD: "Ab12Cd34Ef56Gh78",
      ZOHO_SMTP_PORT: "465",
      ZOHO_SMTP_SECURE: "true"
    })).toMatchObject({ ZOHO_SMTP_PORT: 465, ZOHO_SMTP_SECURE: true });
    expect(() => parseEnvironment({
      ...production,
      NOTIFICATION_PROVIDER: "hooks",
      EMAIL_PROVIDER: "zoho",
      EMAIL_FROM: "support@libswiftride.com",
      EMAIL_REPLY_TO: "support@libswiftride.com",
      ZOHO_SMTP_USER: "support@libswiftride.com",
      ZOHO_SMTP_APP_PASSWORD: "TooShort"
    })).toThrow("at least 12 characters");
    expect(() => parseEnvironment({
      ...production,
      NOTIFICATION_PROVIDER: "hooks",
      EMAIL_PROVIDER: "zoho",
      EMAIL_FROM: "support@libswiftride.com",
      EMAIL_REPLY_TO: "support@libswiftride.com",
      ZOHO_SMTP_USER: "support@libswiftride.com",
      ZOHO_SMTP_APP_PASSWORD: "Ab12Cd34Ef56",
      ZOHO_SMTP_PORT: "2525",
      ZOHO_SMTP_SECURE: "false"
    })).toThrow("port 465 (SSL) or 587 (STARTTLS)");
  });

  it("identifies every missing Zoho Render variable", () => {
    expect(() => parseEnvironment({ ...production, NOTIFICATION_PROVIDER: "hooks", EMAIL_PROVIDER: "zoho" }))
      .toThrow(/ZOHO_SMTP_USER[\s\S]*ZOHO_SMTP_APP_PASSWORD[\s\S]*EMAIL_FROM[\s\S]*EMAIL_REPLY_TO/);
  });

  it("allows sandbox KYC scanning only for fictional documents with complete private storage configuration", () => {
    const fictionalKyc = {
      ...production,
      KYC_STORAGE_PROVIDER: "s3",
      KYC_S3_ENDPOINT: "https://private-storage.example.com",
      KYC_S3_BUCKET: "libswiftride-staging-kyc",
      KYC_S3_ACCESS_KEY_ID: "staging-access-key-id",
      KYC_S3_SECRET_ACCESS_KEY: "staging-secret-access-key",
      KYC_SCANNER_PROVIDER: "sandbox",
      KYC_FICTIONAL_ONLY: "true"
    };
    expect(parseEnvironment(fictionalKyc)).toMatchObject({ KYC_STORAGE_PROVIDER: "s3", KYC_FICTIONAL_ONLY: true });
    expect(() => parseEnvironment({ ...fictionalKyc, KYC_FICTIONAL_ONLY: "false" })).toThrow("Invalid environment");
    expect(() => parseEnvironment({ ...fictionalKyc, KYC_S3_SECRET_ACCESS_KEY: "" })).toThrow("Invalid environment");
  });

  it("supports native AWS credentials and requires a fail-closed production scanner", () => {
    const productionKyc = {
      ...production,
      KYC_STORAGE_PROVIDER: "s3",
      KYC_S3_REGION: "us-east-1",
      KYC_S3_BUCKET: "libswiftride-production-kyc",
      KYC_SCANNER_PROVIDER: "webhook",
      KYC_SCANNER_URL: "https://scanner.internal.example/v1/scan",
      KYC_SCANNER_TOKEN: "protected-scanner-token-value",
      KYC_FICTIONAL_ONLY: "false"
    };
    expect(parseEnvironment(productionKyc)).toMatchObject({ KYC_STORAGE_PROVIDER: "s3", KYC_SCANNER_PROVIDER: "webhook", KYC_FICTIONAL_ONLY: false });
    expect(() => parseEnvironment({ ...productionKyc, KYC_SCANNER_TOKEN: "" })).toThrow("Invalid environment");
    expect(() => parseEnvironment({ ...productionKyc, KYC_SCANNER_URL: "http://scanner.internal.example/v1/scan" })).toThrow("Invalid environment");
    expect(() => parseEnvironment({ ...productionKyc, KYC_S3_ACCESS_KEY_ID: "access-key-without-secret" })).toThrow("Invalid environment");
  });

  it("requires a KMS key when KYC storage selects aws:kms", () => {
    expect(() => parseEnvironment({ ...production, KYC_S3_SERVER_SIDE_ENCRYPTION: "aws:kms" })).toThrow("Invalid environment");
    expect(parseEnvironment({ ...production, KYC_S3_SERVER_SIDE_ENCRYPTION: "aws:kms", KYC_S3_KMS_KEY_ID: "alias/libswiftride-kyc" })).toMatchObject({ KYC_S3_SERVER_SIDE_ENCRYPTION: "aws:kms" });
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
