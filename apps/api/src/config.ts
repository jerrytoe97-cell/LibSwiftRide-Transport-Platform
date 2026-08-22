import "dotenv/config";
import { z } from "zod";

const optionalUrl = z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional());
const optionalSecret = z.preprocess((value) => value === "" ? undefined : value, z.string().min(16).optional());
const optionalZohoCredential = z.preprocess((value) => value === "" ? undefined : value, z.string().min(12).optional());
const optionalMobileMoneyNumber = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().regex(/^0\d{9}$/, "Mobile Money numbers must be 10-digit local numbers").optional()
);

export const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  ROUTING_PROVIDER: z.enum(["osrm", "mapbox"]).default("osrm"),
  ROUTING_API_URL: z.string().url().default("https://router.project-osrm.org"),
  MAPBOX_ROUTING_TOKEN: optionalSecret,
  ROUTING_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(8_000),
  ROUTE_POINT_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  MFA_ENCRYPTION_KEY: z.preprocess((value) => value === "" ? undefined : value, z.string().min(32).optional()),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PAYMENTS_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  DEMO_MODE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  PAYMENT_PROVIDER: z.enum(["sandbox", "mobile-money"]).default("sandbox"),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16),
  NOTIFICATION_PROVIDER: z.enum(["sandbox", "hooks"]).default("sandbox"),
  EMAIL_PROVIDER: z.enum(["hooks", "resend", "zoho"]).default("hooks"),
  EMAIL_FROM: z.preprocess((value) => value === "" ? undefined : value, z.email().optional()),
  EMAIL_REPLY_TO: z.preprocess((value) => value === "" ? undefined : value, z.email().optional()),
  RESEND_API_KEY: optionalSecret,
  ZOHO_SMTP_HOST: z.string().min(1).default("smtppro.zoho.com"),
  ZOHO_SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(465),
  ZOHO_SMTP_SECURE: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  ZOHO_SMTP_USER: z.preprocess((value) => value === "" ? undefined : value, z.email().optional()),
  ZOHO_SMTP_APP_PASSWORD: optionalZohoCredential,
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
  METRICS_TOKEN: optionalSecret,
  KYC_STORAGE_PROVIDER: z.enum(["disabled", "s3"]).default("disabled"),
  KYC_S3_ENDPOINT: optionalUrl,
  KYC_S3_REGION: z.string().min(1).default("auto"),
  KYC_S3_BUCKET: z.string().min(3).optional(),
  KYC_S3_ACCESS_KEY_ID: optionalSecret,
  KYC_S3_SECRET_ACCESS_KEY: optionalSecret,
  KYC_S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  KYC_S3_SERVER_SIDE_ENCRYPTION: z.enum(["provider", "AES256", "aws:kms"]).default("provider"),
  KYC_S3_KMS_KEY_ID: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
  KYC_SCANNER_PROVIDER: z.enum(["disabled", "sandbox", "webhook"]).default("disabled"),
  KYC_SCANNER_URL: optionalUrl,
  KYC_SCANNER_TOKEN: optionalSecret,
  KYC_SCANNER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(10_000),
  KYC_FICTIONAL_ONLY: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  KYC_UPLOAD_MAX_BYTES: z.coerce.number().int().min(1024).max(10 * 1024 * 1024).default(5 * 1024 * 1024)
}).superRefine((environment, context) => {
  if (environment.NODE_ENV === "production" && environment.DEMO_MODE) {
    context.addIssue({ code: "custom", path: ["DEMO_MODE"], message: "Demo mode is forbidden in production" });
  }
  if (environment.NODE_ENV === "production" && !environment.METRICS_TOKEN) {
    context.addIssue({ code: "custom", path: ["METRICS_TOKEN"], message: "METRICS_TOKEN is required in production" });
  }
  if (environment.NODE_ENV === "production" && !environment.MFA_ENCRYPTION_KEY) {
    context.addIssue({ code: "custom", path: ["MFA_ENCRYPTION_KEY"], message: "MFA_ENCRYPTION_KEY is required in production" });
  }
  if (environment.NODE_ENV === "production" && environment.NOTIFICATION_PROVIDER === "hooks") {
    if (environment.EMAIL_PROVIDER === "hooks" && (!environment.EMAIL_DELIVERY_URL || !environment.EMAIL_DELIVERY_TOKEN)) {
      context.addIssue({ code: "custom", path: ["EMAIL_DELIVERY_URL"], message: "EMAIL_DELIVERY_URL and EMAIL_DELIVERY_TOKEN are required for hook email delivery" });
    }
    if (environment.EMAIL_PROVIDER === "resend" && (!environment.RESEND_API_KEY || !environment.EMAIL_FROM || !environment.EMAIL_REPLY_TO)) {
      context.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "RESEND_API_KEY, EMAIL_FROM and EMAIL_REPLY_TO are required for Resend email delivery" });
    }
    if (environment.EMAIL_PROVIDER === "zoho" && (!environment.ZOHO_SMTP_USER || !environment.ZOHO_SMTP_APP_PASSWORD || !environment.EMAIL_FROM || !environment.EMAIL_REPLY_TO)) {
      context.addIssue({ code: "custom", path: ["ZOHO_SMTP_USER"], message: "ZOHO_SMTP_USER, ZOHO_SMTP_APP_PASSWORD, EMAIL_FROM and EMAIL_REPLY_TO are required for Zoho email delivery" });
    }
    if (environment.EMAIL_PROVIDER === "zoho" && environment.ZOHO_SMTP_PORT === 465 && !environment.ZOHO_SMTP_SECURE) {
      context.addIssue({ code: "custom", path: ["ZOHO_SMTP_SECURE"], message: "Zoho SMTP port 465 requires implicit TLS" });
    }
  }
  if (environment.NODE_ENV === "production" && environment.PAYMENTS_ENABLED && environment.PAYMENT_PROVIDER !== "mobile-money") {
    context.addIssue({ code: "custom", path: ["PAYMENT_PROVIDER"], message: "Production payments require PAYMENT_PROVIDER=mobile-money" });
  }
  if (environment.JWT_ACCESS_SECRET === environment.JWT_REFRESH_SECRET) {
    context.addIssue({ code: "custom", path: ["JWT_REFRESH_SECRET"], message: "Access and refresh secrets must be different" });
  }
  if (environment.KYC_STORAGE_PROVIDER === "s3" && !environment.KYC_S3_BUCKET) {
    context.addIssue({ code: "custom", path: ["KYC_S3_BUCKET"], message: "A private KYC S3 bucket is required" });
  }
  if (Boolean(environment.KYC_S3_ACCESS_KEY_ID) !== Boolean(environment.KYC_S3_SECRET_ACCESS_KEY)) {
    context.addIssue({ code: "custom", path: ["KYC_S3_ACCESS_KEY_ID"], message: "KYC S3 access-key ID and secret must be configured together" });
  }
  if (environment.KYC_S3_SERVER_SIDE_ENCRYPTION === "aws:kms" && !environment.KYC_S3_KMS_KEY_ID) {
    context.addIssue({ code: "custom", path: ["KYC_S3_KMS_KEY_ID"], message: "KYC_S3_KMS_KEY_ID is required for aws:kms encryption" });
  }
  if (environment.KYC_STORAGE_PROVIDER === "s3" && environment.KYC_SCANNER_PROVIDER === "disabled") {
    context.addIssue({ code: "custom", path: ["KYC_SCANNER_PROVIDER"], message: "KYC uploads require a malware scanner" });
  }
  if (!environment.KYC_FICTIONAL_ONLY && environment.KYC_SCANNER_PROVIDER === "sandbox") {
    context.addIssue({ code: "custom", path: ["KYC_SCANNER_PROVIDER"], message: "Sandbox scanning may only be used for fictional staging documents" });
  }
  if (environment.KYC_SCANNER_PROVIDER === "webhook" && (!environment.KYC_SCANNER_URL || !environment.KYC_SCANNER_TOKEN)) {
    context.addIssue({ code: "custom", path: ["KYC_SCANNER_URL"], message: "Production KYC scanning requires a protected webhook URL and token" });
  }
  if (environment.NODE_ENV === "production" && environment.KYC_SCANNER_URL && !environment.KYC_SCANNER_URL.startsWith("https://")) {
    context.addIssue({ code: "custom", path: ["KYC_SCANNER_URL"], message: "Production KYC scanner URL must use HTTPS" });
  }
  if (environment.NODE_ENV === "production") {
    const origins = environment.CORS_ORIGINS.split(",").map((origin) => origin.trim());
    if (origins.some((origin) => origin === "*" || !origin.startsWith("https://"))) {
      context.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "Production CORS origins must be exact HTTPS origins" });
    }
    if (new Set(origins).size !== origins.length) {
      context.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "Production CORS origins must not contain duplicates" });
    }
    if (environment.ROUTING_API_URL.includes("router.project-osrm.org")) {
      context.addIssue({ code: "custom", path: ["ROUTING_API_URL"], message: "Production requires an approved routing service, not the public demo endpoint" });
    }
    if (environment.ROUTING_PROVIDER === "mapbox" && !environment.MAPBOX_ROUTING_TOKEN) {
      context.addIssue({ code: "custom", path: ["MAPBOX_ROUTING_TOKEN"], message: "MAPBOX_ROUTING_TOKEN is required when ROUTING_PROVIDER=mapbox" });
    }
    for (const [field, secret] of [["JWT_ACCESS_SECRET", environment.JWT_ACCESS_SECRET], ["JWT_REFRESH_SECRET", environment.JWT_REFRESH_SECRET], ["PAYMENT_WEBHOOK_SECRET", environment.PAYMENT_WEBHOOK_SECRET], ["MFA_ENCRYPTION_KEY", environment.MFA_ENCRYPTION_KEY ?? ""], ["RESEND_API_KEY", environment.RESEND_API_KEY ?? ""], ["ZOHO_SMTP_APP_PASSWORD", environment.ZOHO_SMTP_APP_PASSWORD ?? ""]] as const) {
      if (/replace|example|change|development|test-secret/i.test(secret)) {
        context.addIssue({ code: "custom", path: [field], message: `${field} contains a placeholder value` });
      }
    }
  }
});

export function parseEnvironment(environment: NodeJS.ProcessEnv) {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) throw new Error(`Invalid environment: ${parsed.error.message}`);
  return { ...parsed.data, corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((origin) => origin.trim()) };
}

const parsed = environmentSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment: ${parsed.error.message}`);
}

export const config = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((origin) => origin.trim())
};
