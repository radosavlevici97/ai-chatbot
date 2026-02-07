# Phase S1 — Foundation & Skeleton

> **Timeline:** Week 1 | **Goal:** End-to-end login → chat → streamed Gemini response
> **Depends on:** Nothing (first phase)
> **Delivers to:** Phase S2

---

## 1. Objectives

| # | Objective | Acceptance Criteria |
|---|-----------|-------------------|
| 1 | Monorepo scaffold | pnpm workspace boots, shared types compile |
| 2 | Backend scaffold | Hono server boots on :8000, healthcheck returns 200 |
| 3 | Database layer | Drizzle ORM models created, initial migration applied to SQLite |
| 4 | Auth system | Register, login, JWT via httpOnly cookies |
| 5 | Chat endpoint | POST with SSE streaming returns Gemini tokens |
| 6 | Frontend scaffold | Next.js 15 boots with shadcn/ui, Tailwind 4 configured |
| 7 | Auth UI | Login + register pages functional |
| 8 | Chat UI | Basic chat page sends message, renders streamed response |
| 9 | E2E integration | Login → send message → see streamed response works |

---

## 2. Architecture Decision: Full-Stack TypeScript

### Why TypeScript Everywhere

| Concern | Decision | Rationale |
|---------|----------|-----------|
| Backend runtime | **Node.js 22 LTS + Hono** | Lightweight, Web Standards API, runs on edge/node/bun |
| ORM | **Drizzle ORM** | Type-safe SQL, zero overhead, excellent DX |
| Validation | **Zod** (shared) | Same schemas validate frontend forms + backend requests |
| Package manager | **pnpm** workspaces | Single lockfile, fast installs, monorepo-native |
| Type sharing | `packages/shared` workspace | Types, schemas, constants shared across frontend/backend |

### Why Hono over Express/Fastify

- **Web Standard Request/Response** — same API as Cloudflare Workers, Deno, Bun
- **Tiny footprint** — 14kb, zero dependencies
- **Built-in middleware** — CORS, JWT, logger, streaming, rate-limiter
- **First-class TypeScript** — generics on routes, typed context
- **SSE helper** — `streamSSE()` built in, no extra libraries
- **OpenAPI integration** — `@hono/zod-openapi` generates specs from routes
- **2026 standard** — adopted by Vercel, Cloudflare, AWS Lambda

---

## 3. Monorepo Structure

```
ai-chatbot/
├── package.json                    # Workspace root
├── pnpm-workspace.yaml             # Workspace config
├── turbo.json                      # Turborepo pipeline config
├── tsconfig.base.json              # Shared TS config (with paths)
├── .env.example                    # Environment template
├── .gitignore
├── eslint.config.mjs               # Flat config ESLint
├── prettier.config.mjs             # Shared Prettier config
│
├── packages/
│   └── shared/                     # Shared types, schemas, constants
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts            # Barrel export
│           ├── schemas/
│           │   ├── auth.ts         # Zod: RegisterInput, LoginInput
│           │   ├── chat.ts         # Zod: SendMessageInput, SSEEvent
│           │   ├── conversation.ts # Zod: ConversationCreate, ConversationResponse
│           │   └── common.ts       # Zod: Pagination, ErrorResponse
│           ├── types/
│           │   ├── auth.ts         # TokenPair, UserProfile
│           │   ├── chat.ts         # Message, StreamChunk
│           │   ├── conversation.ts # Conversation
│           │   └── api.ts          # ApiResponse<T>, ApiError, PaginatedResponse<T>
│           └── constants/
│               ├── models.ts       # Available LLM models
│               └── limits.ts       # Upload sizes, message lengths, rate limits
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── drizzle.config.ts           # Drizzle Kit config
│   ├── drizzle/
│   │   └── migrations/             # Auto-generated SQL migrations
│   └── src/
│       ├── index.ts                # Entry point — create server, listen
│       ├── app.ts                  # Hono app factory (with OpenAPI)
│       ├── env.ts                  # Type-safe env parsing (Zod)
│       ├── middleware/
│       │   ├── auth.ts             # Cookie-based JWT verification
│       │   ├── rate-limiter.ts     # Per-IP and per-user rate limiting
│       │   ├── error-handler.ts    # Global error → JSON response
│       │   └── logger.ts           # Structured JSON logging with requestId
│       ├── routes/
│       │   ├── index.ts            # Route aggregator
│       │   ├── auth.routes.ts      # POST /register, /login, /refresh, /logout
│       │   ├── chat.routes.ts      # POST /conversations/:id/messages (SSE)
│       │   └── health.routes.ts    # GET /health, GET /ready
│       ├── db/
│       │   ├── index.ts            # Database client (better-sqlite3 + drizzle)
│       │   ├── schema.ts           # All Drizzle table definitions
│       │   └── migrate.ts          # Run migrations on startup
│       ├── services/
│       │   ├── auth.service.ts     # Register, login, cookie management
│       │   ├── conversation.service.ts  # Basic CRUD (expanded in S2)
│       │   └── llm/
│       │       ├── base.ts         # LLMProvider + EmbeddingProvider interfaces
│       │       ├── gemini.ts       # GeminiProvider + GeminiEmbedder
│       │       ├── openrouter.ts   # OpenRouterProvider (stub for S1)
│       │       └── factory.ts      # getProvider() + getEmbedder() factories
│       ├── lib/
│       │   ├── jwt.ts              # Sign/verify JWT, cookie helpers
│       │   ├── password.ts         # bcrypt hash/verify + zxcvbn strength
│       │   ├── errors.ts           # AppError hierarchy
│       │   └── storage.ts          # File storage abstraction (local/R2)
│       └── tests/
│           ├── setup.ts            # Test database setup/teardown
│           ├── auth.test.ts        # Auth endpoint tests
│           └── chat.test.ts        # SSE streaming tests
│
└── frontend/
    ├── package.json
    ├── next.config.ts
    ├── tsconfig.json                # Extends base, includes paths
    ├── postcss.config.mjs
    ├── components.json              # shadcn/ui config
    ├── Dockerfile
    ├── public/
    │   └── favicon.ico
    └── src/
        ├── app/
        │   ├── layout.tsx           # Root layout (providers, fonts)
        │   ├── page.tsx             # Redirect → /chat or /login
        │   ├── (auth)/
        │   │   ├── layout.tsx       # Auth layout (centered card)
        │   │   ├── login/page.tsx
        │   │   └── register/page.tsx
        │   └── (chat)/
        │       ├── layout.tsx       # Chat layout (sidebar + main)
        │       └── page.tsx         # Default new-conversation page
        ├── components/
        │   ├── ui/                  # shadcn/ui primitives
        │   ├── chat/
        │   │   ├── chat-input.tsx
        │   │   ├── chat-message.tsx
        │   │   └── chat-view.tsx
        │   ├── auth/
        │   │   ├── login-form.tsx
        │   │   └── register-form.tsx
        │   └── providers/
        │       ├── query-provider.tsx  # TanStack Query provider
        │       ├── auth-provider.tsx   # Auth context (cached user profile)
        │       └── theme-provider.tsx
        ├── lib/
        │   ├── api-client.ts        # Typed fetch wrapper (cookie-based)
        │   ├── sse-client.ts        # SSE stream parser
        │   └── utils.ts             # cn() helper
        ├── stores/
        │   └── ui-store.ts          # UI-only state (sidebar open, theme)
        ├── hooks/
        │   ├── use-auth.ts          # Auth hook (TanStack Query)
        │   └── use-chat.ts          # Chat hook (streaming state only)
        └── types/
            └── index.ts             # Re-export from @chatbot/shared
```

---

## 4. Workspace Configuration

### 4.1 Root `package.json`

```json
{
  "name": "ai-chatbot",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "test": "turbo test",
    "format": "prettier --write \"**/*.{ts,tsx,json,md}\"",
    "db:generate": "pnpm --filter @chatbot/backend drizzle-kit generate",
    "db:migrate": "pnpm --filter @chatbot/backend drizzle-kit migrate",
    "db:studio": "pnpm --filter @chatbot/backend drizzle-kit studio"
  },
  "devDependencies": {
    "turbo": "^2.4.0",
    "prettier": "^3.4.0",
    "eslint": "^9.17.0",
    "typescript": "^5.7.0"
  },
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=22.0.0"
  }
}
```

### 4.2 `pnpm-workspace.yaml`

```yaml
packages:
  - "packages/*"
  - "frontend"
  - "backend"
```

### 4.3 `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": {
      "persistent": true,
      "cache": false
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

### 4.4 `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2024"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### 4.5 Frontend `tsconfig.json`

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["DOM", "DOM.Iterable", "ES2024"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "noEmit": true,
    "paths": {
      "@/*": ["./src/*"],
      "@chatbot/shared": ["../packages/shared/src"]
    },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

### 4.6 Backend `tsconfig.json`

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": {
      "@/*": ["./src/*"],
      "@chatbot/shared": ["../packages/shared/src"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

---

## 5. Shared Package — `packages/shared`

### 5.1 Auth Schemas — `src/schemas/auth.ts`

```typescript
import { z } from "zod";

// Password strength checker (lightweight alternative to zxcvbn)
function hasMinStrength(password: string): boolean {
  let score = 0;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  if (password.length >= 12) score++;
  return score >= 3;
}

export const registerInputSchema = z.object({
  email: z.string().email("Invalid email address"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, hyphens, underscores"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .refine(hasMinStrength, {
      message: "Password must include at least 3 of: lowercase, uppercase, number, special character, or 12+ characters",
    }),
});

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
```

### 5.2 Chat Schemas — `src/schemas/chat.ts`

```typescript
import { z } from "zod";

export const sendMessageInputSchema = z.object({
  content: z.string().min(1).max(32_000),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(1).max(32_000).default(4096),
});

export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;
```

### 5.3 Common Schemas — `src/schemas/common.ts`

```typescript
import { z } from "zod";

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
```

### 5.4 Shared Types — `src/types/`

```typescript
// types/auth.ts
export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  tokenType: "bearer";
  expiresIn: number;
};

export type AuthResponse = {
  user: UserProfile;
};

export type UserProfile = {
  id: string;
  email: string;
  username: string;
  role: string;
  createdAt: string;
};

// types/chat.ts
export type MessageRole = "user" | "assistant" | "system";

export type Message = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  model?: string;
  tokensPrompt?: number;
  tokensCompletion?: number;
  attachments?: string;
  citations?: string;
  createdAt: string;
};

export type StreamChunk =
  | { event: "token"; content: string }
  | { event: "done"; finishReason: string; usage?: { promptTokens?: number; completionTokens?: number } }
  | { event: "error"; error: string; code?: string }
  | { event: "title"; title: string }
  | { event: "citation"; source: string; page: number; relevance: number }
  | { event: "info"; message: string };

// types/api.ts
export type ApiResponse<T> = {
  data: T;
};

export type ApiError = {
  error: string;
  code: string;
  detail?: Record<string, string[]> | string;
  requestId?: string;
};

export type PaginatedResponse<T> = {
  data: T[];
  nextCursor: string | null;
  total?: number;
};
```

**Design Rationale:**
- Zod schemas serve double duty — backend validation + frontend form validation
- Discriminated union for `StreamChunk` gives exhaustive type checking on `event`
- All SSE event types defined upfront — prevents drift across phases
- `ApiError` always includes `code` and `requestId` for debuggability
- `PaginatedResponse` uses cursor-based pagination (not offset) — scales to large datasets
- Password strength via `refine()` — validates in Zod pipeline, no separate check needed

---

## 6. Backend Architecture

### 6.1 Dependencies — `backend/package.json`

```json
{
  "name": "@chatbot/backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc && tsc-alias",
    "start": "node dist/index.js",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@chatbot/shared": "workspace:*",

    "hono": "^4.7.0",
    "@hono/node-server": "^1.14.0",
    "@hono/zod-validator": "^0.5.0",
    "@hono/zod-openapi": "^0.18.0",

    "drizzle-orm": "^0.38.0",
    "better-sqlite3": "^11.7.0",

    "@google/genai": "^1.0.0",

    "jose": "^6.0.0",
    "bcryptjs": "^2.4.3",
    "zod": "^3.24.0",
    "nanoid": "^5.0.0",
    "dotenv": "^16.4.0",
    "pino": "^9.6.0",
    "pino-pretty": "^13.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/bcryptjs": "^2.4.0",
    "drizzle-kit": "^0.30.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "typescript": "^5.7.0"
  }
}
```

### 6.2 Environment Config — `src/env.ts`

```typescript
import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(8000),

  // LLM — Chat provider
  LLM_PROVIDER: z.enum(["gemini", "openrouter", "ollama"]).default("gemini"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),

  // LLM — Embedding provider (always Gemini for showcase, even if chat falls back)
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
  COOKIE_SECURE: z.coerce.boolean().default(true),

  // Database
  DATABASE_PATH: z.string().default("./data/chatbot.db"),

  // CORS
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),

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
  RATE_LIMIT_UPLOAD_PER_HOUR: z.coerce.number().default(20),
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
```

**Design Rationale:**
- `EMBEDDING_PROVIDER` separated from `LLM_PROVIDER` — embeddings always use Gemini even when chat falls back to OpenRouter
- `COOKIE_SECURE` defaults to true — must explicitly disable for local dev
- `STORAGE_TYPE` enum — swap between local disk and Cloudflare R2 via env
- Rate limit values configurable per environment — tighter in production
- Structured JSON error on startup — Railway logs parse it correctly

### 6.3 Database Schema — `src/db/schema.ts`

```typescript
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ──────────────────────────────────────────────
// Users
// ──────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ──────────────────────────────────────────────
// Conversations
// ──────────────────────────────────────────────
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  model: text("model").notNull(),
  systemPrompt: text("system_prompt"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("conversations_user_updated_idx").on(table.userId, table.updatedAt),
]);

// ──────────────────────────────────────────────
// Messages
// ──────────────────────────────────────────────
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  model: text("model"),
  tokensPrompt: integer("tokens_prompt"),
  tokensCompletion: integer("tokens_completion"),
  attachments: text("attachments"),   // JSON: [{type, storagePath, mimeType}]
  citations: text("citations"),       // JSON: [{source, page, relevance}]
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("messages_conversation_idx").on(table.conversationId),
]);
```

**Design Rationale:**
- Indexes defined inline with table (Drizzle v0.38+ syntax)
- `conversations_user_updated_idx` — composite index for sidebar listing (WHERE userId = ? ORDER BY updatedAt DESC)
- `messages_conversation_idx` — simple index on FK for fast conversation loading
- `attachments` and `citations` as JSON text columns — avoids separate join tables for showcase
- Drizzle `sqliteTable` swaps to `pgTable` for production — same column definitions

### 6.4 Database Client — `src/db/index.ts`

```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { env } from "../env.js";
import * as schema from "./schema.js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Ensure data directory exists
mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });

const sqlite = new Database(env.DATABASE_PATH);

// Performance pragmas for SQLite
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("cache_size = -64000");     // 64MB page cache
sqlite.pragma("temp_store = MEMORY");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
```

### 6.5 Structured Logger — `src/middleware/logger.ts`

```typescript
import pino from "pino";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../app.js";
import { env } from "../env.js";

export const log = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
  redact: ["req.headers.cookie", "req.headers.authorization"],
});

export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  log.info({
    requestId: c.get("requestId"),
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration,
  });
});
```

**Design Rationale:**
- `pino` — fastest Node.js logger, structured JSON by default
- `pino-pretty` in dev only — human-readable colorized output
- `redact` — automatically masks cookies and auth headers in logs
- `requestId` threaded through every log entry — correlate requests in Railway logs

### 6.6 Rate Limiting — `src/middleware/rate-limiter.ts`

```typescript
import { createMiddleware } from "hono/factory";
import { AppError } from "../lib/errors.js";
import type { AppEnv } from "../app.js";

type RateLimitConfig = {
  windowMs: number;
  max: number;
  keyFn: (c: any) => string;
  message?: string;
};

const stores = new Map<string, Map<string, { count: number; resetAt: number }>>();

export function rateLimit(name: string, config: RateLimitConfig) {
  if (!stores.has(name)) stores.set(name, new Map());
  const store = stores.get(name)!;

  return createMiddleware<AppEnv>(async (c, next) => {
    const key = config.keyFn(c);
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + config.windowMs };
      store.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    c.header("X-RateLimit-Limit", String(config.max));
    c.header("X-RateLimit-Remaining", String(Math.max(0, config.max - entry.count)));
    c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > config.max) {
      throw new AppError(
        429,
        "RATE_LIMITED",
        config.message ?? "Too many requests. Please try again later.",
      );
    }

    await next();
  });
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const store of stores.values()) {
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }
}, 5 * 60 * 1000);
```

**Usage in routes:**

```typescript
import { rateLimit } from "../middleware/rate-limiter.js";
import { env } from "../env.js";

// Auth: 10 requests per minute per IP
const authLimiter = rateLimit("auth", {
  windowMs: 60_000,
  max: env.RATE_LIMIT_AUTH_PER_MINUTE,
  keyFn: (c) => c.req.header("x-forwarded-for") ?? "unknown",
  message: "Too many login attempts. Please wait a minute.",
});

// Chat: 30 messages per minute per user
const chatLimiter = rateLimit("chat", {
  windowMs: 60_000,
  max: env.RATE_LIMIT_CHAT_PER_MINUTE,
  keyFn: (c) => c.get("userId"),
});
```

**Design Rationale:**
- In-memory store — sufficient for single-process showcase
- Per-route rate limits — auth is stricter than chat
- Standard `X-RateLimit-*` headers — frontend can display "slow down" warnings
- Configurable via env vars — can tighten for production
- Auto-cleanup prevents memory leaks

### 6.7 Hono App Factory — `src/app.ts`

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { env } from "./env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/logger.js";
import { routes } from "./routes/index.js";

export type AppEnv = {
  Variables: {
    userId: string;
    requestId: string;
  };
};

export function createApp() {
  const app = new Hono<AppEnv>();

  // Global middleware (order matters — outermost first)
  app.use("*", requestId());
  app.use("*", requestLogger);
  app.use(
    "*",
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,  // Required for httpOnly cookies
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      // Note: No "Authorization" header needed — using cookies
    }),
  );

  // Error handling
  app.onError(errorHandler);

  // API routes
  app.route("/api/v1", routes);

  return app;
}
```

**Design Rationale:**
- `credentials: true` enables cross-origin cookie sending
- `Authorization` removed from `allowHeaders` — cookies handle auth, no header needed
- `requestId` set first — available to all downstream middleware and routes

### 6.8 Error Handling — `src/lib/errors.ts`

```typescript
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthError extends AppError {
  constructor(message = "Authentication failed") {
    super(401, "AUTH_ERROR", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(404, "NOT_FOUND", `${resource} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource conflict") {
    super(409, "CONFLICT", message);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Rate limit exceeded") {
    super(429, "RATE_LIMITED", message);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed") {
    super(422, "VALIDATION_ERROR", message);
  }
}
```

### Error Handler Middleware — `src/middleware/error-handler.ts`

```typescript
import type { ErrorHandler } from "hono";
import { AppError } from "../lib/errors.js";
import { ZodError } from "zod";
import { log } from "./logger.js";
import type { AppEnv } from "../app.js";

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get("requestId");

  // Known application errors
  if (err instanceof AppError) {
    return c.json(
      { error: err.message, code: err.code, requestId },
      err.statusCode as 400,
    );
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    return c.json(
      {
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        detail: err.flatten().fieldErrors,
        requestId,
      },
      422,
    );
  }

  // Unknown errors — log full detail, return generic message
  log.error({ requestId, err: err.message, stack: err.stack }, "Unhandled error");
  return c.json(
    { error: "Internal server error", code: "INTERNAL_ERROR", requestId },
    500,
  );
};
```

**Design Rationale:**
- Every error response includes `requestId` — user can report it, engineers can trace it
- Consistent shape: `{ error, code, requestId, detail? }` on every error
- Unknown errors logged with stack trace but never leaked to client
- `RateLimitError` added to hierarchy — used by rate limiter middleware

### 6.9 JWT + Cookie Utilities — `src/lib/jwt.ts`

```typescript
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Context } from "hono";
import { env } from "../env.js";
import { AuthError } from "./errors.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);

type TokenType = "access" | "refresh";

interface CustomPayload extends JWTPayload {
  sub: string;
  type: TokenType;
}

export async function signToken(userId: string, type: TokenType): Promise<string> {
  const expiresIn =
    type === "access"
      ? `${env.JWT_ACCESS_EXPIRE_MINUTES}m`
      : `${env.JWT_REFRESH_EXPIRE_DAYS}d`;

  return new SignJWT({ type })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifyToken(token: string, expectedType: TokenType): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, secret) as { payload: CustomPayload };

    if (payload.type !== expectedType) {
      throw new AuthError("Invalid token type");
    }
    if (!payload.sub) {
      throw new AuthError("Invalid token payload");
    }

    return payload.sub;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError("Token expired or invalid");
  }
}

export async function createTokenPair(userId: string) {
  const [accessToken, refreshToken] = await Promise.all([
    signToken(userId, "access"),
    signToken(userId, "refresh"),
  ]);
  return { accessToken, refreshToken };
}

// ── Cookie Helpers ──────────────────────────────

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: "Strict" as const,
  path: "/",
  domain: env.COOKIE_DOMAIN,
};

export function setAuthCookies(c: Context, accessToken: string, refreshToken: string) {
  c.header("Set-Cookie", [
    `access_token=${accessToken}; Max-Age=${env.JWT_ACCESS_EXPIRE_MINUTES * 60}; HttpOnly; ${env.COOKIE_SECURE ? "Secure; " : ""}SameSite=Strict; Path=/api`,
    `refresh_token=${refreshToken}; Max-Age=${env.JWT_REFRESH_EXPIRE_DAYS * 86400}; HttpOnly; ${env.COOKIE_SECURE ? "Secure; " : ""}SameSite=Strict; Path=/api/v1/auth/refresh`,
  ].join(", "));
}

export function clearAuthCookies(c: Context) {
  c.header("Set-Cookie", [
    "access_token=; Max-Age=0; HttpOnly; Path=/api",
    "refresh_token=; Max-Age=0; HttpOnly; Path=/api/v1/auth/refresh",
  ].join(", "));
}

export function getAccessTokenFromCookie(c: Context): string | null {
  const cookies = c.req.header("cookie") ?? "";
  const match = cookies.match(/access_token=([^;]+)/);
  return match?.[1] ?? null;
}

export function getRefreshTokenFromCookie(c: Context): string | null {
  const cookies = c.req.header("cookie") ?? "";
  const match = cookies.match(/refresh_token=([^;]+)/);
  return match?.[1] ?? null;
}
```

**Design Rationale:**
- **httpOnly cookies** — JavaScript cannot read tokens, eliminates XSS token theft
- **SameSite=Strict** — prevents CSRF (cookie only sent on same-origin requests)
- **Separate paths** — access token scoped to `/api`, refresh token only to `/api/v1/auth/refresh`
- **Secure flag** — configurable for local dev (localhost doesn't use HTTPS)
- `Set-Cookie` with multiple values — sets both cookies in one response
- No `Authorization` header needed anywhere — cookies sent automatically by browser

### 6.10 Password Utilities — `src/lib/password.ts`

```typescript
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

### 6.11 Auth Service — `src/services/auth.service.ts`

```typescript
import { eq, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { createTokenPair, setAuthCookies } from "../lib/jwt.js";
import { AuthError, ConflictError } from "../lib/errors.js";
import { log } from "../middleware/logger.js";
import type { Context } from "hono";
import type { RegisterInput, LoginInput, UserProfile } from "@chatbot/shared";

export async function register(
  input: RegisterInput,
  c: Context,
  requestId: string,
): Promise<UserProfile> {
  // Check uniqueness — generic error to prevent enumeration
  const existing = db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.email, input.email), eq(users.username, input.username)))
    .get();

  if (existing) {
    // Log the specific reason for debugging, but return generic error
    log.warn({ requestId, email: input.email }, "Registration conflict");
    throw new ConflictError("Unable to create account. Please try different credentials.");
  }

  const id = nanoid();
  const passwordHash = await hashPassword(input.password);

  db.insert(users).values({
    id,
    email: input.email,
    username: input.username,
    passwordHash,
  }).run();

  const tokens = await createTokenPair(id);
  setAuthCookies(c, tokens.accessToken, tokens.refreshToken);

  log.info({ requestId, userId: id }, "User registered");

  return { id, email: input.email, username: input.username, role: "user", createdAt: new Date().toISOString() };
}

export async function login(
  input: LoginInput,
  c: Context,
  requestId: string,
): Promise<UserProfile> {
  const user = db.select().from(users).where(eq(users.email, input.email)).get();

  if (!user) {
    throw new AuthError("Invalid credentials");
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new AuthError("Invalid credentials");
  }

  if (!user.isActive) {
    throw new AuthError("Account deactivated");
  }

  // Update last login
  db.update(users)
    .set({ lastLoginAt: new Date().toISOString() })
    .where(eq(users.id, user.id))
    .run();

  const tokens = await createTokenPair(user.id);
  setAuthCookies(c, tokens.accessToken, tokens.refreshToken);

  log.info({ requestId, userId: user.id }, "User logged in");

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
  };
}
```

**Design Rationale:**
- `setAuthCookies()` called inside service — cookies set on the response automatically
- Returns `UserProfile` (no tokens in JSON body) — tokens are in httpOnly cookies only
- Registration error is generic: `"Unable to create account"` — doesn't reveal if email exists
- Specific conflict reason logged server-side with `requestId` for debugging
- Same error message for wrong email AND wrong password — prevents user enumeration

### 6.12 Auth Middleware — `src/middleware/auth.ts`

```typescript
import { createMiddleware } from "hono/factory";
import { verifyToken, getAccessTokenFromCookie } from "../lib/jwt.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { AuthError } from "../lib/errors.js";
import type { AppEnv } from "../app.js";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getAccessTokenFromCookie(c);
  if (!token) {
    throw new AuthError("Authentication required");
  }

  const userId = await verifyToken(token, "access");

  const user = db.select({ id: users.id, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!user || !user.isActive) {
    throw new AuthError("User not found or deactivated");
  }

  c.set("userId", userId);
  await next();
});
```

### 6.13 Auth Routes — `src/routes/auth.routes.ts`

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { registerInputSchema, loginInputSchema } from "@chatbot/shared";
import { register, login } from "../services/auth.service.js";
import { verifyToken, createTokenPair, setAuthCookies, clearAuthCookies, getRefreshTokenFromCookie } from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limiter.js";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../app.js";

const auth = new Hono<AppEnv>();

// Rate limit auth endpoints: 10/min per IP
const authLimiter = rateLimit("auth", {
  windowMs: 60_000,
  max: env.RATE_LIMIT_AUTH_PER_MINUTE,
  keyFn: (c) => c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown",
  message: "Too many attempts. Please wait a minute.",
});

auth.post("/register", authLimiter, zValidator("json", registerInputSchema), async (c) => {
  const input = c.req.valid("json");
  const requestId = c.get("requestId");
  const user = await register(input, c, requestId);
  return c.json({ data: { user } }, 201);
});

auth.post("/login", authLimiter, zValidator("json", loginInputSchema), async (c) => {
  const input = c.req.valid("json");
  const requestId = c.get("requestId");
  const user = await login(input, c, requestId);
  return c.json({ data: { user } });
});

auth.post("/refresh", async (c) => {
  const refreshToken = getRefreshTokenFromCookie(c);
  if (!refreshToken) throw new AuthError("No refresh token");

  const userId = await verifyToken(refreshToken, "refresh");
  const tokens = await createTokenPair(userId);
  setAuthCookies(c, tokens.accessToken, tokens.refreshToken);

  return c.json({ data: { refreshed: true } });
});

auth.post("/logout", (c) => {
  clearAuthCookies(c);
  return c.json({ data: { loggedOut: true } });
});

auth.get("/me", requireAuth, (c) => {
  const userId = c.get("userId");
  const user = db.select({
    id: users.id,
    email: users.email,
    username: users.username,
    role: users.role,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.id, userId)).get();

  return c.json({ data: { user } });
});

export { auth };
```

**Design Rationale:**
- `authLimiter` applied to register AND login — prevents brute force
- `POST /logout` clears cookies — explicit logout instead of relying on expiration
- `GET /me` returns cached user profile — frontend calls on mount to verify session
- Refresh token read from cookie (not JSON body) — stays httpOnly
- Login/register return `{ user }` without tokens — tokens are in Set-Cookie header

### 6.14 LLM Provider Abstraction — `src/services/llm/`

#### Interfaces — `base.ts`

```typescript
import type { StreamChunk } from "@chatbot/shared";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  images?: { data: Buffer; mimeType: string }[];
}

// Chat provider — handles text/multimodal generation
export interface LLMProvider {
  streamChat(
    messages: ChatMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): AsyncGenerator<StreamChunk>;

  healthCheck(): Promise<boolean>;
}

// Embedding provider — separated from chat to allow independent fallback
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[], concurrency?: number): Promise<number[][]>;
}
```

#### Gemini Provider — `gemini.ts`

```typescript
import { GoogleGenAI } from "@google/genai";
import type { LLMProvider, ChatMessage, EmbeddingProvider } from "./base.js";
import type { StreamChunk } from "@chatbot/shared";

export class GeminiChatProvider implements LLMProvider {
  private client: GoogleGenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = "gemini-2.5-flash") {
    this.client = new GoogleGenAI({ apiKey });
    this.defaultModel = defaultModel;
  }

  async *streamChat(
    messages: ChatMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): AsyncGenerator<StreamChunk> {
    const model = options?.model ?? this.defaultModel;

    let systemInstruction: string | undefined;
    const contents = messages.flatMap((msg) => {
      if (msg.role === "system") {
        systemInstruction = msg.content;
        return [];
      }

      const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
      if (msg.content) parts.push({ text: msg.content });
      if (msg.images) {
        for (const img of msg.images) {
          parts.push({ inlineData: { data: img.data.toString("base64"), mimeType: img.mimeType } });
        }
      }

      return [{ role: msg.role === "user" ? "user" : "model", parts }];
    });

    try {
      const stream = await this.client.models.generateContentStream({
        model,
        contents,
        config: {
          temperature: options?.temperature ?? 0.7,
          maxOutputTokens: options?.maxTokens ?? 4096,
          systemInstruction,
        },
      });

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) yield { event: "token", content: text };
      }

      yield { event: "done", finishReason: "stop", usage: { promptTokens: 0, completionTokens: 0 } };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const code = message.includes("429") || message.includes("RESOURCE_EXHAUSTED")
        ? "RATE_LIMITED"
        : "LLM_ERROR";
      yield { event: "error", error: message, code };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.models.get({ model: this.defaultModel });
      return true;
    } catch {
      return false;
    }
  }
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private client: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model = "text-embedding-004") {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.client.models.embedContent({
      model: this.model,
      contents: text,
    });
    return result.embeddings?.[0]?.values ?? [];
  }

  async embedBatch(texts: string[], concurrency = 5): Promise<number[][]> {
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += concurrency) {
      const batch = texts.slice(i, i + concurrency);
      const embeddings = await Promise.all(batch.map((t) => this.embed(t)));
      results.push(...embeddings);
    }
    return results;
  }
}
```

#### Factory — `factory.ts`

```typescript
import type { LLMProvider, EmbeddingProvider } from "./base.js";
import { GeminiChatProvider, GeminiEmbeddingProvider } from "./gemini.js";
import { env } from "../../env.js";

let chatProvider: LLMProvider | null = null;
let embeddingProvider: EmbeddingProvider | null = null;
let fallbackChatProvider: LLMProvider | null = null;

export function getChatProvider(): LLMProvider {
  if (chatProvider) return chatProvider;

  switch (env.LLM_PROVIDER) {
    case "gemini":
      chatProvider = new GeminiChatProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL);
      break;
    case "openrouter":
      throw new Error("OpenRouter provider not yet implemented");
    case "ollama":
      throw new Error("Ollama provider not yet implemented");
  }

  return chatProvider;
}

// Embedding provider is ALWAYS Gemini — independent of chat provider
export function getEmbeddingProvider(): EmbeddingProvider {
  if (embeddingProvider) return embeddingProvider;
  embeddingProvider = new GeminiEmbeddingProvider(env.GEMINI_API_KEY, env.GEMINI_EMBEDDING_MODEL);
  return embeddingProvider;
}

// Fallback chat provider (OpenRouter) — used when primary hits rate limit
export function getFallbackChatProvider(): LLMProvider | null {
  if (!env.OPENROUTER_API_KEY) return null;
  if (fallbackChatProvider) return fallbackChatProvider;
  // Implemented in S5
  return null;
}
```

**Design Rationale:**
- `LLMProvider` and `EmbeddingProvider` are **separate interfaces** — chat can fall back to OpenRouter while embeddings always use Gemini
- `embedBatch()` with configurable concurrency — prevents 100 parallel API calls from hitting rate limits
- Error `code` field in StreamChunk — frontend can distinguish rate limit from other errors
- `getFallbackChatProvider()` returns null until S5 implements OpenRouter — no dead code

### 6.15 Chat Route with SSE — `src/routes/chat.routes.ts`

```typescript
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { sendMessageInputSchema } from "@chatbot/shared";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limiter.js";
import { getChatProvider } from "../services/llm/factory.js";
import { env } from "../env.js";
import type { AppEnv } from "../app.js";

const chat = new Hono<AppEnv>();

const chatLimiter = rateLimit("chat", {
  windowMs: 60_000,
  max: env.RATE_LIMIT_CHAT_PER_MINUTE,
  keyFn: (c) => c.get("userId"),
});

chat.post(
  "/conversations/:conversationId/messages",
  requireAuth,
  chatLimiter,
  zValidator("json", sendMessageInputSchema),
  async (c) => {
    const { conversationId } = c.req.param();
    const input = c.req.valid("json");
    const userId = c.get("userId");
    const requestId = c.get("requestId");
    const llm = getChatProvider();

    // Build message list (simplified for S1 — expanded with history in S2)
    const messages = [{ role: "user" as const, content: input.content }];

    return streamSSE(c, async (stream) => {
      let fullResponse = "";

      for await (const chunk of llm.streamChat(messages, {
        model: input.model,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      })) {
        switch (chunk.event) {
          case "token":
            fullResponse += chunk.content;
            await stream.writeSSE({
              event: "token",
              data: JSON.stringify({ content: chunk.content, finishReason: null }),
            });
            break;
          case "done":
            await stream.writeSSE({
              event: "done",
              data: JSON.stringify({ finishReason: chunk.finishReason, usage: chunk.usage }),
            });
            break;
          case "error":
            await stream.writeSSE({
              event: "error",
              data: JSON.stringify({ error: chunk.error, code: chunk.code }),
            });
            break;
        }
      }

      // TODO (S2): Persist user message + assistant response to DB inside transaction
    });
  },
);

export { chat };
```

### 6.16 Health & Server Entry

(Same as previous version — no changes needed.)

---

## 7. Frontend Architecture

### 7.1 Dependencies — `frontend/package.json`

```json
{
  "name": "@chatbot/frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint && tsc --noEmit",
    "test": "vitest",
    "test:coverage": "vitest --coverage"
  },
  "dependencies": {
    "@chatbot/shared": "workspace:*",

    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",

    "zustand": "^5.0.0",
    "@tanstack/react-query": "^5.62.0",
    "next-themes": "^0.4.4",
    "zod": "^3.24.0",

    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0",
    "lucide-react": "^0.469.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0",
    "@testing-library/react": "^16.1.0",
    "eslint": "^9.17.0",
    "eslint-config-next": "^15.1.0"
  }
}
```

### 7.2 API Client — Cookie-Based — `src/lib/api-client.ts`

```typescript
import type { ApiError as ApiErrorType, ApiResponse } from "@chatbot/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isNetworkError() {
    return this.code === "NETWORK_ERROR";
  }

  get isAuthError() {
    return this.status === 401;
  }

  get isRateLimited() {
    return this.status === 429;
  }
}

async function request<T>(endpoint: string, init?: RequestInit): Promise<T> {
  let res: Response;

  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      ...init,
      credentials: "include", // Send httpOnly cookies automatically
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch (err) {
    // Network error (offline, DNS failure, CORS block)
    throw new ApiError(0, "NETWORK_ERROR", "Unable to connect to the server. Check your connection.");
  }

  if (!res.ok) {
    const body: ApiErrorType = await res.json().catch(() => ({
      error: "Unknown error",
      code: "UNKNOWN",
    }));

    // Auto-refresh on 401
    if (res.status === 401) {
      const refreshed = await tryRefresh();
      if (refreshed) return request<T>(endpoint, init); // Retry once
    }

    throw new ApiError(res.status, body.code, body.error, body.requestId);
  }

  const json: ApiResponse<T> = await res.json();
  return json.data;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(url: string) => request<T>(url, { method: "DELETE" }),
};
```

**Design Rationale:**
- **`credentials: "include"`** — browser sends httpOnly cookies automatically on every request
- **No token in JavaScript** — impossible for XSS to steal authentication
- **Network vs HTTP error distinction** — `ApiError.isNetworkError` lets UI show appropriate message
- **`requestId` preserved** — user can report issues with trace ID
- **Auto-refresh transparent** — 401 → try refresh cookie → retry → if still fails, throw

### 7.3 SSE Client — Cookie-Based — `src/lib/sse-client.ts`

```typescript
import type { StreamChunk } from "@chatbot/shared";

type SSECallbacks = {
  onToken: (content: string) => void;
  onDone: (usage: Record<string, unknown>) => void;
  onError: (error: string, code?: string) => void;
  onTitle?: (title: string) => void;
  onCitation?: (citation: { source: string; page: number; relevance: number }) => void;
  onInfo?: (message: string) => void;
};

export function streamChat(
  conversationId: string,
  body: { content: string; model?: string; temperature?: number },
  callbacks: SSECallbacks,
): AbortController {
  const controller = new AbortController();
  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

  fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
    method: "POST",
    credentials: "include",  // httpOnly cookies sent automatically
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Stream failed" }));
        callbacks.onError(err.error, err.code);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) { callbacks.onError("No response body"); return; }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              switch (currentEvent) {
                case "token": callbacks.onToken(data.content); break;
                case "done": callbacks.onDone(data.usage ?? {}); break;
                case "error": callbacks.onError(data.error, data.code); break;
                case "title": callbacks.onTitle?.(data.title); break;
                case "citation": callbacks.onCitation?.(data); break;
                case "info": callbacks.onInfo?.(data.message); break;
              }
            } catch { /* skip malformed SSE */ }
            currentEvent = "";
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError(err.message, "NETWORK_ERROR");
      }
    });

  return controller;
}
```

**Design Rationale:**
- **`credentials: "include"`** — no `Authorization` header, cookies handle auth
- **All SSE event types handled** — token, done, error, title, citation, info
- **Error `code` propagated** — frontend can show "Rate limit" vs "Server error" differently
- **Network errors flagged** — `NETWORK_ERROR` code lets UI show offline indicator

### 7.4 TanStack Query Provider — `src/components/providers/query-provider.tsx`

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() =>
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,         // 30s before refetch
          retry: 1,                   // Retry failed queries once
          refetchOnWindowFocus: true,  // Refresh when tab regains focus
        },
      },
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

### 7.5 Auth Provider — `src/components/providers/auth-provider.tsx`

```tsx
"use client";

import { createContext, useContext } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import type { UserProfile, LoginInput, RegisterInput } from "@chatbot/shared";

type AuthContext = {
  user: UserProfile | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.get<{ user: UserProfile }>("/auth/me").then((d) => d.user),
    retry: false, // Don't retry auth — if 401, user is not logged in
  });

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => api.post<{ user: UserProfile }>("/auth/login", input),
    onSuccess: (data) => {
      queryClient.setQueryData(["auth", "me"], data.user);
      router.push("/");
    },
  });

  const registerMutation = useMutation({
    mutationFn: (input: RegisterInput) => api.post<{ user: UserProfile }>("/auth/register", input),
    onSuccess: (data) => {
      queryClient.setQueryData(["auth", "me"], data.user);
      router.push("/");
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
      router.push("/login");
    },
  });

  return (
    <AuthCtx.Provider
      value={{
        user: user ?? null,
        isLoading,
        login: async (input) => { await loginMutation.mutateAsync(input); },
        register: async (input) => { await registerMutation.mutateAsync(input); },
        logout: async () => { await logoutMutation.mutateAsync(); },
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

**Design Rationale:**
- **TanStack Query for user profile** — cached, auto-refreshed on window focus, single source of truth
- **`GET /auth/me`** on mount — verifies session is valid, loads user profile
- **Login/register set query cache** — no extra fetch after auth
- **Logout clears all caches** — prevents stale data from previous user
- **Zustand NOT used for server state** — TanStack Query handles it with proper caching and invalidation

### 7.6 UI-Only Zustand Store — `src/stores/ui-store.ts`

```typescript
import { create } from "zustand";

type UIState = {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
```

### 7.7 Chat Store — Streaming State Only

```typescript
import { create } from "zustand";

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  isStreaming?: boolean;
  createdAt: string;
  citations?: { source: string; page: number; relevance: number }[];
};

type ChatState = {
  conversationId: string | null;
  messages: Message[];
  isGenerating: boolean;
  abortController: AbortController | null;

  setConversation: (id: string, messages: Message[]) => void;
  addUserMessage: (content: string) => void;
  startAssistantMessage: () => void;
  appendToken: (content: string) => void;
  addCitation: (citation: { source: string; page: number; relevance: number }) => void;
  finishGeneration: () => void;
  setAbortController: (controller: AbortController | null) => void;
  stopGeneration: () => void;
  clearMessages: () => void;
};

export const useChatStore = create<ChatState>((set, get) => ({
  conversationId: null,
  messages: [],
  isGenerating: false,
  abortController: null,

  setConversation: (id, messages) =>
    set({ conversationId: id, messages, isGenerating: false, abortController: null }),

  addUserMessage: (content) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { id: crypto.randomUUID(), role: "user", content, createdAt: new Date().toISOString() },
      ],
    })),

  startAssistantMessage: () =>
    set((state) => ({
      isGenerating: true,
      messages: [
        ...state.messages,
        { id: crypto.randomUUID(), role: "assistant", content: "", isStreaming: true, createdAt: new Date().toISOString() },
      ],
    })),

  appendToken: (content) =>
    set((state) => {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant" && last.isStreaming) {
        msgs[msgs.length - 1] = { ...last, content: last.content + content };
      }
      return { messages: msgs };
    }),

  addCitation: (citation) =>
    set((state) => {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") {
        msgs[msgs.length - 1] = {
          ...last,
          citations: [...(last.citations ?? []), citation],
        };
      }
      return { messages: msgs };
    }),

  finishGeneration: () =>
    set((state) => ({
      messages: state.messages.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
      isGenerating: false,
      abortController: null,
    })),

  setAbortController: (controller) => set({ abortController: controller }),

  stopGeneration: () => {
    get().abortController?.abort();
    set((state) => ({
      messages: state.messages.map((m) =>
        m.isStreaming ? { ...m, isStreaming: false, content: m.content + " [stopped]" } : m,
      ),
      isGenerating: false,
      abortController: null,
    }));
  },

  clearMessages: () => set({ conversationId: null, messages: [], isGenerating: false, abortController: null }),
}));
```

**Design Rationale:**
- Chat store handles **streaming-specific UI state only** — `isStreaming`, `abortController`, token appending
- Server state (conversation list, document list) managed by **TanStack Query** (S2+)
- `addCitation` accumulates citations on the current assistant message — renders as badges
- `setConversation` loads from server — single entry point for conversation switch

---

## 8. Testing Strategy (S1)

### Backend — Vitest with Hono `app.request()`

```typescript
// tests/setup.ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../src/db/schema.js";

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const testDb = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: "./drizzle/migrations" });
  return testDb;
}
```

### Coverage Targets

| Area | Target |
|------|--------|
| Auth register/login | 100% — valid paths, conflict, weak password, enumeration prevention |
| JWT sign/verify | 100% — creation, validation, expiry, wrong type |
| Cookie setting | 100% — httpOnly, Secure, SameSite, correct paths |
| Rate limiting | 100% — under limit passes, over limit returns 429 |
| Chat SSE stream | 80% — stream starts, tokens flow, error event |
| Health endpoints | 100% |

---

## 9. Security Checklist (S1)

- [x] **Passwords hashed** with bcrypt (12 rounds)
- [x] **Password strength** validated (mixed character types via Zod refine)
- [x] **JWT in httpOnly cookies** — not accessible to JavaScript (XSS-proof)
- [x] **SameSite=Strict** cookies — prevents CSRF
- [x] **Access/refresh token separation** with `type` claim and separate cookie paths
- [x] **Input validation** via Zod on every endpoint
- [x] **CORS restricted** to `FRONTEND_URL` only, with credentials
- [x] **SQL injection prevention** (Drizzle ORM parameterized queries)
- [x] **No secrets in code** — all via env vars, validated at startup
- [x] **Error messages don't leak** stack traces or internal details
- [x] **Same error for wrong email / wrong password** — prevents user enumeration
- [x] **Generic registration error** — doesn't reveal if email exists
- [x] **Rate limiting** on auth (10/min per IP) and chat (30/min per user)
- [x] **Request correlation** — `requestId` in every log and error response
- [x] **Structured logging** — pino JSON logs with redacted sensitive headers

---

## 10. Development Workflow

```bash
# Initial setup
pnpm install

# Full dev (both services via Turbo)
pnpm dev

# Backend only (file watching)
pnpm --filter @chatbot/backend dev

# Frontend only
pnpm --filter @chatbot/frontend dev

# Generate DB migration after schema change
pnpm db:generate

# Apply migrations
pnpm db:migrate

# Browse DB visually
pnpm db:studio

# Run all tests
pnpm test
```

---

## 11. Definition of Done

Phase S1 is complete when:

1. `pnpm install && pnpm dev` boots both backend (:8000) and frontend (:3000)
2. `POST /api/v1/auth/register` creates user, sets httpOnly cookies, returns user profile
3. `POST /api/v1/auth/login` authenticates, sets httpOnly cookies, returns user profile
4. `POST /api/v1/auth/refresh` rotates access token cookie
5. `POST /api/v1/auth/logout` clears cookies
6. `GET /api/v1/auth/me` returns cached user profile (TanStack Query)
7. `POST /api/v1/conversations/:id/messages` streams Gemini response via SSE
8. `GET /api/v1/health` returns `{ "status": "ok" }`
9. Rate limiting returns 429 when exceeded
10. Frontend login/register pages work with cookie-based auth
11. Frontend chat page renders streamed response token-by-token
12. All Vitest tests pass
13. SQLite DB file auto-created in `./data/`
14. `@chatbot/shared` types used by both frontend and backend — zero duplication
15. Structured JSON logs output in backend with requestId correlation
