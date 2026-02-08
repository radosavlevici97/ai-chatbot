import { eq, and, desc, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import { conversations, messages } from "../db/schema.js";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";
import { log } from "../middleware/logger.js";
import { cleanupConversationImages } from "./image-cleanup.service.js";
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

  const rows = db
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
    .limit(limit + 1)
    .all();

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

export async function deleteConversation(
  id: string,
  userId: string,
  requestId: string,
): Promise<void> {
  getConversation(id, userId);

  // Clean up image files BEFORE cascade-deleting message rows
  await cleanupConversationImages(id, requestId);

  db.delete(conversations).where(eq(conversations.id, id)).run();

  log.info({ requestId, conversationId: id, userId }, "Conversation deleted");
}

// ── Complete a streaming message (set content + status=done) ──

export function completeMessage(
  messageId: string,
  content: string,
  model?: string,
): void {
  db.update(messages)
    .set({ content, status: "done", model: model ?? undefined })
    .where(eq(messages.id, messageId))
    .run();
}

// ── Delete a message by id ───────────────────────

export function deleteMessage(messageId: string): void {
  db.delete(messages).where(eq(messages.id, messageId)).run();
}

// ── Add message (atomic with updatedAt touch) ────

export function addMessage(input: {
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string;
  status?: "streaming" | "done";
  tokensPrompt?: number;
  tokensCompletion?: number;
  attachments?: string;
}): typeof messages.$inferSelect {
  const id = nanoid();

  db.transaction((tx) => {
    tx.insert(messages).values({ id, ...input }).run();

    tx.update(conversations)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(conversations.id, input.conversationId))
      .run();
  });

  return db.select().from(messages).where(eq(messages.id, id)).get()!;
}
