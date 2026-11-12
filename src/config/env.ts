import "dotenv/config";
import { z } from "zod";

const DEFAULT_SMS_TEMPLATE =
  "Your IGL Visa Help verification code is {code}. Valid for 5 minutes. Do not share it with anyone.";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters long"),
  FRONTEND_URL: z
    .string()
    .trim()
    .min(1, "FRONTEND_URL is required")
    .refine(
      (val) => {
        const origins = parseFrontendOrigins(val);
        return (
          origins.length > 0 &&
          origins.every((origin) => {
            try {
              const parsed = new URL(origin);
              return parsed.protocol === "http:" || parsed.protocol === "https:";
            } catch {
              return false;
            }
          })
        );
      },
      { message: "FRONTEND_URL must be a valid http(s) URL (or comma-separated URLs)" },
    ),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  FORM_DATA_PATH: z
    .string()
    .min(1)
    .default("./visa_100_countries_visit_visa_official_fields.json"),
  OTP_EXPIRY_MINUTES: z.coerce.number().int().positive().default(5),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  SMS_API_URL: z.string().trim().optional().default(""),
  SMS_API_KEY: z.string().trim().optional().default(""),
  SMS_SENDER_ID: z.string().trim().optional().default(""),
  SMS_API_FORMAT: z.preprocess(
    (val) =>
      typeof val === "string" && val.trim() === ""
        ? undefined
        : typeof val === "string"
          ? val.trim().toLowerCase()
          : val,
    z.enum(["query", "form", "json"]).default("query"),
  ),
  SMS_AUTH_HEADER: z
    .string()
    .trim()
    .optional()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  SMS_MESSAGE_TEMPLATE: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().trim().default(DEFAULT_SMS_TEMPLATE),
  ),
  ADMIN_EMAIL: z.string().email("ADMIN_EMAIL must be a valid email"),
  ADMIN_PASSWORD: z.string().min(8, "ADMIN_PASSWORD must be at least 8 characters"),
  ADMIN_NAME: z.string().min(1, "ADMIN_NAME is required"),
});

export function parseFrontendOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("FATAL: Invalid or missing environment variables:");
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "(root)";
      console.error(`  - ${path}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

export const env: Env = parseEnv();
