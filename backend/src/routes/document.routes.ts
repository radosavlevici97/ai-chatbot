import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { paginationSchema, documentSearchSchema } from "@chatbot/shared";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limiter.js";
import { env } from "../env.js";
import * as docService from "../services/document.service.js";
import * as vectorStore from "../services/vector-store.service.js";
import { log } from "../middleware/logger.js";
import type { AppEnv } from "../app.js";

const docs = new Hono<AppEnv>();

// Rate limiter for uploads: default 20 per hour per user
const uploadLimiter = rateLimit("upload", {
  windowMs: 60 * 60 * 1000,
  max: env.RATE_LIMIT_UPLOAD_PER_HOUR,
  keyFn: (c) => c.get("userId"),
  message: "Upload limit reached. Please try again later.",
});

// Upload document
docs.post("/documents/upload", requireAuth, uploadLimiter, async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return c.json(
      { error: "No file provided", code: "VALIDATION_ERROR", requestId },
      422,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const doc = await docService.processUpload(buffer, file.name, userId, requestId);
  return c.json({ data: doc }, 201);
});

// List user's documents (cursor-based pagination)
docs.get(
  "/documents",
  requireAuth,
  zValidator("query", paginationSchema),
  (c) => {
    const userId = c.get("userId");
    const { cursor, limit } = c.req.valid("query");
    const result = docService.listDocuments(userId, cursor, limit);
    return c.json({ data: result.data, nextCursor: result.nextCursor });
  },
);

// Get document details
docs.get("/documents/:id", requireAuth, (c) => {
  const userId = c.get("userId");
  const doc = docService.getDocument(c.req.param("id"), userId);
  return c.json({ data: doc });
});

// Get document processing status
docs.get("/documents/:id/status", requireAuth, (c) => {
  const userId = c.get("userId");
  const doc = docService.getDocument(c.req.param("id"), userId);
  return c.json({
    data: {
      status: doc.status,
      chunkCount: doc.chunkCount,
      errorMessage: doc.errorMessage,
    },
  });
});

// Delete document
docs.delete("/documents/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");
  await docService.deleteDocument(c.req.param("id"), userId, requestId);
  return c.json({ data: { deleted: true } });
});

// Search documents
docs.post(
  "/documents/search",
  requireAuth,
  zValidator("json", documentSearchSchema),
  async (c) => {
    const userId = c.get("userId");
    const requestId = c.get("requestId");
    const { query, topK } = c.req.valid("json");

    log.info({ requestId, userId, queryLength: query.length, topK }, "Document search");

    const results = await vectorStore.queryChunks(query, userId, topK);
    return c.json({ data: results });
  },
);

export { docs };
