import { z } from "zod";
import { config } from "dotenv";
config({ override: true });

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(8000),

  // LLM — Chat provider
  LLM_PROVIDER: z.enum(["gemini", "openrouter", "ollama"]).default("gemini"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),

  // LLM — Embedding provider (always Gemini for showcase)
  EMBEDDING_PROVIDER: z.enum(["gemini"]).default("gemini"),
  GEMINI_EMBEDDING_MODEL: z.string().default("text-embedding-004"),

  // Fallback
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("meta-llama/llama-3.1-8b-instruct:free"),

  // Auth
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRE_MINUTES: z.coerce.number().default(60),
  JWT_REFRESH_EXPIRE_DAYS: z.coerce.number().default(7),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  COOKIE_SAMESITE: z.enum(["None", "Lax", "Strict"]).default("None"),

  // Database
  DATABASE_PATH: z.string().default("./data/chatbot.db"),

  // CORS — supports comma-separated URLs for multiple origins
  FRONTEND_URL: z.string().default("http://localhost:3000"),

  // Allow Vercel preview deployment URLs (*.vercel.app)
  ALLOW_VERCEL_PREVIEWS: z.coerce.boolean().default(false),

  // Storage
  STORAGE_TYPE: z.enum(["local", "r2"]).default("local"),
  UPLOAD_DIR: z.string().default("./data/uploads"),
  UPLOAD_MAX_SIZE_MB: z.coerce.number().default(25),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY: z.string().optional(),
  R2_SECRET_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),

  // Rate limiting
  RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().default(10),
  RATE_LIMIT_CHAT_PER_MINUTE: z.coerce.number().default(30),
  RATE_LIMIT_CONVERSATION_PER_MINUTE: z.coerce.number().default(60),
  RATE_LIMIT_UPLOAD_PER_HOUR: z.coerce.number().default(20),

  // DevBot mode (optional — app works without these in normal chat mode)
  ANTHROPIC_API_KEY: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(), // 32-byte hex key for encrypting GitHub tokens
  GITHUB_TOKEN: z.string().optional(),   // Fallback PAT for V1 single-user
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(), // Firebase SA JSON or path
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:");
    console.error(JSON.stringify(result.error.flatten().fieldErrors, null, 2));
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
