import "dotenv/config";
import { z } from "zod";

const optionalUrl = z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional());
const optionalSecret = z.preprocess((value) => value === "" ? undefined : value, z.string().min(16).optional());
const optionalMobileMoneyNumber = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().regex(/^0\d{9}$/, "Mobile Money numbers must be 10-digit local numbers").optional()
);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  ROUTING_API_URL: z.string().url().default("https://router.project-osrm.org"),
  ROUTING_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(8_000),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PAYMENTS_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  DEMO_MODE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  PAYMENT_PROVIDER: z.enum(["sandbox", "mobile-money"]).default("sandbox"),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16),
  NOTIFICATION_PROVIDER: z.enum(["sandbox", "hooks"]).default("sandbox"),
  ORANGE_MONEY_API_URL: optionalUrl,
  ORANGE_MONEY_API_TOKEN: optionalSecret,
  ORANGE_MONEY_NUMBER: optionalMobileMoneyNumber,
  MTN_MOMO_API_URL: optionalUrl,
  MTN_MOMO_API_TOKEN: optionalSecret,
  MTN_MOMO_NUMBER: optionalMobileMoneyNumber,
  STRIPE_PAYMENT_HOOK_URL: optionalUrl,
  STRIPE_API_TOKEN: optionalSecret,
  EMAIL_DELIVERY_URL: optionalUrl,
  EMAIL_DELIVERY_TOKEN: optionalSecret,
  SMS_DELIVERY_URL: optionalUrl,
  SMS_DELIVERY_TOKEN: optionalSecret,
  PUSH_DELIVERY_URL: optionalUrl,
  PUSH_DELIVERY_TOKEN: optionalSecret,
  METRICS_TOKEN: optionalSecret
}).superRefine((environment, context) => {
  if (environment.NODE_ENV === "production" && environment.DEMO_MODE) {
    context.addIssue({ code: "custom", path: ["DEMO_MODE"], message: "Demo mode is forbidden in production" });
  }
  if (environment.NODE_ENV === "production" && !environment.METRICS_TOKEN) {
    context.addIssue({ code: "custom", path: ["METRICS_TOKEN"], message: "METRICS_TOKEN is required in production" });
  }
  if (environment.NODE_ENV === "production" && environment.PAYMENTS_ENABLED && environment.PAYMENT_PROVIDER !== "mobile-money") {
    context.addIssue({ code: "custom", path: ["PAYMENT_PROVIDER"], message: "Production payments require PAYMENT_PROVIDER=mobile-money" });
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment: ${parsed.error.message}`);
}

export const config = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((origin) => origin.trim())
};
