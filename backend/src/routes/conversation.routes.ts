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

const convLimiter = rateLimit("conversations", {
  windowMs: 60_000,
  max: env.RATE_LIMIT_CONVERSATION_PER_MINUTE,
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
    return c.json({ data: result });
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
    const allMsgs = convService.getConversationMessages(c.req.param("id"), userId);
    // Exclude in-flight streaming placeholders (empty assistant messages being
    // generated right now). These are transient rows — either the stream will
    // complete and fill them, or the finally{} block will delete them.
    const msgs = allMsgs.filter((m) => m.status !== "streaming");
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
  async (c) => {
    const userId = c.get("userId");
    const requestId = c.get("requestId");
    await convService.deleteConversation(c.req.param("id"), userId, requestId);
    return c.json({ data: { deleted: true } });
  },
);

export { convRouter };
