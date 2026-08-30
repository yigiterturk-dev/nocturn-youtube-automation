import { z } from "zod";

const schema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().url().optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  AUTH_REQUIRED: z.enum(["true", "false"]).transform((value) => value === "true").default("false"),
  YOUTUBE_API_KEY: z.string().min(16).optional(),
  YOUTUBE_REGION: z.string().length(2).default("US"),
  YOUTUBE_CATEGORY_ID: z.string().default("0"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  OPENAI_API_KEY: z.string().min(20).optional(),
  OPENAI_MODEL: z.string().default("gpt-5.6-sol"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
}
if (parsed.data.APP_ENV === "production") {
  const missing = [
    !parsed.data.DATABASE_URL && "DATABASE_URL",
    !parsed.data.SESSION_SECRET && "SESSION_SECRET",
    !parsed.data.AUTH_REQUIRED && "AUTH_REQUIRED=true",
  ].filter(Boolean);
  if (missing.length) throw new Error(`Missing production configuration: ${missing.join(", ")}`);
}

export const config = parsed.data;
