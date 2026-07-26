import "dotenv/config";
import { z } from "zod";

const optionalUrl = z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional());
const optionalSecret = z.preprocess((value) => value === "" ? undefined : value, z.string().min(16).optional());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PAYMENT_PROVIDER: z.enum(["sandbox", "mobile-money"]).default("sandbox"),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16),
  ORANGE_MONEY_API_URL: optionalUrl,
  ORANGE_MONEY_API_TOKEN: optionalSecret,
  MTN_MOMO_API_URL: optionalUrl,
  MTN_MOMO_API_TOKEN: optionalSecret,
  STRIPE_PAYMENT_HOOK_URL: optionalUrl,
  STRIPE_API_TOKEN: optionalSecret,
  EMAIL_DELIVERY_URL: optionalUrl,
  EMAIL_DELIVERY_TOKEN: optionalSecret,
  SMS_DELIVERY_URL: optionalUrl,
  SMS_DELIVERY_TOKEN: optionalSecret,
  PUSH_DELIVERY_URL: optionalUrl,
  PUSH_DELIVERY_TOKEN: optionalSecret,
  METRICS_TOKEN: optionalSecret
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment: ${parsed.error.message}`);
}

export const config = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((origin) => origin.trim())
};
