import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 15_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://test:test@localhost:5432/libswiftride_test",
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379",
      CORS_ORIGINS: "http://localhost:3000",
      JWT_ACCESS_SECRET: "test-access-secret-at-least-32-characters",
      JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32-characters",
      MFA_ENCRYPTION_KEY: "test-mfa-encryption-key-at-least-32-characters",
      PAYMENT_WEBHOOK_SECRET: "test-webhook-secret-at-least-16"
    }
  }
});
