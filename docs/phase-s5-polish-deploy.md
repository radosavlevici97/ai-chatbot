# Phase S5 — Polish & Deploy

> **Timeline:** Week 5 | **Goal:** Production-ready showcase deployed to Vercel + Railway
> **Depends on:** Phase S4 (all features complete)
> **Delivers to:** Stakeholder demo

---

## 1. Objectives

| # | Objective | Acceptance Criteria |
|---|-----------|-------------------|
| 1 | Error handling | All API errors show user-friendly toast notifications |
| 2 | Loading states | Skeletons for sidebar, spinner for uploads, pulse for streaming |
| 3 | Empty states | Helpful messages when no conversations, no documents, etc. |
| 4 | Rate limit handling | Detect Gemini 429, auto-fallback or show friendly message |
| 5 | OpenRouter fallback | If Gemini rate-limited, seamlessly switch to free OpenRouter model |
| 6 | Deploy backend | Railway with persistent volume for SQLite + uploads |
| 7 | Deploy frontend | Vercel with auto-deploy from GitHub |
| 8 | CORS for production | `FRONTEND_URL` set to Vercel domain, preview deploy handling |
| 9 | Graceful shutdown | Close DB, abort SSE streams, cleanup intervals on SIGTERM |
| 10 | Health monitoring | Enhanced `/health` with DB, LLM, storage, uptime checks |
| 11 | Demo preparation | Demo script, seed script using service functions, sample data |
| 12 | Bug fixes | Fix all known issues from S1-S4 testing |

---

## 2. Error Handling & UX Polish

### 2.1 Toast Notification System

```tsx
// Add to frontend dependencies: "sonner": "^1.7.0"

// src/components/providers/toast-provider.tsx
import { Toaster } from "sonner";

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        duration: 5000,
        className: "font-sans",
      }}
    />
  );
}

// Usage in any component:
import { toast } from "sonner";

// Success
toast.success("Document uploaded successfully");

// Error with requestId for support
toast.error("Failed to send message", {
  description: "Please check your connection and try again. (Request ID: abc123)",
});

// Rate limit
toast.warning("Rate limit reached", {
  description: "Switching to backup model...",
  duration: 8000,
});
```

### 2.2 Global Error Boundary

```tsx
// src/components/error-boundary.tsx
"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Reload
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### 2.3 Loading States

```tsx
// src/components/chat/chat-skeleton.tsx
import { cn } from "@/lib/utils";

export function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className={cn("flex gap-3", i % 2 === 0 && "flex-row-reverse")}>
          <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
          <div className="flex-1 max-w-[60%] space-y-2">
            <div className="h-4 rounded bg-muted animate-pulse" />
            <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

// src/components/sidebar/sidebar-skeleton.tsx
export function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-9 rounded bg-muted animate-pulse" />
      ))}
    </div>
  );
}
```

### 2.4 Empty States

```tsx
// src/components/chat/empty-state.tsx
import { Sparkles } from "lucide-react";

const SUGGESTED_PROMPTS = [
  "Explain quantum computing simply",
  "Write a Python sorting algorithm",
  "Summarize this PDF for me",
  "Help me draft a professional email",
];

export function ChatEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <Sparkles className="h-12 w-12 text-muted-foreground/50" />
      <div>
        <h2 className="text-lg font-semibold">Start a conversation</h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          Ask me anything. I can help with analysis, writing, code, and more.
          Upload documents or images for context.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 max-w-md">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            className="rounded-full border px-3 py-1.5 text-xs hover:bg-muted transition"
            onClick={() => { /* pre-fill input */ }}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
```

---

## 3. OpenRouter Fallback Provider

### 3.1 OpenRouter Provider — `src/services/llm/openrouter.ts`

The OpenRouter provider implements **only** `LLMProvider` (chat). It does **not** implement `EmbeddingProvider` — embeddings always use Gemini (see S1, section 6.14).

```typescript
import type { LLMProvider, ChatMessage } from "./base.js";
import type { StreamChunk } from "@chatbot/shared";
import { log } from "../../middleware/logger.js";

const OPENROUTER_API = "https://openrouter.ai/api/v1";

// Free models available on OpenRouter
const FREE_MODELS: Record<string, string> = {
  "meta-llama/llama-3.1-8b-instruct:free": "Llama 3.1 8B",
  "google/gemma-2-9b-it:free": "Gemma 2 9B",
  "mistralai/mistral-7b-instruct:free": "Mistral 7B",
};

export class OpenRouterProvider implements LLMProvider {
  private apiKey: string;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel?: string) {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel ?? Object.keys(FREE_MODELS)[0];
  }

  async *streamChat(
    messages: ChatMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): AsyncGenerator<StreamChunk> {
    const model = options?.model ?? this.defaultModel;

    // OpenRouter only supports text — strip images from messages
    const body = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      stream: true,
    };

    try {
      const response = await fetch(`${OPENROUTER_API}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": "https://chatbot-showcase.vercel.app",
          "X-Title": "SecureChatBot Showcase",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`OpenRouter API error: ${response.status} ${errorBody}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              yield { event: "token", content };
            }
          } catch { /* skip malformed SSE line */ }
        }
      }

      yield { event: "done", finishReason: "stop" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      log.error({ provider: "openrouter", error: message }, "OpenRouter stream error");
      yield { event: "error", error: message, code: "LLM_ERROR" };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${OPENROUTER_API}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
```

**Design Rationale:**
- `OpenRouterProvider` implements **only `LLMProvider`** — no `embed()` method. Embeddings are handled exclusively by `GeminiEmbeddingProvider` (S1, section 6.14), which implements the separate `EmbeddingProvider` interface.
- Images are stripped from messages — OpenRouter free models are text-only. The `info` SSE event warns the frontend when fallback drops images.
- Error logging uses the pino `log` instance from S1 — no duplicate logger.
- Free model IDs include the `:free` suffix required by OpenRouter's API.

### 3.2 Updated Factory — `src/services/llm/factory.ts`

Uses the separated factory function names established in S1: `getChatProvider()`, `getEmbeddingProvider()`, `getFallbackChatProvider()`.

```typescript
import type { LLMProvider, EmbeddingProvider } from "./base.js";
import { GeminiChatProvider, GeminiEmbeddingProvider } from "./gemini.js";
import { OpenRouterProvider } from "./openrouter.js";
import { env } from "../../env.js";
import { log } from "../../middleware/logger.js";

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
      if (!env.OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY required when LLM_PROVIDER=openrouter");
      }
      chatProvider = new OpenRouterProvider(env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL);
      break;
    case "ollama":
      throw new Error("Ollama provider not yet implemented");
  }

  log.info({ provider: env.LLM_PROVIDER }, "Chat provider initialized");
  return chatProvider;
}

// Embedding provider is ALWAYS Gemini — independent of chat provider
export function getEmbeddingProvider(): EmbeddingProvider {
  if (embeddingProvider) return embeddingProvider;
  embeddingProvider = new GeminiEmbeddingProvider(env.GEMINI_API_KEY, env.GEMINI_EMBEDDING_MODEL);
  log.info({ provider: "gemini", model: env.GEMINI_EMBEDDING_MODEL }, "Embedding provider initialized");
  return embeddingProvider;
}

// Fallback chat provider (OpenRouter) — used when primary hits rate limit
export function getFallbackChatProvider(): LLMProvider | null {
  if (!env.OPENROUTER_API_KEY) return null;
  if (env.LLM_PROVIDER === "openrouter") return null; // Don't fallback to self
  if (fallbackChatProvider) return fallbackChatProvider;

  fallbackChatProvider = new OpenRouterProvider(env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL);
  log.info({ provider: "openrouter", model: env.OPENROUTER_MODEL }, "Fallback chat provider initialized");
  return fallbackChatProvider;
}

// Reset providers — used in graceful shutdown and testing
export function resetProviders(): void {
  chatProvider = null;
  embeddingProvider = null;
  fallbackChatProvider = null;
}
```

**Design Rationale:**
- Factory function names match S1 conventions: `getChatProvider()`, `getEmbeddingProvider()`, `getFallbackChatProvider()` — not the old `getLLMProvider()` / `getFallbackProvider()`.
- Embedding provider always uses Gemini regardless of chat provider selection — embeddings require a dedicated embedding model, not a chat completion model.
- `getFallbackChatProvider()` returns `null` if primary is already OpenRouter — prevents circular fallback.
- `resetProviders()` exposed for graceful shutdown and test teardown.
- Provider initialization logged via pino — visible in Railway logs.

### 3.3 Rate Limit Detection + Fallback in Chat Route

```typescript
// Updated chat route — rate limit detection with fallback
// This replaces the SSE streaming section of chat.routes.ts

import { getChatProvider, getFallbackChatProvider } from "../services/llm/factory.js";
import { log } from "../middleware/logger.js";

return streamSSE(c, async (stream) => {
  let fullResponse = "";
  const requestId = c.get("requestId");
  let usedFallback = false;

  const primaryLlm = getChatProvider();
  let activeGenerator = primaryLlm.streamChat(llmMessages, {
    model: input.model ?? conv.model,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
  });

  for await (const chunk of activeGenerator) {
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
          data: JSON.stringify({
            finishReason: chunk.finishReason,
            usage: chunk.usage,
            model: usedFallback ? "fallback" : undefined,
          }),
        });
        break;

      case "error": {
        const isRateLimit = chunk.code === "RATE_LIMITED" ||
          chunk.error.includes("429") ||
          chunk.error.includes("RESOURCE_EXHAUSTED");

        if (isRateLimit && !usedFallback) {
          const fallback = getFallbackChatProvider();
          if (fallback) {
            log.warn({ requestId }, "Primary LLM rate-limited, switching to fallback");

            // Notify frontend
            await stream.writeSSE({
              event: "info",
              data: JSON.stringify({
                message: "Rate limit reached. Switching to backup model...",
              }),
            });

            usedFallback = true;

            // Retry with fallback (text-only — OpenRouter free models don't support images)
            const textMessages = llmMessages.map((m) => ({
              role: m.role,
              content: m.content,
            }));

            for await (const fallbackChunk of fallback.streamChat(textMessages, {
              temperature: input.temperature,
              maxTokens: input.maxTokens,
            })) {
              if (fallbackChunk.event === "token") {
                fullResponse += fallbackChunk.content;
                await stream.writeSSE({
                  event: "token",
                  data: JSON.stringify({ content: fallbackChunk.content, finishReason: null }),
                });
              } else if (fallbackChunk.event === "done") {
                await stream.writeSSE({
                  event: "done",
                  data: JSON.stringify({
                    finishReason: fallbackChunk.finishReason,
                    usage: fallbackChunk.usage,
                    model: "fallback",
                  }),
                });
              } else if (fallbackChunk.event === "error") {
                await stream.writeSSE({
                  event: "error",
                  data: JSON.stringify({
                    error: "Both primary and backup models failed. Please try again later.",
                    code: "LLM_ERROR",
                  }),
                });
              }
            }
          } else {
            // No fallback configured
            await stream.writeSSE({
              event: "error",
              data: JSON.stringify({
                error: "Rate limit reached. Please wait a moment and try again.",
                code: "RATE_LIMITED",
              }),
            });
          }
        } else {
          // Non-rate-limit error, or fallback already tried
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({ error: chunk.error, code: chunk.code }),
          });
        }
        break;
      }
    }
  }

  // Persist assistant response (same as S2 — message persistence)
  if (fullResponse) {
    convService.addMessage({
      conversationId,
      role: "assistant",
      content: fullResponse,
      model: usedFallback ? env.OPENROUTER_MODEL : (input.model ?? conv.model),
    });

    // Auto-generate title if first exchange (S2 pattern)
    if (history.length <= 1 && !conv.title) {
      const { generateTitle } = await import("../services/title.service.js");
      const title = await generateTitle(input.content);
      convService.updateConversation(conversationId, userId, { title });
      await stream.writeSSE({
        event: "title",
        data: JSON.stringify({ title }),
      });
    }
  }
});
```

---

## 4. Enhanced Health Endpoint

### 4.1 Health Route — `src/routes/health.routes.ts`

```typescript
import { Hono } from "hono";
import { db } from "../db/index.js";
import { getChatProvider, getFallbackChatProvider } from "../services/llm/factory.js";
import { env } from "../env.js";
import { log } from "../middleware/logger.js";
import { existsSync, statSync } from "node:fs";
import { dirname } from "node:path";
import type { AppEnv } from "../app.js";

const health = new Hono<AppEnv>();

const startTime = Date.now();

// Simple health check — used by Railway's healthcheck probe
health.get("/health", async (c) => {
  const requestId = c.get("requestId");

  const checks: Record<string, { status: "ok" | "degraded" | "error"; latency?: number; detail?: string }> = {};

  // 1. Database connectivity
  const dbStart = Date.now();
  try {
    const result = db.run("SELECT 1 AS ok");
    checks.database = { status: "ok", latency: Date.now() - dbStart };
  } catch (err) {
    checks.database = {
      status: "error",
      latency: Date.now() - dbStart,
      detail: err instanceof Error ? err.message : "Database unreachable",
    };
  }

  // 2. LLM provider health (non-blocking timeout)
  try {
    const llm = getChatProvider();
    const llmStart = Date.now();
    const healthy = await Promise.race([
      llm.healthCheck(),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 5000)),
    ]);
    checks.llm = {
      status: healthy ? "ok" : "degraded",
      latency: Date.now() - llmStart,
      detail: healthy ? env.LLM_PROVIDER : "Health check failed or timed out",
    };
  } catch {
    checks.llm = { status: "degraded", detail: "Provider not initialized" };
  }

  // 3. Fallback LLM health
  try {
    const fallback = getFallbackChatProvider();
    if (fallback) {
      const fallbackStart = Date.now();
      const healthy = await Promise.race([
        fallback.healthCheck(),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 5000)),
      ]);
      checks.fallbackLlm = {
        status: healthy ? "ok" : "degraded",
        latency: Date.now() - fallbackStart,
      };
    } else {
      checks.fallbackLlm = { status: "ok", detail: "Not configured" };
    }
  } catch {
    checks.fallbackLlm = { status: "degraded", detail: "Health check failed" };
  }

  // 4. Storage health
  try {
    const uploadDir = env.UPLOAD_DIR;
    const dbDir = dirname(env.DATABASE_PATH);
    const uploadsExist = existsSync(uploadDir);
    const dbExists = existsSync(env.DATABASE_PATH);

    if (uploadsExist && dbExists) {
      const dbStat = statSync(env.DATABASE_PATH);
      checks.storage = {
        status: "ok",
        detail: `DB size: ${(dbStat.size / 1024 / 1024).toFixed(1)}MB, type: ${env.STORAGE_TYPE}`,
      };
    } else {
      checks.storage = {
        status: "error",
        detail: `uploads: ${uploadsExist}, db: ${dbExists}`,
      };
    }
  } catch (err) {
    checks.storage = {
      status: "error",
      detail: err instanceof Error ? err.message : "Storage check failed",
    };
  }

  // Determine overall status
  const hasError = Object.values(checks).some((c) => c.status === "error");
  const hasDegraded = Object.values(checks).some((c) => c.status === "degraded");
  const overallStatus = hasError ? "error" : hasDegraded ? "degraded" : "ok";

  const response = {
    status: overallStatus,
    version: process.env.npm_package_version ?? "0.1.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks,
  };

  // Return 200 even if degraded (LLM down shouldn't prevent deploy)
  // Return 503 only if DB is down (critical dependency)
  const statusCode = checks.database.status === "error" ? 503 : 200;

  if (overallStatus !== "ok") {
    log.warn({ requestId, health: response }, "Health check returned non-ok status");
  }

  return c.json(response, statusCode);
});

// Readiness probe — simpler, for Railway
health.get("/ready", (c) => {
  try {
    db.run("SELECT 1");
    return c.json({ ready: true });
  } catch {
    return c.json({ ready: false }, 503);
  }
});

export { health };
```

**Design Rationale:**
- Health check returns detailed subsystem status — DB, LLM, fallback LLM, storage — so operators can diagnose issues from Railway's dashboard without SSH access.
- LLM health checks have a 5-second timeout via `Promise.race` — a slow external API should not block the health endpoint.
- Returns 200 even when LLM is degraded — Railway should not restart the container just because the Gemini API is temporarily rate-limited.
- Returns 503 only when the database is unreachable — this is the only truly critical dependency.
- `uptime` in seconds — useful for checking if Railway restarted the container.
- `/ready` is a minimal probe — suitable for Railway's `healthcheckPath`.

---

## 5. Graceful Shutdown

### 5.1 Server Entry with Shutdown Handling — `src/index.ts`

```typescript
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { env } from "./env.js";
import { log } from "./middleware/logger.js";
import { db } from "./db/index.js";
import { resetProviders } from "./services/llm/factory.js";
import Database from "better-sqlite3";

const app = createApp();

// Track active SSE connections for graceful abort
const activeStreams = new Set<AbortController>();

export function trackStream(controller: AbortController): void {
  activeStreams.add(controller);
  controller.signal.addEventListener("abort", () => {
    activeStreams.delete(controller);
  });
}

export function untrackStream(controller: AbortController): void {
  activeStreams.delete(controller);
}

const server = serve({
  fetch: app.fetch,
  port: env.PORT,
}, (info) => {
  log.info({
    port: info.port,
    env: env.NODE_ENV,
    provider: env.LLM_PROVIDER,
    storage: env.STORAGE_TYPE,
  }, "Server started");
});

// ── Graceful Shutdown ─────────────────────────────

let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log.info({ signal }, "Graceful shutdown initiated");

  // 1. Stop accepting new connections
  server.close(() => {
    log.info("HTTP server closed — no new connections");
  });

  // 2. Abort all in-flight SSE streams
  const streamCount = activeStreams.size;
  for (const controller of activeStreams) {
    controller.abort();
  }
  activeStreams.clear();
  if (streamCount > 0) {
    log.info({ aborted: streamCount }, "In-flight SSE streams aborted");
  }

  // 3. Reset LLM providers (cleanup any open connections)
  resetProviders();

  // 4. Close database connection
  try {
    // Access the underlying better-sqlite3 instance to close it
    // Drizzle doesn't expose a close method, so we get the raw driver
    const rawDb = (db as any)._.session.client as InstanceType<typeof Database>;
    rawDb.close();
    log.info("Database connection closed");
  } catch (err) {
    log.error({ err }, "Error closing database");
  }

  // 5. Allow time for final log flush
  await new Promise((resolve) => setTimeout(resolve, 500));

  log.info("Shutdown complete");
  process.exit(0);
}

// Railway sends SIGTERM on redeploy; Docker sends SIGTERM then SIGKILL after timeout
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Catch unhandled errors — log and exit
process.on("uncaughtException", (err) => {
  log.fatal({ err: err.message, stack: err.stack }, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log.fatal({ reason: String(reason) }, "Unhandled rejection");
  process.exit(1);
});
```

**Design Rationale:**
- Railway sends `SIGTERM` on every redeploy — without graceful shutdown, in-flight SSE streams drop mid-token and the SQLite WAL file may not flush.
- `activeStreams` set tracks all open SSE connections — on shutdown, each `AbortController.abort()` cleanly ends the stream on the client side.
- Database close happens **after** streams abort — ensures all pending writes complete before the WAL is flushed.
- 500ms delay before `process.exit(0)` — gives pino time to flush buffered log entries to stdout (Railway captures stdout).
- `uncaughtException` and `unhandledRejection` handlers log the error with `fatal` level and exit — prevents the process from entering an undefined state.

### 5.2 Integrating Stream Tracking in Chat Route

```typescript
// In chat.routes.ts — wrap the SSE stream with tracking

import { trackStream, untrackStream } from "../index.js";

chat.post(
  "/conversations/:conversationId/messages",
  requireAuth,
  chatLimiter,
  async (c) => {
    // ... validation, history loading ...

    const streamController = new AbortController();
    trackStream(streamController);

    return streamSSE(c, async (stream) => {
      try {
        // ... streaming logic from section 3.3 ...
      } finally {
        untrackStream(streamController);
      }
    });
  },
);
```

---

## 6. Deployment Architecture

```
                     GitHub Repository (main branch)
                              |
              +---------------+---------------+
              |                               |
        frontend/                        backend/
              |                               |
       auto-deploy                     auto-deploy
              |                               |
     +--------+--------+            +--------+--------+
     |     Vercel       |            |    Railway       |
     |   (free tier)    |            |   (free tier)    |
     |                  |            |                  |
     | *.vercel.app     |  <---->   | *.railway.app    |
     | Static + SSR     |  CORS +   | Hono API server  |
     | Next.js 15       |  cookies  | SQLite + uploads  |
     +------------------+            +---------+--------+
                                               |
                                     Railway Volume
                                     (persistent disk)
                                     /data/chatbot.db
                                     /data/uploads/
                                     /data/chroma/
```

### 6.1 Railway Persistent Storage

Railway's filesystem is **ephemeral** — on every deploy, the container is rebuilt from scratch. Without persistent storage, your SQLite database and uploaded files are lost on each deploy.

**Two approaches for persistent storage:**

#### Option A: Railway Volumes (Recommended for showcase)

Railway Volumes attach a persistent disk to your service. Data on the volume survives redeploys.

**Setup steps:**

1. In the Railway dashboard, open your backend service
2. Go to **Settings > Volumes**
3. Click **Add Volume**
4. Set mount path: `/data`
5. Set size: 1 GB (sufficient for showcase)
6. Click **Create**

**Environment variables for Railway Volumes:**

```bash
# Railway Volumes mount at /data — set these in Railway dashboard
DATABASE_PATH=/data/chatbot.db
UPLOAD_DIR=/data/uploads
STORAGE_TYPE=local
```

**How it works:**
- Railway mounts the volume at `/data` inside the container
- The SQLite DB file, uploaded documents, uploaded images, and ChromaDB data all persist under `/data`
- On redeploy, the new container gets the same volume mounted — data survives
- Backups: Railway Volumes support snapshots from the dashboard

#### Option B: Cloudflare R2 for uploads + Railway Volume for DB only

If you want uploads stored in object storage (more durable, CDN-friendly), use R2 for files and a small Railway Volume for SQLite only.

**Setup steps:**

1. Create a Cloudflare R2 bucket in the Cloudflare dashboard
2. Create an R2 API token with read/write permissions
3. Add a Railway Volume for the DB only (mount at `/data`, 500 MB)
4. Set environment variables:

```bash
# Railway dashboard
DATABASE_PATH=/data/chatbot.db
STORAGE_TYPE=r2
R2_ACCOUNT_ID=<your-account-id>
R2_ACCESS_KEY=<your-r2-access-key>
R2_SECRET_KEY=<your-r2-secret-key>
R2_BUCKET=chatbot-uploads
```

**When to use which:**

| Concern | Option A (Volumes) | Option B (R2 + Volume) |
|---------|-------------------|----------------------|
| Setup complexity | Simple — one volume | Medium — R2 bucket + volume |
| Cost (showcase) | Free tier | Free tier (R2 has 10 GB free) |
| Durability | Good (single disk) | Better (R2 is replicated) |
| CDN for images | No | Yes (R2 has CDN) |
| Best for | Showcase / demo | Production-like setup |

**Critical:** The SQLite DB file **must** be on a Railway Volume (or equivalent persistent disk) in both options. SQLite cannot run from object storage like R2.

### 6.2 Backend Dockerfile

```dockerfile
# backend/Dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy workspace root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/

# Install all dependencies (needed for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared/ ./packages/shared/
COPY backend/ ./backend/

# Build shared package first, then backend
RUN pnpm --filter @chatbot/shared build
RUN pnpm --filter @chatbot/backend build

# Use pnpm deploy to create a production-only install
RUN pnpm --filter @chatbot/backend deploy --prod /app/production

# ── Production ─────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Copy production-only dependencies from pnpm deploy
COPY --from=builder /app/production/node_modules ./node_modules
COPY --from=builder /app/production/package.json ./

# Copy built artifacts
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/drizzle ./drizzle

# Create data directory (Railway Volume mounts over this)
RUN mkdir -p /data/uploads /data/chroma

# Non-root user for security
RUN addgroup --system chatbot && adduser --system --ingroup chatbot chatbot
RUN chown -R chatbot:chatbot /app /data
USER chatbot

EXPOSE 8000

# Health check — Railway also uses healthcheckPath but this is a Docker-native fallback
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8000/api/v1/health || exit 1

CMD ["node", "dist/index.js"]
```

**Design Rationale:**
- `pnpm deploy --prod` creates a self-contained directory with only production dependencies — the final image does not include devDependencies, TypeScript source, or build tools. This reduces image size by 40-60% compared to copying all of `node_modules`.
- Multi-stage build — builder stage has all dev tooling, runner stage is minimal.
- `HEALTHCHECK` instruction — Docker and Railway can detect if the process is alive but not responding.
- `/data` directory created as a mount point — Railway Volume mounts over it, preserving data across deploys.
- Non-root user `chatbot` — follows security best practices for container deployments.
- `wget` used for healthcheck instead of `curl` — alpine includes `wget` by default.

### 6.3 `.dockerignore`

```
# backend/.dockerignore
node_modules
dist
.env
.env.*
*.db
*.db-wal
*.db-shm
data/
.git
.gitignore
*.md
tests/
**/*.test.ts
**/*.spec.ts
.vscode
.idea
```

**Design Rationale:**
- Excludes `node_modules` — pnpm install runs inside the builder stage.
- Excludes `.env` files — secrets are injected via Railway environment variables.
- Excludes `*.db` files — database lives on the persistent volume, not in the image.
- Excludes tests and docs — reduces Docker build context size and speeds up builds.

### 6.4 Frontend — Vercel Configuration

```typescript
// frontend/next.config.ts
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.railway.app",
      },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
};

export default config;
```

### 6.5 Railway Configuration — `railway.toml`

```toml
[build]
builder = "dockerfile"
dockerfilePath = "backend/Dockerfile"

[deploy]
numReplicas = 1
healthcheckPath = "/api/v1/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3

[deploy.resources]
memoryMB = 512
```

---

## 7. CORS Configuration for Production

### 7.1 The Problem: Vercel Preview Deployments

Vercel generates a unique URL for every push and every PR (e.g., `my-app-abc123.vercel.app`). The backend CORS must accept these URLs, but we cannot use a wildcard `*` because `credentials: "include"` (required for httpOnly cookies) is incompatible with `Access-Control-Allow-Origin: *`.

### 7.2 Solution: Dynamic CORS Origin Validation

```typescript
// In src/app.ts — updated CORS configuration

import { cors } from "hono/cors";
import { env } from "./env.js";

// Parse FRONTEND_URL — supports comma-separated values for multiple origins
const allowedOrigins = env.FRONTEND_URL.split(",").map((u) => u.trim());

// Vercel preview URL pattern: <project>-<hash>-<team>.vercel.app
// or <project>-git-<branch>-<team>.vercel.app
const VERCEL_PREVIEW_PATTERN = /^https:\/\/[\w-]+-[\w-]+\.vercel\.app$/;

function isAllowedOrigin(origin: string): boolean {
  // Exact match against configured origins
  if (allowedOrigins.includes(origin)) return true;

  // In production, also allow Vercel preview deployments if configured
  if (env.ALLOW_VERCEL_PREVIEWS && VERCEL_PREVIEW_PATTERN.test(origin)) {
    return true;
  }

  return false;
}

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (isAllowedOrigin(origin)) return origin;
      return allowedOrigins[0]; // Fallback to primary
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);
```

### 7.3 Updated Environment Schema

```typescript
// Add to src/env.ts

// CORS — supports comma-separated URLs for multiple origins
FRONTEND_URL: z.string().default("http://localhost:3000"),

// Allow Vercel preview deployments (*.vercel.app)
ALLOW_VERCEL_PREVIEWS: z.coerce.boolean().default(false),
```

### 7.4 Configuration Examples

```bash
# Local development
FRONTEND_URL=http://localhost:3000
ALLOW_VERCEL_PREVIEWS=false

# Production — single Vercel domain
FRONTEND_URL=https://my-chatbot.vercel.app
ALLOW_VERCEL_PREVIEWS=false

# Production — with preview deployments enabled
FRONTEND_URL=https://my-chatbot.vercel.app
ALLOW_VERCEL_PREVIEWS=true

# Production — multiple explicit origins
FRONTEND_URL=https://my-chatbot.vercel.app,https://chatbot.example.com
ALLOW_VERCEL_PREVIEWS=false
```

**Design Rationale:**
- `ALLOW_VERCEL_PREVIEWS` is opt-in — off by default for security.
- Regex pattern for Vercel preview URLs is restrictive — only matches `*.vercel.app` with valid characters.
- Comma-separated `FRONTEND_URL` supports custom domains alongside Vercel's default domain.
- `credentials: true` remains required — httpOnly cookies must be sent cross-origin.

---

## 8. Monitoring

S5 does **not** introduce a new logger. The structured logging system was established in S1 (section 6.5) using **pino**:

```typescript
// Recap from S1 — src/middleware/logger.ts
// This is NOT new code — reference only. Already implemented in S1.

import pino from "pino";

export const log = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
  redact: ["req.headers.cookie", "req.headers.authorization"],
});
```

### 8.1 What S5 Adds to Monitoring

S5 leverages the existing pino logger for deployment-specific observability:

1. **Railway log viewer** — pino outputs JSON to stdout in production. Railway captures stdout and makes it searchable in the dashboard. Each log entry includes `requestId` for request correlation.

2. **Health endpoint logging** — the enhanced `/health` endpoint (section 4) logs warnings when subsystems are degraded.

3. **Graceful shutdown logging** — the shutdown handler (section 5) logs each shutdown step with timestamps.

4. **Fallback provider logging** — the factory (section 3.2) logs when providers initialize and the chat route (section 3.3) logs when fallback is activated.

### 8.2 Useful Railway Log Queries

```bash
# In Railway's log viewer, search by:

# All errors
level:50

# Specific request trace
requestId:abc123

# Rate limit events
"rate-limited"

# Shutdown events
"Graceful shutdown"

# Health check failures
"Health check returned non-ok"

# Slow requests (> 5 seconds)
# Note: search for duration values in pino output
duration:>5000
```

Railway also provides built-in metrics (CPU, memory, network) on the service dashboard — sufficient for the showcase.

---

## 9. Complete Environment Variable Reference

### 9.1 `.env.example`

```bash
# ╔══════════════════════════════════════════════════════════════╗
# ║  AI Chatbot — Complete Environment Configuration            ║
# ║  Copy to .env and fill in required values                   ║
# ║  Variables marked [REQUIRED] must be set                    ║
# ║  Variables marked [OPTIONAL] have sensible defaults         ║
# ╚══════════════════════════════════════════════════════════════╝

# ── Application ────────────────────────────────────────────────

# [OPTIONAL] Environment mode — controls log level, cookie security
NODE_ENV=development

# [OPTIONAL] Backend server port
PORT=8000

# ── Authentication ─────────────────────────────────────────────

# [REQUIRED] JWT signing secret — generate with: openssl rand -hex 32
# Must be at least 32 characters. NEVER commit this value.
JWT_SECRET=

# [OPTIONAL] Access token expiry in minutes (default: 60)
JWT_ACCESS_EXPIRE_MINUTES=60

# [OPTIONAL] Refresh token expiry in days (default: 7)
JWT_REFRESH_EXPIRE_DAYS=7

# [OPTIONAL] Cookie domain — leave empty for localhost
# Set to your Railway domain in production (e.g., .railway.app)
COOKIE_DOMAIN=

# [OPTIONAL] Cookie Secure flag — true in production, false for localhost
COOKIE_SECURE=false

# ── LLM Provider (Chat) ───────────────────────────────────────

# [OPTIONAL] Primary chat provider: gemini | openrouter | ollama
LLM_PROVIDER=gemini

# [REQUIRED] Google AI Studio API key — https://aistudio.google.com/apikey
GEMINI_API_KEY=

# [OPTIONAL] Gemini chat model
GEMINI_MODEL=gemini-2.5-flash

# ── Embedding Provider ─────────────────────────────────────────

# [OPTIONAL] Embedding provider — always gemini (for showcase)
EMBEDDING_PROVIDER=gemini

# [OPTIONAL] Gemini embedding model
GEMINI_EMBEDDING_MODEL=text-embedding-004

# ── Fallback LLM (OpenRouter) ─────────────────────────────────

# [OPTIONAL] OpenRouter API key — enables fallback when Gemini rate-limits
# Get a free key at: https://openrouter.ai/keys
OPENROUTER_API_KEY=

# [OPTIONAL] OpenRouter model — free models have :free suffix
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct:free

# ── Database ───────────────────────────────────────────────────

# [OPTIONAL] SQLite database file path
# Local dev: ./data/chatbot.db
# Railway with Volume: /data/chatbot.db
DATABASE_PATH=./data/chatbot.db

# ── CORS ───────────────────────────────────────────────────────

# [REQUIRED in production] Frontend URL for CORS origin
# Supports comma-separated values: https://app.vercel.app,https://custom.com
FRONTEND_URL=http://localhost:3000

# [OPTIONAL] Allow Vercel preview deployment URLs (*.vercel.app)
ALLOW_VERCEL_PREVIEWS=false

# ── File Storage ───────────────────────────────────────────────

# [OPTIONAL] Storage backend: local | r2
STORAGE_TYPE=local

# [OPTIONAL] Local upload directory
# Local dev: ./data/uploads
# Railway with Volume: /data/uploads
UPLOAD_DIR=./data/uploads

# [OPTIONAL] Maximum upload file size in MB
UPLOAD_MAX_SIZE_MB=25

# ── Cloudflare R2 (if STORAGE_TYPE=r2) ────────────────────────

# [REQUIRED if STORAGE_TYPE=r2] Cloudflare account ID
R2_ACCOUNT_ID=

# [REQUIRED if STORAGE_TYPE=r2] R2 API access key
R2_ACCESS_KEY=

# [REQUIRED if STORAGE_TYPE=r2] R2 API secret key
R2_SECRET_KEY=

# [REQUIRED if STORAGE_TYPE=r2] R2 bucket name
R2_BUCKET=

# ── Rate Limiting ──────────────────────────────────────────────

# [OPTIONAL] Auth endpoints: max requests per minute per IP
RATE_LIMIT_AUTH_PER_MINUTE=10

# [OPTIONAL] Chat endpoint: max messages per minute per user
RATE_LIMIT_CHAT_PER_MINUTE=30

# [OPTIONAL] Upload endpoint: max uploads per hour per user
RATE_LIMIT_UPLOAD_PER_HOUR=20

# ── Frontend (set in Vercel dashboard or .env.local) ───────────

# [REQUIRED] Backend API URL — set in Vercel dashboard
# NEXT_PUBLIC_API_URL=https://your-backend.railway.app/api/v1
```

**Design Rationale:**
- Every variable documented with `[REQUIRED]` or `[OPTIONAL]` markers.
- Grouped by functional area — easy to scan and configure.
- Comments explain where to get API keys and what values to use.
- Railway-specific paths noted (`/data/...`) alongside local dev paths.
- Sensitive values (`JWT_SECRET`, API keys) left blank with generation instructions.

---

## 10. Demo Preparation

### 10.1 Seed Script — `scripts/seed-demo.ts`

The seed script uses **service functions** (not raw DB inserts) to ensure password hashing, validation, and all side effects are applied correctly.

```typescript
// scripts/seed-demo.ts
//
// Run from project root:
//   pnpm --filter @chatbot/backend tsx scripts/seed-demo.ts
//
// This script uses the service layer to create demo data,
// ensuring passwords are hashed and all validation runs.

import { register } from "../src/services/auth.service.js";
import { createConversation, addMessage } from "../src/services/conversation.service.js";
import { log } from "../src/middleware/logger.js";

// Minimal mock context for auth service (cookies won't actually be set)
function createMockContext() {
  const headers = new Map<string, string>();
  return {
    header: (name: string, value: string) => headers.set(name, value),
    req: {
      header: () => "",
    },
  } as any;
}

async function seed() {
  log.info("Starting demo seed...");

  // 1. Create demo user via auth service (handles password hashing + validation)
  const mockContext = createMockContext();
  const demoUser = await register(
    {
      email: "demo@example.com",
      username: "demo",
      password: "DemoPass123!",
    },
    mockContext,
    "seed-script",
  );

  log.info({ userId: demoUser.id }, "Demo user created");

  // 2. Create sample conversation
  const conv = createConversation({
    userId: demoUser.id,
    title: "Getting started with the chatbot",
    model: "gemini-2.5-flash",
  });

  // 3. Add sample messages
  addMessage({
    conversationId: conv.id,
    role: "user",
    content: "What can you help me with?",
  });

  addMessage({
    conversationId: conv.id,
    role: "assistant",
    content: [
      "I can help with:",
      "",
      "- **General questions** -- ask me anything",
      "- **Document analysis** -- upload PDFs and ask questions about them",
      "- **Image understanding** -- paste or upload images for AI analysis",
      "- **Code help** -- write, explain, or debug code",
      "",
      "Try uploading a document or pasting an image to get started!",
    ].join("\n"),
    model: "gemini-2.5-flash",
  });

  // 4. Create a second conversation with a coding example
  const conv2 = createConversation({
    userId: demoUser.id,
    title: "Python quicksort example",
    model: "gemini-2.5-flash",
  });

  addMessage({
    conversationId: conv2.id,
    role: "user",
    content: "Write a quicksort in Python with type hints",
  });

  addMessage({
    conversationId: conv2.id,
    role: "assistant",
    content: [
      "Here is a quicksort implementation with type hints:",
      "",
      "```python",
      "def quicksort(arr: list[int]) -> list[int]:",
      '    """Sort a list of integers using quicksort."""',
      "    if len(arr) <= 1:",
      "        return arr",
      "",
      "    pivot = arr[len(arr) // 2]",
      "    left = [x for x in arr if x < pivot]",
      "    middle = [x for x in arr if x == pivot]",
      "    right = [x for x in arr if x > pivot]",
      "",
      "    return quicksort(left) + middle + quicksort(right)",
      "```",
      "",
      "This uses the list comprehension approach for clarity. The time complexity is O(n log n) on average, O(n^2) worst case.",
    ].join("\n"),
    model: "gemini-2.5-flash",
  });

  log.info("Demo seed complete");
  log.info("Login credentials: demo@example.com / DemoPass123!");
  process.exit(0);
}

seed().catch((err) => {
  log.error({ err: err.message }, "Seed failed");
  process.exit(1);
});
```

**Design Rationale:**
- Uses `register()` from `auth.service.ts` instead of raw `db.insert()` — ensures the password goes through `hashPassword()` with bcrypt (12 rounds), the Zod `registerInputSchema` validates the input, and the user ID is generated via nanoid.
- Uses `createConversation()` and `addMessage()` from `conversation.service.ts` — ensures `updatedAt` is touched, indexes are correct, and the data is consistent with what the application expects.
- Mock context is minimal — the seed script does not need actual HTTP cookies, but the `register()` function signature requires a context for `setAuthCookies()`.
- Two sample conversations — demonstrates both text chat and code rendering with syntax highlighting.
- Password `DemoPass123!` meets the strength requirements from S1 (uppercase, lowercase, number, special character).

### 10.2 Demo Script

```markdown
## Demo Flow (15 minutes)

### 1. Introduction (2 min)
- Show the login page — clean, modern UI
- Login with demo account (or register a new one)
- Point out: dark mode toggle, responsive sidebar

### 2. Basic Chat (3 min)
- Ask: "Explain the difference between REST and GraphQL"
- Show streaming response, markdown rendering
- Show code block with syntax highlighting + copy button
- Ask a follow-up question (demonstrates context retention)

### 3. Document Intelligence (4 min)
- Upload a sample company PDF
- Show document library — processing status indicator
- Enable "Search my documents" toggle
- Ask: "What are the key findings in this report?"
- Point out citations [Source: report.pdf, p.3]

### 4. Image Understanding (3 min)
- Paste a screenshot from clipboard
- Ask: "What does this chart show?"
- Drag & drop a photo
- Ask: "Describe this image in detail"

### 5. Polish Features (2 min)
- Show conversation sidebar — grouped by date
- Rename a conversation
- Toggle dark/light mode
- Show mobile layout (resize browser)

### 6. Architecture Summary (1 min)
- Same codebase → swap env var → production
- Free tier: $0/month
- Production: self-hosted, Ollama, full privacy
```

---

## 11. Performance Optimizations

### 11.1 Frontend

```typescript
// next.config.ts additions
const config: NextConfig = {
  // Enable React Compiler (automatic memoization — React 19)
  experimental: {
    reactCompiler: true,
  },

  // Bundle analysis (dev only)
  // "next-bundle-analyzer": "^0.7.0"
};
```

### 11.2 Backend

SQLite performance tuning is already configured in S1 (`src/db/index.ts`):

```typescript
// Reference only — already implemented in S1 (section 6.4)
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("cache_size = -64000");  // 64MB cache
sqlite.pragma("temp_store = MEMORY");
sqlite.pragma("foreign_keys = ON");
```

### 11.3 Optimized Image Loading

```tsx
// In chat messages — use Next.js Image for optimized serving
import Image from "next/image";

<Image
  src={`${process.env.NEXT_PUBLIC_API_URL}/images/${path}`}
  alt="Uploaded"
  width={400}
  height={300}
  loading="lazy"
  className="rounded-lg"
/>
```

---

## 12. Deployment Checklist

### Pre-Deploy

```markdown
- [ ] All tests pass locally (`pnpm test`)
- [ ] Build succeeds (`pnpm build`)
- [ ] No hardcoded localhost URLs in frontend code
- [ ] `.env.example` is complete and up to date
- [ ] `.dockerignore` is present in backend/
- [ ] Dockerfile builds successfully: `docker build -f backend/Dockerfile .`
```

### Railway (Backend)

```markdown
- [ ] Create new project in Railway dashboard
- [ ] Connect GitHub repository
- [ ] Add a Volume: mount at `/data`, 1 GB
- [ ] Set environment variables (see section 9.1):
  - NODE_ENV=production
  - PORT=8000
  - GEMINI_API_KEY=<from Google AI Studio>
  - JWT_SECRET=<generate: openssl rand -hex 32>
  - FRONTEND_URL=https://<your-app>.vercel.app
  - LLM_PROVIDER=gemini
  - DATABASE_PATH=/data/chatbot.db
  - UPLOAD_DIR=/data/uploads
  - STORAGE_TYPE=local
  - COOKIE_SECURE=true
  - OPENROUTER_API_KEY=<optional, for fallback>
- [ ] Deploy and wait for healthcheck to pass
- [ ] Verify: GET https://<your-backend>.railway.app/api/v1/health
  - Status should show all checks "ok"
- [ ] Note the Railway URL for Vercel config
```

### Vercel (Frontend)

```markdown
- [ ] Import GitHub repo in Vercel dashboard
- [ ] Set root directory: `frontend`
- [ ] Set framework preset: Next.js
- [ ] Set environment variables:
  - NEXT_PUBLIC_API_URL=https://<your-backend>.railway.app/api/v1
- [ ] Deploy and verify login page loads
- [ ] Note the Vercel URL for Railway CORS config
```

### Post-Deploy Verification

```markdown
- [ ] Update FRONTEND_URL in Railway with the actual Vercel URL
- [ ] Redeploy Railway (or wait for config to propagate)
- [ ] Register a test account via the Vercel URL
- [ ] Send a chat message — verify streaming works
- [ ] Upload a PDF — verify RAG works
- [ ] Paste an image — verify vision works
- [ ] Test dark mode toggle
- [ ] Test mobile layout (resize browser to 375px)
- [ ] Run the seed script for demo data
- [ ] Share URL with 2-3 testers
```

---

## 13. Testing Strategy (S5)

### Integration Tests

| Test | Steps |
|------|-------|
| Full flow | Register -> create conversation -> send message -> get response |
| RAG flow | Upload PDF -> ask question -> get answer with citations |
| Image flow | Upload image -> ask about it -> get description |
| Fallback | Simulate Gemini 429 -> verify OpenRouter takes over |
| Error handling | Invalid token -> verify 401 with requestId + redirect to login |
| Health endpoint | GET /health -> verify all subsystem checks returned |
| Graceful shutdown | Send SIGTERM -> verify streams abort, DB closes cleanly |
| Mobile | Resize to 375px -> verify sidebar overlay + responsive layout |

### Manual QA Checklist

```markdown
- [ ] Register new account
- [ ] Login with existing account
- [ ] Create new conversation
- [ ] Send message -> streaming response
- [ ] Markdown: bold, italic, headers, lists, code blocks
- [ ] Code blocks: syntax highlighting + copy button
- [ ] Stop generation button works
- [ ] Conversation sidebar: create, rename, delete
- [ ] Sidebar grouping: Today / Yesterday / Last 7 days
- [ ] Upload PDF -> status shows "indexed"
- [ ] Ask question with RAG -> citations shown
- [ ] Upload image in chat -> AI describes it
- [ ] Paste image from clipboard -> preview shown
- [ ] Dark mode toggle -> persists on reload
- [ ] Mobile layout -> sidebar collapses
- [ ] System prompt per conversation
- [ ] Refresh page -> conversation history loads
- [ ] Token refresh -> session persists without re-login
- [ ] Large message -> scrolls correctly
- [ ] Network error -> toast notification with requestId
- [ ] Health endpoint -> returns subsystem statuses
- [ ] All error responses include requestId
```

---

## 14. Known Limitations to Communicate

| Limitation | Impact | Workaround |
|------------|--------|-----------|
| 250 req/day (Gemini) | ~125 back-and-forth messages | Auto-fallback to OpenRouter |
| 10 req/min (Gemini) | Brief pauses under heavy use | Rate limit retry with backoff |
| SQLite (single writer) | ~15 concurrent users max | Sufficient for demo |
| No 2FA | Demo simplicity | Planned for production |
| No encryption at rest | Demo simplicity | Planned for production |
| Data on Google servers | Cloud API requirement | Production uses local Ollama |
| Free hosting limits | Railway: 512MB RAM | Sufficient for demo |
| Railway Volume single AZ | Data on one disk | Snapshots available in dashboard |

---

## 15. Definition of Done

Phase S5 is complete when:

1. Backend deployed to Railway with persistent Volume, `GET /health` returns 200 with all subsystem checks
2. Frontend deployed to Vercel, login page loads at public URL
3. Full demo flow works: register -> chat -> upload doc -> RAG -> image -> dark mode
4. Rate limit fallback to OpenRouter tested and working
5. Error states show user-friendly toast notifications with requestId (not raw errors)
6. Loading skeletons visible during data fetches
7. Empty states guide users on what to do
8. Mobile responsive at 375px width
9. CORS correctly configured for Vercel production URL (and preview deploys if enabled)
10. Graceful shutdown tested: SIGTERM aborts streams, closes DB, exits cleanly
11. Health endpoint returns DB connectivity, LLM health, storage status, uptime, version
12. Demo user account seeded via service functions with sample conversations
13. `.env.example` documents ALL variables from all phases with descriptions
14. Dockerfile uses `pnpm deploy --prod`, `.dockerignore` present, HEALTHCHECK instruction added
15. All Vitest tests pass
16. Demo script prepared and practiced
17. URL shared with at least 3 stakeholders for testing
18. All known bugs from S1-S4 fixed

---

## 16. Post-Deploy: What Comes Next

After successful showcase demo:

1. **Collect feedback** from stakeholders (features, UX, performance)
2. **Decision point**: Proceed to Production (Version B)?
3. If yes, Phase P1 starts: Infrastructure Migration
   - TypeScript backend stays — add PostgreSQL (via `drizzle-orm/node-postgres`)
   - Add Redis (via `ioredis`)
   - Add Qdrant (via `@qdrant/js-client-rest`)
   - Swap `LLM_PROVIDER=gemini` to `LLM_PROVIDER=ollama`
   - Docker Compose for all services
4. Same codebase, upgraded infrastructure — TypeScript all the way through
