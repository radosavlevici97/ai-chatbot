# Phase S2 — Full Chat Experience

> **Timeline:** Week 2 | **Goal:** Complete ChatGPT-like conversation experience
> **Depends on:** Phase S1 (auth, basic chat, streaming)
> **Delivers to:** Phase S3

---

## 1. Objectives

| # | Objective | Acceptance Criteria |
|---|-----------|-------------------|
| 1 | Conversation CRUD | Create, list (cursor-paginated), get, rename, delete conversations via API |
| 2 | Message persistence | User + assistant messages saved atomically inside `db.transaction()` |
| 3 | Context window management | Token-aware truncation sends maximum history within model limits |
| 4 | Sidebar with TanStack Query | Conversation list via `useQuery` with cursor pagination, mutations with `invalidateQueries` |
| 5 | Markdown rendering | Bold, italic, headers, lists, tables, code blocks with syntax highlighting |
| 6 | Stop generation | Click button to abort active SSE stream |
| 7 | System prompts | Per-conversation custom instructions |
| 8 | Theme toggle | Dark/light mode persisted via `next-themes` |
| 9 | Responsive layout | Sidebar collapses on mobile, chat fills viewport |
| 10 | Auto-title generation | Non-streaming `generateContent` call for title after first exchange |
| 11 | Image cleanup on delete | Conversation deletion removes associated image files from disk |
| 12 | Rate-limited CRUD | Conversation routes protected by rate limiter middleware |

---

## 2. New Shared Schemas & Types

S1 already established the shared package structure. S2 references and extends it. The conversation schemas and types below were **defined in S1** inside `packages/shared/src/schemas/conversation.ts` and `packages/shared/src/types/conversation.ts` respectively. We reference them here for clarity but do **not** redefine them.

### 2.1 Conversation Schemas — `packages/shared/src/schemas/conversation.ts` (from S1)

```typescript
import { z } from "zod";

export const createConversationSchema = z.object({
  title: z.string().max(500).optional(),
  model: z.string().default("gemini-2.5-flash"),
  systemPrompt: z.string().max(10_000).optional(),
});

export const updateConversationSchema = z.object({
  title: z.string().max(500).optional(),
  model: z.string().optional(),
  systemPrompt: z.string().max(10_000).optional(),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
```

### 2.2 Conversation Types — `packages/shared/src/types/conversation.ts` (from S1)

```typescript
import type { Message } from "./chat.js";

export type Conversation = {
  id: string;
  userId: string;
  title: string | null;
  model: string;
  systemPrompt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConversationListItem = {
  id: string;
  title: string | null;
  model: string;
  updatedAt: string;
  createdAt: string;
};

export type ConversationWithMessages = Conversation & {
  messages: Message[];
};
```

### 2.3 Pagination Schema — `packages/shared/src/schemas/common.ts` (from S1)

The `paginationSchema` established in S1 is reused for the conversation list endpoint:

```typescript
import { z } from "zod";

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
```

### 2.4 Existing `sendMessageInputSchema` — Reference Only

The `sendMessageInputSchema` in `packages/shared/src/schemas/chat.ts` already includes the `useDocuments` field (added in S1 for S3 forward-compatibility). S2 references it directly from `@chatbot/shared` and does **not** redefine or extend it.

**Design Rationale:**
- All schemas live in `@chatbot/shared` — single source of truth for frontend and backend validation
- `paginationSchema` reused identically for conversation list, future document list, and future message history endpoints
- `sendMessageInputSchema` already contains all fields S2 needs — no inline redefinition required

---

## 3. Backend Components

### 3.1 Database Schema — No Changes Required

The `conversations` and `messages` tables with their indexes were defined in S1's `src/db/schema.ts`. No schema additions are needed for S2:

- `conversations_user_updated_idx` composite index on `(userId, updatedAt)` — powers cursor-paginated sidebar listing
- `messages_conversation_idx` index on `conversationId` — fast conversation message loading

### 3.2 Conversation Service — `src/services/conversation.service.ts`

```typescript
import { eq, and, desc, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import { conversations, messages } from "../db/schema.js";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";
import { log } from "../middleware/logger.js";
import { cleanupConversationImages } from "../lib/storage.js";
import type {
  CreateConversationInput,
  UpdateConversationInput,
  PaginationInput,
  PaginatedResponse,
  ConversationListItem,
} from "@chatbot/shared";

// ── Create ───────────────────────────────────────

export function createConversation(
  input: CreateConversationInput & { userId: string },
  requestId: string,
): typeof conversations.$inferSelect {
  const id = nanoid();

  db.insert(conversations)
    .values({ id, userId: input.userId, title: input.title, model: input.model, systemPrompt: input.systemPrompt })
    .run();

  log.info({ requestId, conversationId: id, userId: input.userId }, "Conversation created");

  return db.select().from(conversations).where(eq(conversations.id, id)).get()!;
}

// ── List with cursor-based pagination ────────────

export function listConversations(
  userId: string,
  pagination: PaginationInput,
): PaginatedResponse<ConversationListItem> {
  const { cursor, limit } = pagination;

  // Build query: WHERE userId = ? AND (updatedAt < cursor if provided)
  // ORDER BY updatedAt DESC, LIMIT limit + 1 (to detect hasMore)
  let query = db
    .select({
      id: conversations.id,
      title: conversations.title,
      model: conversations.model,
      updatedAt: conversations.updatedAt,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(
      cursor
        ? and(eq(conversations.userId, userId), lt(conversations.updatedAt, cursor))
        : eq(conversations.userId, userId),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(limit + 1);

  const rows = query.all();

  // If we got limit+1 rows, there are more pages
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].updatedAt : null;

  return { data, nextCursor };
}

// ── Get single ───────────────────────────────────

export function getConversation(
  id: string,
  userId: string,
): typeof conversations.$inferSelect {
  const conv = db.select().from(conversations).where(eq(conversations.id, id)).get();

  if (!conv) throw new NotFoundError("Conversation");
  if (conv.userId !== userId) throw new ForbiddenError();

  return conv;
}

// ── Get messages ─────────────────────────────────

export function getConversationMessages(
  conversationId: string,
  userId: string,
): (typeof messages.$inferSelect)[] {
  // Verify ownership first
  getConversation(conversationId, userId);

  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt)
    .all();
}

// ── Update (rename, change model, system prompt) ─

export function updateConversation(
  id: string,
  userId: string,
  input: UpdateConversationInput,
): typeof conversations.$inferSelect {
  getConversation(id, userId);

  db.update(conversations)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(eq(conversations.id, id))
    .run();

  return db.select().from(conversations).where(eq(conversations.id, id)).get()!;
}

// ── Delete (with image cleanup) ──────────────────

export function deleteConversation(
  id: string,
  userId: string,
  requestId: string,
): void {
  const conv = getConversation(id, userId);

  // Gather image paths from message attachments before cascade-deleting
  const msgs = db
    .select({ attachments: messages.attachments })
    .from(messages)
    .where(eq(messages.conversationId, id))
    .all();

  // Delete conversation (messages cascade-deleted via FK)
  db.delete(conversations).where(eq(conversations.id, id)).run();

  // Clean up image files asynchronously (best-effort, don't block response)
  cleanupConversationImages(msgs).catch((err) => {
    log.warn({ requestId, conversationId: id, err: (err as Error).message }, "Image cleanup failed");
  });

  log.info({ requestId, conversationId: id, userId }, "Conversation deleted");
}

// ── Add message (atomic with updatedAt touch) ────

export function addMessage(input: {
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string;
  tokensPrompt?: number;
  tokensCompletion?: number;
  attachments?: string;
}): typeof messages.$inferSelect {
  const id = nanoid();

  // Atomic: insert message AND update conversation.updatedAt in one transaction
  db.transaction((tx) => {
    tx.insert(messages).values({ id, ...input }).run();

    tx.update(conversations)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(conversations.id, input.conversationId))
      .run();
  });

  return db.select().from(messages).where(eq(messages.id, id)).get()!;
}
```

**Design Rationale:**
- **`db.transaction()` in `addMessage()`** — FIX #1. The message insert and `conversations.updatedAt` touch are atomic. If either fails, both roll back. The original code had two separate `.run()` calls that could leave the conversation with a stale `updatedAt` if the second call failed.
- **Cursor-based pagination in `listConversations()`** — FIX #2. Uses `updatedAt` as cursor since the list is sorted by `updatedAt DESC`. Fetches `limit + 1` rows to detect whether more pages exist. Returns `PaginatedResponse<ConversationListItem>` from shared types.
- **Image cleanup in `deleteConversation()`** — FIX #10. Before cascade-deleting messages, gathers all attachment paths from messages. After deletion, asynchronously removes orphaned image files. Failures are logged but don't block the API response.
- **Structured logging** — FIX #7. Uses `log` from pino instead of `console.log`. Logs conversation create and delete operations with `requestId` correlation.
- **Shared schemas** — FIX #8. All input types reference `@chatbot/shared` — no inline Zod schemas in the service layer.

### 3.3 Image Cleanup Utility — `src/lib/storage.ts` (Addition)

Add this function to the existing storage abstraction from S1:

```typescript
import { unlink } from "node:fs/promises";
import { log } from "../middleware/logger.js";

type MessageAttachmentRow = {
  attachments: string | null;
};

type Attachment = {
  type: string;
  storagePath: string;
  mimeType: string;
};

/**
 * Remove image files associated with conversation messages.
 * Called after conversation deletion. Best-effort: logs warnings on failure.
 */
export async function cleanupConversationImages(
  messageRows: MessageAttachmentRow[],
): Promise<void> {
  const paths: string[] = [];

  for (const row of messageRows) {
    if (!row.attachments) continue;
    try {
      const parsed: Attachment[] = JSON.parse(row.attachments);
      for (const att of parsed) {
        if (att.storagePath) paths.push(att.storagePath);
      }
    } catch {
      // Malformed JSON — skip
    }
  }

  await Promise.allSettled(
    paths.map(async (filePath) => {
      try {
        await unlink(filePath);
      } catch (err) {
        // File may already be gone — log at debug level
        log.debug({ filePath, err: (err as Error).message }, "Could not delete image file");
      }
    }),
  );
}
```

**Design Rationale:**
- FIX #10 implementation. Parses the JSON `attachments` column from each message to extract file paths.
- Uses `Promise.allSettled` so one failed deletion does not block others.
- Logs at `debug` level for missing files (common during dev) and `warn` level at the caller for unexpected failures.
- Prepared for S4 (Image Understanding) which will populate the `attachments` column.

### 3.4 Context Window Management — `src/services/context.service.ts`

```typescript
import type { ChatMessage } from "./llm/base.js";
import { log } from "../middleware/logger.js";

// ── Token estimation ─────────────────────────────
// Gemini uses ~1 token per 4 characters for English text.
// This is a conservative estimate; actual tokenization varies.
const CHARS_PER_TOKEN = 4;

// Gemini 2.5 Flash context window: 1,048,576 tokens
// Reserve space for system prompt + response generation
const DEFAULT_MAX_CONTEXT_TOKENS = 128_000;
const RESPONSE_RESERVE_TOKENS = 8_192;

/**
 * Estimate token count for a message.
 * Uses character-based heuristic rather than calling the tokenizer API
 * (which would add latency and quota usage per message).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Build a context-window-aware message list for the LLM.
 *
 * Strategy:
 * 1. Always include the system prompt (if any).
 * 2. Always include the most recent user message (the one being responded to).
 * 3. Fill remaining budget with messages from most-recent to oldest.
 * 4. If even the system prompt + latest message exceed the budget, send them
 *    anyway (the model will handle truncation internally).
 *
 * This replaces the naive "keep last N messages" approach.
 */
export function buildContextMessages(
  allMessages: { role: "user" | "assistant" | "system"; content: string }[],
  systemPrompt: string | null,
  options?: {
    maxContextTokens?: number;
    responseReserveTokens?: number;
  },
): ChatMessage[] {
  const maxTokens = options?.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS;
  const reserveTokens = options?.responseReserveTokens ?? RESPONSE_RESERVE_TOKENS;
  const budget = maxTokens - reserveTokens;

  const result: ChatMessage[] = [];
  let usedTokens = 0;

  // 1. System prompt always included
  if (systemPrompt) {
    const systemTokens = estimateTokens(systemPrompt);
    result.push({ role: "system", content: systemPrompt });
    usedTokens += systemTokens;
  }

  // 2. Separate the latest user message (always included)
  const latestMessage = allMessages[allMessages.length - 1];
  const latestTokens = latestMessage ? estimateTokens(latestMessage.content) : 0;
  usedTokens += latestTokens;

  // 3. Fill from most-recent-to-oldest (excluding the latest, which we handle separately)
  const historyMessages = allMessages.slice(0, -1);
  const includedHistory: ChatMessage[] = [];

  for (let i = historyMessages.length - 1; i >= 0; i--) {
    const msg = historyMessages[i];
    const msgTokens = estimateTokens(msg.content);

    if (usedTokens + msgTokens > budget) {
      // Budget exceeded — stop adding older messages
      log.debug(
        {
          truncatedAt: i,
          totalMessages: allMessages.length,
          usedTokens,
          budget,
        },
        "Context window truncated",
      );
      break;
    }

    includedHistory.unshift({ role: msg.role, content: msg.content });
    usedTokens += msgTokens;
  }

  // 4. Assemble: system prompt + included history + latest message
  result.push(...includedHistory);
  if (latestMessage) {
    result.push({ role: latestMessage.role, content: latestMessage.content });
  }

  return result;
}
```

**Design Rationale:**
- FIX #12. Replaces the naive `history.slice(-MAX_HISTORY)` with token-aware truncation. The original approach blindly kept the last 50 messages regardless of length, which could either waste context (50 short messages = few tokens) or exceed the window (50 long messages with code blocks).
- Character-based estimation (`length / 4`) is fast and avoids API calls to the tokenizer. The 4:1 ratio is conservative for English; other languages may differ, but overshooting is safer than undershooting.
- Always includes the system prompt and the latest user message — these are never truncated.
- Fills remaining budget from most-recent to oldest, preserving conversational recency.
- `DEFAULT_MAX_CONTEXT_TOKENS` set to 128K (well within Gemini 2.5 Flash's 1M window) to leave room for response and avoid excessive latency from very long contexts.

### 3.5 Title Generation Service — `src/services/title.service.ts`

```typescript
import { GoogleGenAI } from "@google/genai";
import { env } from "../env.js";
import { log } from "../middleware/logger.js";

const TITLE_PROMPT = `Generate a short title (max 6 words) for this conversation.
Return ONLY the title, no quotes, no explanation.`;

/**
 * Generate a conversation title using a non-streaming generateContent call.
 *
 * Uses a direct (non-streaming) call because:
 * - Title is short (< 10 tokens) — streaming adds overhead with no UX benefit
 * - Simpler error handling — single await, no async generator
 * - Lower latency for short outputs
 */
export async function generateTitle(
  firstUserMessage: string,
  requestId: string,
): Promise<string> {
  try {
    const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

    const response = await client.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: [
        { role: "user", parts: [{ text: firstUserMessage }] },
      ],
      config: {
        temperature: 0.3,
        maxOutputTokens: 30,
        systemInstruction: TITLE_PROMPT,
      },
    });

    const title = response.text?.trim().slice(0, 100) || "New conversation";

    log.debug({ requestId, title }, "Auto-title generated");
    return title;
  } catch (err) {
    log.warn({ requestId, err: (err as Error).message }, "Title generation failed, using fallback");
    return "New conversation";
  }
}
```

**Design Rationale:**
- FIX #11. Uses `generateContent` (non-streaming) instead of `streamChat()`. Title is ~5 tokens — streaming adds unnecessary complexity (async generator, chunked assembly) for zero UX benefit. A single `await` call is simpler, faster, and easier to error-handle.
- Falls back to `"New conversation"` on failure — title generation should never block or error the chat flow.
- Uses pino `log` (FIX #7) instead of `console.log`.
- `temperature: 0.3` for deterministic, concise titles.

### 3.6 Conversation Routes — `src/routes/conversation.routes.ts`

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createConversationSchema,
  updateConversationSchema,
  paginationSchema,
} from "@chatbot/shared";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limiter.js";
import { env } from "../env.js";
import * as convService from "../services/conversation.service.js";
import type { AppEnv } from "../app.js";

const convRouter = new Hono<AppEnv>();

// ── Rate limiter for conversation CRUD ───────────
const convLimiter = rateLimit("conversations", {
  windowMs: 60_000,
  max: 60,
  keyFn: (c) => c.get("userId"),
  message: "Too many conversation operations. Please slow down.",
});

// ── List conversations (cursor-paginated) ────────
convRouter.get(
  "/conversations",
  requireAuth,
  convLimiter,
  zValidator("query", paginationSchema),
  (c) => {
    const userId = c.get("userId");
    const pagination = c.req.valid("query");
    const result = convService.listConversations(userId, pagination);
    return c.json(result);
  },
);

// ── Create conversation ──────────────────────────
convRouter.post(
  "/conversations",
  requireAuth,
  convLimiter,
  zValidator("json", createConversationSchema),
  (c) => {
    const userId = c.get("userId");
    const requestId = c.get("requestId");
    const input = c.req.valid("json");
    const conv = convService.createConversation({ ...input, userId }, requestId);
    return c.json({ data: conv }, 201);
  },
);

// ── Get conversation with messages ───────────────
convRouter.get(
  "/conversations/:id",
  requireAuth,
  convLimiter,
  (c) => {
    const userId = c.get("userId");
    const conv = convService.getConversation(c.req.param("id"), userId);
    const msgs = convService.getConversationMessages(c.req.param("id"), userId);
    return c.json({ data: { ...conv, messages: msgs } });
  },
);

// ── Update conversation ──────────────────────────
convRouter.put(
  "/conversations/:id",
  requireAuth,
  convLimiter,
  zValidator("json", updateConversationSchema),
  (c) => {
    const userId = c.get("userId");
    const updated = convService.updateConversation(
      c.req.param("id"),
      userId,
      c.req.valid("json"),
    );
    return c.json({ data: updated });
  },
);

// ── Delete conversation ──────────────────────────
convRouter.delete(
  "/conversations/:id",
  requireAuth,
  convLimiter,
  (c) => {
    const userId = c.get("userId");
    const requestId = c.get("requestId");
    convService.deleteConversation(c.req.param("id"), userId, requestId);
    return c.json({ data: { deleted: true } });
  },
);

export { convRouter };
```

**Design Rationale:**
- **Rate limiting on all CRUD routes** — FIX #6. Uses the `rateLimit` middleware from S1 with a `"conversations"` store. 60 operations/minute per user is generous for normal use but prevents abuse.
- **Shared schemas for validation** — FIX #8. Uses `createConversationSchema`, `updateConversationSchema`, and `paginationSchema` directly from `@chatbot/shared`. No inline `z.object()` definitions.
- **`requestId` passed to service functions** — FIX #5. Enables correlated error responses and structured logging throughout the call chain.
- **Consistent error responses** — FIX #5. All errors flow through the `AppError` hierarchy and the `errorHandler` middleware from S1, which always includes `requestId` in the response body.

### 3.7 Updated Chat Route — `src/routes/chat.routes.ts`

This is the full updated chat route, replacing the S1 skeleton with message persistence, context-window management, and auto-title generation.

```typescript
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { sendMessageInputSchema } from "@chatbot/shared";
import type { StreamChunk } from "@chatbot/shared";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limiter.js";
import { getChatProvider } from "../services/llm/factory.js";
import { buildContextMessages } from "../services/context.service.js";
import { generateTitle } from "../services/title.service.js";
import * as convService from "../services/conversation.service.js";
import { log } from "../middleware/logger.js";
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

    // 1. Verify ownership
    const conv = convService.getConversation(conversationId, userId);

    // 2. Persist user message (atomic with updatedAt touch)
    convService.addMessage({
      conversationId,
      role: "user",
      content: input.content,
    });

    // 3. Load full conversation history
    const history = convService.getConversationMessages(conversationId, userId);

    // 4. Build context-aware message list (token-limited)
    const llmMessages = buildContextMessages(
      history.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
      conv.systemPrompt,
    );

    // 5. Stream LLM response
    const llm = getChatProvider();

    return streamSSE(c, async (stream) => {
      let fullResponse = "";

      for await (const chunk of llm.streamChat(llmMessages, {
        model: input.model ?? conv.model,
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
              data: JSON.stringify({
                finishReason: chunk.finishReason,
                usage: chunk.usage,
              }),
            });
            break;

          case "error":
            await stream.writeSSE({
              event: "error",
              data: JSON.stringify({
                error: chunk.error,
                code: chunk.code,
                requestId,
              }),
            });
            break;

          // Forward citation and info events (used by S3 RAG)
          case "citation":
            await stream.writeSSE({
              event: "citation",
              data: JSON.stringify(chunk),
            });
            break;

          case "info":
            await stream.writeSSE({
              event: "info",
              data: JSON.stringify({ message: chunk.message }),
            });
            break;
        }
      }

      // 6. Persist assistant response (atomic)
      if (fullResponse) {
        convService.addMessage({
          conversationId,
          role: "assistant",
          content: fullResponse,
          model: input.model ?? conv.model,
        });

        // 7. Auto-generate title on first exchange
        // history.length === 1 means only the user message we just added exists
        if (history.length <= 1 && !conv.title) {
          try {
            const title = await generateTitle(input.content, requestId);
            convService.updateConversation(conversationId, userId, { title });

            await stream.writeSSE({
              event: "title",
              data: JSON.stringify({ title }),
            });
          } catch (err) {
            log.warn(
              { requestId, conversationId, err: (err as Error).message },
              "Auto-title generation failed",
            );
            // Non-fatal — conversation works without a title
          }
        }
      }
    });
  },
);

export { chat };
```

**Design Rationale:**
- **`buildContextMessages()` replaces `slice(-MAX_HISTORY)`** — FIX #12. Token-aware truncation sends maximum useful context without exceeding the model's window.
- **`addMessage()` uses `db.transaction()`** — FIX #1. Both the user message and assistant message persist atomically with the `updatedAt` touch.
- **Error SSE events include `requestId`** — FIX #5. Frontend can display or report the request ID for debugging.
- **`generateTitle()` uses non-streaming call** — FIX #11. Simpler, faster for short outputs.
- **`sendMessageInputSchema` imported from `@chatbot/shared`** — FIX #8/9. No local schema redefinition.
- **Structured logging throughout** — FIX #7.
- **All SSE event types from the `StreamChunk` discriminated union** are forwarded, including `citation` and `info` for S3 forward-compatibility.

### 3.8 Route Registration — `src/routes/index.ts`

```typescript
import { Hono } from "hono";
import { auth } from "./auth.routes.js";
import { chat } from "./chat.routes.js";
import { convRouter } from "./conversation.routes.js";
import { health } from "./health.routes.js";
import type { AppEnv } from "../app.js";

const routes = new Hono<AppEnv>();

routes.route("/auth", auth);
routes.route("/", chat);            // /conversations/:id/messages
routes.route("/", convRouter);      // /conversations CRUD
routes.route("/", health);

export { routes };
```

### 3.9 Environment Config Addition

Add the conversation rate limit to `src/env.ts`:

```typescript
// Add to envSchema (inside the existing z.object)
RATE_LIMIT_CONVERSATION_PER_MINUTE: z.coerce.number().default(60),
```

---

## 4. Frontend Components

### 4.1 New/Updated Files Overview

```
frontend/src/
├── app/
│   └── (chat)/
│       ├── layout.tsx                # UPDATED: Sidebar + main content area
│       ├── page.tsx                  # UPDATED: New conversation landing
│       └── c/
│           └── [id]/
│               └── page.tsx          # NEW: Single conversation view
├── components/
│   ├── chat/
│   │   ├── chat-view.tsx             # UPDATED: Load history, persist
│   │   ├── chat-message.tsx          # UPDATED: Markdown rendering
│   │   ├── chat-input.tsx            # UPDATED: Stop button, system prompt
│   │   └── markdown-renderer.tsx     # NEW: react-markdown + shiki
│   ├── sidebar/
│   │   ├── sidebar.tsx               # NEW: Sidebar container (TanStack Query)
│   │   ├── conversation-list.tsx     # NEW: Grouped conversation list
│   │   └── conversation-item.tsx     # NEW: Single item with rename/delete
│   └── theme/
│       └── theme-toggle.tsx          # NEW: Dark/light mode switch
├── stores/
│   └── ui-store.ts                   # UPDATED: sidebarOpen only (no server state)
└── hooks/
    └── use-conversations.ts          # NEW: TanStack Query hooks for CRUD
```

### 4.2 New Dependencies

```json
{
  "react-markdown": "^9.0.0",
  "remark-gfm": "^4.0.0",
  "rehype-shiki": "^0.0.10",
  "@shikijs/rehype": "^2.5.0",
  "shiki": "^2.5.0"
}
```

### 4.3 Conversation Hooks — TanStack Query — `src/hooks/use-conversations.ts`

```typescript
"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  ConversationListItem,
  ConversationWithMessages,
  CreateConversationInput,
  UpdateConversationInput,
  PaginatedResponse,
} from "@chatbot/shared";

// ── Query Keys ───────────────────────────────────
export const conversationKeys = {
  all: ["conversations"] as const,
  list: () => [...conversationKeys.all, "list"] as const,
  detail: (id: string) => [...conversationKeys.all, "detail", id] as const,
};

// ── List conversations (infinite scroll / cursor pagination) ──

export function useConversations() {
  return useInfiniteQuery({
    queryKey: conversationKeys.list(),
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set("cursor", pageParam);
      params.set("limit", "20");
      return api.get<PaginatedResponse<ConversationListItem>>(
        `/conversations?${params.toString()}`,
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}

// ── Get single conversation with messages ────────

export function useConversation(id: string) {
  return useQuery({
    queryKey: conversationKeys.detail(id),
    queryFn: () => api.get<ConversationWithMessages>(`/conversations/${id}`),
    enabled: !!id,
  });
}

// ── Create conversation ──────────────────────────

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateConversationInput) =>
      api.post<ConversationWithMessages>("/conversations", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
    },
  });
}

// ── Rename conversation ──────────────────────────

export function useRenameConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.put<ConversationWithMessages>(`/conversations/${id}`, { title }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
      queryClient.invalidateQueries({ queryKey: conversationKeys.detail(id) });
    },
  });
}

// ── Delete conversation ──────────────────────────

export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete<{ deleted: boolean }>(`/conversations/${id}`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
      queryClient.removeQueries({ queryKey: conversationKeys.detail(id) });
    },
  });
}

// ── Update title from SSE (called after auto-title) ──

export function useUpdateConversationTitle() {
  const queryClient = useQueryClient();

  return (id: string, title: string) => {
    // Optimistically update the list cache
    queryClient.setQueriesData(
      { queryKey: conversationKeys.list() },
      (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: PaginatedResponse<ConversationListItem>) => ({
            ...page,
            data: page.data.map((conv) =>
              conv.id === id ? { ...conv, title } : conv,
            ),
          })),
        };
      },
    );
  };
}
```

**Design Rationale:**
- FIX #3. **TanStack Query replaces `useSidebarStore`** for all server state. The original `useSidebarStore` used Zustand with manual `fetchConversations()`, `addConversation()`, `updateTitle()`, and `removeConversation()` — duplicating what TanStack Query provides out of the box.
- **`useInfiniteQuery`** for the conversation list — supports cursor-based pagination with "load more" or infinite scroll (FIX #2 frontend counterpart).
- **Structured query keys** via `conversationKeys` factory — enables precise cache invalidation. Creating a conversation invalidates the list; deleting one also removes the detail cache.
- **`useUpdateConversationTitle()`** provides an optimistic cache update when the SSE `title` event arrives — the sidebar title updates instantly without a refetch.
- **`credentials: "include"` in all `api.*` calls** — FIX #4. The `api` client from S1 already sets `credentials: "include"` on every request. No `Authorization: Bearer` headers, no `localStorage.getItem("access_token")`.

### 4.4 UI-Only Zustand Store — `src/stores/ui-store.ts`

```typescript
import { create } from "zustand";

type UIState = {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
};

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
```

**Design Rationale:**
- FIX #3. Zustand is used **only** for the `sidebarOpen` boolean — pure UI state with no server interaction. All server state (conversation list, conversation detail) is managed by TanStack Query hooks.
- The old `useSidebarStore` with `conversations`, `fetchConversations`, `addConversation`, `updateTitle`, `removeConversation` is **removed entirely**.

### 4.5 Sidebar Component — `src/components/sidebar/sidebar.tsx`

```tsx
"use client";

import { useRouter, usePathname } from "next/navigation";
import { Plus, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui-store";
import { useConversations, useCreateConversation } from "@/hooks/use-conversations";
import { ConversationList } from "./conversation-list";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useMediaQuery } from "@/hooks/use-media-query";

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useMediaQuery("(max-width: 768px)");

  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore();

  // TanStack Query: conversation list with infinite pagination
  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useConversations();

  const createMutation = useCreateConversation();

  // Flatten paginated results into a single array
  const conversations = data?.pages.flatMap((page) => page.data) ?? [];

  const handleNewChat = async () => {
    const conv = await createMutation.mutateAsync({ model: "gemini-2.5-flash" });
    router.push(`/c/${conv.id}`);
    if (isMobile) setSidebarOpen(false);
  };

  // Collapsed state: show toggle button only
  if (!sidebarOpen) {
    return (
      <div className="flex flex-col items-center p-2 border-r">
        <Button variant="ghost" size="icon" onClick={toggleSidebar}>
          <PanelLeftOpen className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  // Mobile: overlay sidebar
  if (isMobile) {
    return (
      <>
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
        <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-background shadow-lg">
          <SidebarContent
            conversations={conversations}
            isLoading={isLoading}
            activeId={pathname.split("/c/")[1]}
            hasNextPage={hasNextPage ?? false}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            onNewChat={handleNewChat}
            onToggle={toggleSidebar}
            isCreating={createMutation.isPending}
          />
        </aside>
      </>
    );
  }

  // Desktop: static sidebar
  return (
    <aside className="flex h-full w-64 flex-col border-r bg-muted/40">
      <SidebarContent
        conversations={conversations}
        isLoading={isLoading}
        activeId={pathname.split("/c/")[1]}
        hasNextPage={hasNextPage ?? false}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        onNewChat={handleNewChat}
        onToggle={toggleSidebar}
        isCreating={createMutation.isPending}
      />
    </aside>
  );
}

// ── Inner content (shared between mobile overlay and desktop) ──

type SidebarContentProps = {
  conversations: import("@chatbot/shared").ConversationListItem[];
  isLoading: boolean;
  activeId?: string;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onNewChat: () => void;
  onToggle: () => void;
  isCreating: boolean;
};

function SidebarContent({
  conversations,
  isLoading,
  activeId,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onNewChat,
  onToggle,
  isCreating,
}: SidebarContentProps) {
  return (
    <>
      <div className="flex items-center justify-between p-3">
        <Button variant="ghost" size="icon" onClick={onToggle}>
          <PanelLeftClose className="h-5 w-5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onNewChat}
          disabled={isCreating}
        >
          <Plus className="mr-1 h-4 w-4" />
          {isCreating ? "Creating..." : "New chat"}
        </Button>
      </div>

      <ConversationList
        conversations={conversations}
        activeId={activeId}
        isLoading={isLoading}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={onLoadMore}
      />

      <div className="border-t p-3">
        <ThemeToggle />
      </div>
    </>
  );
}
```

### 4.6 Conversation List — Date Grouping + Load More

```tsx
// src/components/sidebar/conversation-list.tsx
"use client";

import type { ConversationListItem } from "@chatbot/shared";
import { ConversationItem } from "./conversation-item";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Props = {
  conversations: ConversationListItem[];
  activeId?: string;
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
};

function groupByDate(conversations: ConversationListItem[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const weekAgo = new Date(today.getTime() - 7 * 86_400_000);
  const monthAgo = new Date(today.getTime() - 30 * 86_400_000);

  const groups: { label: string; items: ConversationListItem[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Last 7 days", items: [] },
    { label: "Last 30 days", items: [] },
    { label: "Older", items: [] },
  ];

  for (const conv of conversations) {
    const date = new Date(conv.updatedAt);
    if (date >= today) groups[0].items.push(conv);
    else if (date >= yesterday) groups[1].items.push(conv);
    else if (date >= weekAgo) groups[2].items.push(conv);
    else if (date >= monthAgo) groups[3].items.push(conv);
    else groups[4].items.push(conv);
  }

  return groups.filter((g) => g.items.length > 0);
}

export function ConversationList({
  conversations,
  activeId,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: Props) {
  if (isLoading) {
    return (
      <div className="flex-1 p-3 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-sm text-muted-foreground">
        No conversations yet
      </div>
    );
  }

  const groups = groupByDate(conversations);

  return (
    <nav className="flex-1 overflow-y-auto px-2 pb-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-2 pt-4 pb-1 text-xs font-medium text-muted-foreground">
            {group.label}
          </p>
          {group.items.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === activeId}
            />
          ))}
        </div>
      ))}

      {hasNextPage && (
        <div className="px-2 pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Loading...
              </>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      )}
    </nav>
  );
}
```

### 4.7 Conversation Item — Rename & Delete

```tsx
// src/components/sidebar/conversation-item.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useRenameConversation, useDeleteConversation } from "@/hooks/use-conversations";
import { cn } from "@/lib/utils";
import type { ConversationListItem } from "@chatbot/shared";

type Props = {
  conversation: ConversationListItem;
  isActive: boolean;
};

export function ConversationItem({ conversation, isActive }: Props) {
  const router = useRouter();
  const [isRenaming, setIsRenaming] = useState(false);
  const [title, setTitle] = useState(conversation.title ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  const renameMutation = useRenameConversation();
  const deleteMutation = useDeleteConversation();

  useEffect(() => {
    if (isRenaming) inputRef.current?.focus();
  }, [isRenaming]);

  const handleRename = async () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== conversation.title) {
      await renameMutation.mutateAsync({ id: conversation.id, title: trimmed });
    }
    setIsRenaming(false);
  };

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(conversation.id);
    if (isActive) router.push("/");
  };

  if (isRenaming) {
    return (
      <div className="px-2 py-1">
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRename();
            if (e.key === "Escape") setIsRenaming(false);
          }}
          className="h-8 text-sm"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center rounded-md px-2 py-1.5 text-sm hover:bg-muted",
        isActive && "bg-muted font-medium",
      )}
    >
      <Link
        href={`/c/${conversation.id}`}
        className="flex flex-1 items-center gap-2 truncate"
      >
        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">
          {conversation.title ?? "Untitled"}
        </span>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setIsRenaming(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

### 4.8 Conversation Page — `src/app/(chat)/c/[id]/page.tsx`

```tsx
"use client";

import { useParams } from "next/navigation";
import { useConversation } from "@/hooks/use-conversations";
import { useChatStore } from "@/stores/chat-store";
import { ChatView } from "@/components/chat/chat-view";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useConversation(id);
  const { setConversation } = useChatStore();

  // Sync TanStack Query data into the chat store for streaming state management
  useEffect(() => {
    if (data) {
      setConversation(id, data.messages);
    }
  }, [id, data, setConversation]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-destructive">
        Failed to load conversation. It may have been deleted.
      </div>
    );
  }

  return <ChatView conversationId={id} />;
}
```

**Design Rationale:**
- FIX #4. Uses `useConversation(id)` hook which calls `api.get()` with `credentials: "include"`. No `Authorization: Bearer` header or `localStorage` access.
- FIX #3. Conversation data fetched via TanStack Query, then synced into the chat store for streaming-specific UI state (`isStreaming`, `appendToken`, `abortController`).
- Loading and error states are handled explicitly — no empty screen flash.

### 4.9 Markdown Renderer — `src/components/chat/markdown-renderer.tsx`

```tsx
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ShikiHighlighter } from "./shiki-highlighter";

type Props = {
  content: string;
};

export function MarkdownRenderer({ content }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className ?? "");
          const lang = match?.[1];
          const codeString = String(children).replace(/\n$/, "");

          if (!lang) {
            return (
              <code
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm"
                {...props}
              >
                {children}
              </code>
            );
          }

          return <ShikiHighlighter code={codeString} lang={lang} />;
        },
        pre({ children }) {
          return <>{children}</>;
        },
        table({ children }) {
          return (
            <div className="my-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                {children}
              </table>
            </div>
          );
        },
        th({ children }) {
          return (
            <th className="px-3 py-2 text-left text-sm font-semibold">
              {children}
            </th>
          );
        },
        td({ children }) {
          return (
            <td className="px-3 py-2 text-sm border-t">
              {children}
            </td>
          );
        },
      }}
    />
  );
}
```

### 4.10 Shiki Code Highlighter — `src/components/chat/shiki-highlighter.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  code: string;
  lang: string;
};

export function ShikiHighlighter({ code, lang }: Props) {
  const [html, setHtml] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("shiki").then(({ codeToHtml }) => {
      codeToHtml(code, {
        lang,
        themes: { light: "github-light", dark: "github-dark" },
      }).then((result) => {
        if (!cancelled) setHtml(result);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative my-3 rounded-lg border bg-muted">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground">
        <span>{lang}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      <div
        className="overflow-x-auto p-3 text-sm [&_pre]:!bg-transparent [&_code]:!bg-transparent"
        dangerouslySetInnerHTML={{
          __html: html || `<pre><code>${code}</code></pre>`,
        }}
      />
    </div>
  );
}
```

**Design Rationale:**
- Shiki loaded dynamically (`import("shiki")`) to avoid a 2MB bundle on initial page load.
- Dual theme support (light/dark) matches the app's `next-themes` toggle.
- Copy button with visual feedback (check icon for 2 seconds) follows standard ChatGPT UX.
- Fallback to plain `<code>` while Shiki loads prevents flash of unstyled content.

### 4.11 Chat Layout — `src/app/(chat)/layout.tsx`

```tsx
import { Sidebar } from "@/components/sidebar/sidebar";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
```

### 4.12 Theme Toggle — `src/components/theme/theme-toggle.tsx`

```tsx
"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
```

### 4.13 Updated Root Layout — Theme Provider

```tsx
// src/app/layout.tsx
import { ThemeProvider } from "next-themes";
import { Inter } from "next/font/google";
import { QueryProvider } from "@/components/providers/query-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import "@/app/globals.css";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <QueryProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

---

## 5. Mobile Responsiveness

### Breakpoint Strategy

| Breakpoint | Sidebar | Chat Input |
|------------|---------|------------|
| `< 768px` (mobile) | Hidden by default, overlay on toggle | Full width, textarea 2 rows |
| `768px-1024px` (tablet) | Collapsed (icons only) | Full width |
| `> 1024px` (desktop) | Full 256px sidebar | Max-width 768px centered |

### `useMediaQuery` Hook — `src/hooks/use-media-query.ts`

```typescript
"use client";

import { useState, useEffect } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
```

---

## 6. SSE Event Types

All SSE events reference the `StreamChunk` discriminated union defined in S1's `packages/shared/src/types/chat.ts`:

```typescript
export type StreamChunk =
  | { event: "token"; content: string }
  | { event: "done"; finishReason: string; usage?: { promptTokens?: number; completionTokens?: number } }
  | { event: "error"; error: string; code?: string }
  | { event: "title"; title: string }
  | { event: "citation"; source: string; page: number; relevance: number }
  | { event: "info"; message: string };
```

S2 actively uses these events:

| Event | Added in | S2 Usage |
|-------|----------|----------|
| `token` | S1 | Stream assistant response tokens |
| `done` | S1 | Signal stream completion with usage stats |
| `error` | S1 | Stream errors with `code` and `requestId` |
| `title` | S2 | Auto-generated conversation title after first exchange |
| `citation` | S1 (type) | Forwarded through for S3 compatibility |
| `info` | S1 (type) | Forwarded through for S3 compatibility |

The SSE client from S1 (`src/lib/sse-client.ts`) already handles all event types including `title`. No changes needed.

---

## 7. Testing Strategy (S2)

### New Backend Tests

| Area | Tests | Notes |
|------|-------|-------|
| Conversation CRUD | Create, list (cursor-paginated), get, update, delete | Verify `PaginatedResponse` shape |
| Cursor pagination | First page, next page, empty page, boundary cases | Test `nextCursor` correctness |
| Ownership enforcement | User A cannot access/modify User B's conversations | 403 on cross-user access |
| Message persistence | Messages saved atomically via `db.transaction()` | Verify rollback on failure |
| Context building | System prompt prepended, token-aware truncation | Test with varying message lengths |
| Token estimation | `estimateTokens()` returns reasonable values | Verify against known strings |
| Auto-title | Title generated via non-streaming call, fallback on error | Mock `generateContent` |
| Image cleanup | Attachment paths parsed, files deleted on conversation delete | Mock filesystem |
| Rate limiting | 60+ conversation ops returns 429 | Verify `X-RateLimit-*` headers |
| Error responses | All errors include `requestId`, correct `code` field | Test every error path |

### Frontend Component Tests

| Component | Tests |
|-----------|-------|
| `useConversations` | Returns paginated data, `hasNextPage` correct |
| `useCreateConversation` | Invalidates list cache after creation |
| `useDeleteConversation` | Removes detail cache, invalidates list |
| `ConversationList` | Renders date groups (Today, Yesterday, etc.), Load More button |
| `ConversationItem` | Rename inline edit, delete with navigation |
| `MarkdownRenderer` | Bold, code blocks, tables rendered correctly |
| `ShikiHighlighter` | Copy button works, language label shown |
| `ThemeToggle` | Toggles dark class on html element |
| `Sidebar` | Mobile overlay, desktop static, create conversation |

---

## 8. Definition of Done

Phase S2 is complete when:

1. `POST /api/v1/conversations` creates a conversation and returns it (with `requestId` in errors)
2. `GET /api/v1/conversations?limit=20` returns cursor-paginated `{ data, nextCursor }` response
3. `GET /api/v1/conversations?cursor=<updatedAt>&limit=20` returns the next page correctly
4. `GET /api/v1/conversations/:id` returns conversation with messages (ownership-enforced)
5. `PUT /api/v1/conversations/:id` renames/updates a conversation
6. `DELETE /api/v1/conversations/:id` removes the conversation, cascade-deletes messages, and cleans up image files
7. `addMessage()` uses `db.transaction()` to atomically insert the message and touch `conversations.updatedAt`
8. Chat route sends token-estimated, truncated context to Gemini (not naive last-N)
9. Auto-title generated via non-streaming `generateContent` after first assistant response, sent via SSE `title` event
10. All conversation CRUD routes are rate-limited (60/min per user)
11. All error responses include `{ error, code, requestId }` — no bare strings
12. All backend logging uses pino `log` instance — zero `console.log` calls
13. Sidebar uses TanStack Query (`useInfiniteQuery`) — no Zustand for server state
14. Zustand `useUIStore` contains **only** `sidebarOpen` boolean
15. All `fetch` calls use `credentials: "include"` — zero `Authorization: Bearer` headers, zero `localStorage` token reads
16. Sidebar shows conversations grouped by Today / Yesterday / Last 7 days / Last 30 days / Older
17. "Load more" button appears when `nextCursor` is non-null
18. Rename and delete work via dropdown menu on conversation items
19. Markdown renders correctly: bold, italic, headers, lists, tables, code blocks with Shiki syntax highlighting
20. Stop generation button aborts the SSE stream
21. System prompt textarea available per conversation, sent as system message
22. Dark/light mode toggle works and persists across page reloads
23. Mobile: sidebar collapses to overlay, chat fills screen
24. All schemas reference `@chatbot/shared` — no inline Zod schema redefinition
25. All Vitest tests pass
