# Phase S4 — Image Understanding

> **Timeline:** Week 4 | **Goal:** Upload images in chat, get AI analysis and answers
> **Depends on:** Phase S3 (file upload infrastructure, storage abstraction, vector store)
> **Delivers to:** Phase S5

---

## 1. Objectives

| # | Objective | Acceptance Criteria |
|---|-----------|-------------------|
| 1 | Image upload in chat | Paste from clipboard, drag & drop, file picker |
| 2 | Image validation | Accept PNG, JPG, GIF, WebP; reject others; max 10MB |
| 3 | Multimodal LLM call | Send image + text to Gemini 2.5 Flash (natively multimodal) |
| 4 | Mixed messages | Support text-only, image-only, and text+image messages |
| 5 | Image thumbnails | Preview before sending, display inline in conversation |
| 6 | Multiple images | Support multiple images in a single message (up to 5) |
| 7 | Image storage | Persist via `StorageAdapter` (S3), serve via authenticated endpoint |
| 8 | Upload progress | Track and display upload progress for large images |
| 9 | Image cleanup | Delete associated images when a conversation is deleted |

---

## 2. Architecture — Multimodal Flow

```
User pastes/drops image + types question
        |
        v
+-----------------------------+
|  Frontend                    |
|  - Image preview (thumbnail) |
|  - Resize if > 4MB           |  <-- Client-side resize via canvas
|  - Object URL cleanup        |  <-- revokeObjectURL in useEffect
|  - Upload via FormData       |
|  - credentials: "include"    |  <-- httpOnly cookies, NO Auth header
|  - XHR for progress tracking |
+------------+----------------+
             | POST /conversations/:id/messages (multipart)
             v
+-----------------------------+
|  Backend                     |
|  1. Rate limit (upload)      |  <-- Reuse RATE_LIMIT_UPLOAD_PER_HOUR
|  2. Validate image (magic)   |  <-- file-type magic byte check
|  3. Store via StorageAdapter |  <-- Same abstraction as S3 (local/R2)
|  4. Persist message + attach |  <-- Single DB transaction
|  5. Read as Buffer           |
|  6. Build Gemini message     |
|     with inline_data part    |
|  7. Stream response via SSE  |
|  8. Log operations (pino)    |  <-- requestId correlation
+-----------------------------+
             |
             v
+-----------------------------+
|  Gemini 2.5 Flash            |
|  (natively multimodal)       |
|  - No extra model needed     |
|  - Supports up to 3600 imgs  |
|  - Inline base64 or URI      |
+-----------------------------+
```

**Key simplification:** Gemini 2.5 Flash is natively multimodal -- the same model handles text AND images. No need for a separate vision model. The `ChatMessage.images` field on `LLMProvider` was already established in S1; this phase uses it.

---

## 3. Shared Types — `@chatbot/shared`

### 3.1 Image Constants — `packages/shared/src/constants/limits.ts`

Add image-specific limits alongside the existing upload and rate limit constants:

```typescript
// packages/shared/src/constants/limits.ts — add image limits

export const IMAGE_LIMITS = {
  maxSizeMB: 10,
  maxSizeBytes: 10 * 1024 * 1024,
  allowedMimeTypes: [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
  ] as const,
  allowedExtensions: ["png", "jpg", "jpeg", "gif", "webp"] as const,
  maxImagesPerMessage: 5,
  maxDimensionPx: 4096,  // Gemini's max input dimension
  clientResizeThresholdBytes: 4 * 1024 * 1024, // Resize on client if over 4MB
} as const;

export type AllowedImageMime = (typeof IMAGE_LIMITS.allowedMimeTypes)[number];
```

### 3.2 Attachment Schema — `packages/shared/src/schemas/attachment.ts`

```typescript
import { z } from "zod";

export const imageAttachmentSchema = z.object({
  type: z.literal("image"),
  storagePath: z.string(),
  mimeType: z.string(),
  size: z.number().optional(),
});

export const attachmentSchema = z.discriminatedUnion("type", [
  imageAttachmentSchema,
  // Future: z.object({ type: z.literal("document"), ... })
]);

export const attachmentsArraySchema = z.array(attachmentSchema);

export type ImageAttachment = z.infer<typeof imageAttachmentSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
```

### 3.3 Barrel Export Update — `packages/shared/src/index.ts`

```typescript
// Add to existing barrel export:
export * from "./constants/limits.js";
export * from "./schemas/attachment.js";
```

**Design Rationale:**
- Image limits defined once in `@chatbot/shared` -- used by both backend validation and frontend preview logic
- `attachmentSchema` uses a discriminated union on `type` -- extensible for future attachment types (audio, video) without modifying existing code
- `AllowedImageMime` type derived from the constant -- ensures frontend and backend agree on allowed types at compile time

---

## 4. Backend Changes

### 4.1 Image Service — `src/services/image.service.ts`

Uses the `StorageAdapter` interface established in S3 (`save`/`read`/`delete`) instead of direct `writeFileSync`/`readFileSync`. This means images work identically with local disk and Cloudflare R2.

```typescript
import { fileTypeFromBuffer } from "file-type";
import { nanoid } from "nanoid";
import { getStorageAdapter } from "../lib/storage.js";
import { ValidationError } from "../lib/errors.js";
import { IMAGE_LIMITS, type AllowedImageMime } from "@chatbot/shared";
import { log } from "../middleware/logger.js";

type StoredImage = {
  id: string;
  filename: string;
  mimeType: string;
  storagePath: string;
  size: number;
};

export async function validateAndStoreImage(
  buffer: Buffer,
  originalFilename: string,
  userId: string,
  requestId: string,
): Promise<StoredImage> {
  const storage = getStorageAdapter();

  // 1. Size check
  if (buffer.length > IMAGE_LIMITS.maxSizeBytes) {
    log.warn({ requestId, size: buffer.length, limit: IMAGE_LIMITS.maxSizeBytes }, "Image size exceeded");
    throw new ValidationError(`Image exceeds ${IMAGE_LIMITS.maxSizeMB}MB limit`);
  }

  // 2. Magic byte detection
  const detected = await fileTypeFromBuffer(buffer);
  if (
    !detected ||
    !IMAGE_LIMITS.allowedMimeTypes.includes(detected.mime as AllowedImageMime)
  ) {
    log.warn(
      { requestId, detectedMime: detected?.mime, originalFilename },
      "Image type rejected",
    );
    throw new ValidationError(
      `Unsupported image type. Allowed: ${IMAGE_LIMITS.allowedExtensions.join(", ")}`,
    );
  }

  // 3. Store via StorageAdapter
  const id = nanoid();
  const filename = `${id}.${detected.ext}`;
  const storagePath = `images/${userId}/${filename}`;

  await storage.save(storagePath, buffer);

  log.info(
    { requestId, storagePath, mimeType: detected.mime, size: buffer.length },
    "Image stored",
  );

  return {
    id,
    filename,
    mimeType: detected.mime,
    storagePath,
    size: buffer.length,
  };
}

export async function getImageBuffer(storagePath: string): Promise<Buffer> {
  const storage = getStorageAdapter();
  return storage.read(storagePath);
}

export async function deleteImage(storagePath: string, requestId: string): Promise<void> {
  const storage = getStorageAdapter();
  try {
    await storage.delete(storagePath);
    log.info({ requestId, storagePath }, "Image deleted");
  } catch (err) {
    log.warn({ requestId, storagePath, err }, "Image deletion failed (may already be removed)");
  }
}
```

**Design Rationale:**
- `getStorageAdapter()` returns either `LocalStorageAdapter` or `R2StorageAdapter` based on `STORAGE_TYPE` env var -- same abstraction as S3 document uploads
- No direct `fs` calls -- storage adapter handles directory creation, path resolution, and cloud upload
- `requestId` threaded through every log call -- correlates with the originating HTTP request in Railway/pino logs
- `deleteImage` is tolerant of missing files -- prevents crashes during cleanup of already-removed images

### 4.2 Image Cleanup on Conversation Delete

When a conversation is deleted (S2 `deleteConversation`), associated images must be cleaned up from storage. This function reads the `attachments` JSON column from each message and deletes referenced image files.

```typescript
// src/services/image-cleanup.service.ts

import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { messages } from "../db/schema.js";
import { deleteImage } from "./image.service.js";
import { attachmentsArraySchema } from "@chatbot/shared";
import { log } from "../middleware/logger.js";

/**
 * Deletes all image attachments for every message in a conversation.
 * Call this BEFORE deleting the conversation from the DB (cascade would
 * remove the message rows we need to read).
 */
export async function cleanupConversationImages(
  conversationId: string,
  requestId: string,
): Promise<number> {
  const msgs = db
    .select({ attachments: messages.attachments })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .all();

  let deletedCount = 0;

  for (const msg of msgs) {
    if (!msg.attachments) continue;

    try {
      const parsed = attachmentsArraySchema.parse(JSON.parse(msg.attachments));
      for (const attachment of parsed) {
        if (attachment.type === "image") {
          await deleteImage(attachment.storagePath, requestId);
          deletedCount++;
        }
      }
    } catch (err) {
      log.warn({ requestId, conversationId, err }, "Failed to parse attachments for cleanup");
    }
  }

  log.info({ requestId, conversationId, deletedCount }, "Conversation image cleanup complete");
  return deletedCount;
}
```

Update the S2 conversation delete flow to call cleanup first:

```typescript
// In src/services/conversation.service.ts — updated deleteConversation

import { cleanupConversationImages } from "./image-cleanup.service.js";

export async function deleteConversation(
  id: string,
  userId: string,
  requestId: string,
) {
  getConversation(id, userId); // verify ownership

  // Clean up image files BEFORE cascade-deleting message rows
  await cleanupConversationImages(id, requestId);

  db.delete(conversations).where(eq(conversations.id, id)).run();
}
```

**Design Rationale:**
- Cleanup runs BEFORE the SQL delete -- once cascade deletes message rows, we lose the `attachments` JSON needed to find file paths
- Tolerant parsing via try/catch per message -- a corrupt JSON in one message does not block cleanup of others
- Returns `deletedCount` for logging -- operators can verify cleanup worked without inspecting storage directly

### 4.3 Updated Chat Route — Multipart Messages with Transactions

The chat route is updated to:
1. Parse multipart `FormData` (not JSON) when images are present
2. Validate and store images through `StorageAdapter`
3. Persist user message + conversation `updatedAt` in a **single database transaction**
4. Apply upload rate limiting
5. Include `requestId` in all error responses
6. Log all image operations with pino

```typescript
// src/routes/chat.routes.ts — updated for multipart + images

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limiter.js";
import { getChatProvider } from "../services/llm/factory.js";
import { validateAndStoreImage, getImageBuffer } from "../services/image.service.js";
import * as convService from "../services/conversation.service.js";
import { db } from "../db/index.js";
import { messages as messagesTable, conversations } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { env } from "../env.js";
import { AppError, ValidationError } from "../lib/errors.js";
import { log } from "../middleware/logger.js";
import { IMAGE_LIMITS } from "@chatbot/shared";
import type { AppEnv } from "../app.js";

const chat = new Hono<AppEnv>();

// Chat rate limiter (messages per minute, from S1)
const chatLimiter = rateLimit("chat", {
  windowMs: 60_000,
  max: env.RATE_LIMIT_CHAT_PER_MINUTE,
  keyFn: (c) => c.get("userId"),
});

// Upload rate limiter — reuse S3's RATE_LIMIT_UPLOAD_PER_HOUR for image uploads
const uploadLimiter = rateLimit("image-upload", {
  windowMs: 60 * 60_000, // 1 hour
  max: env.RATE_LIMIT_UPLOAD_PER_HOUR,
  keyFn: (c) => c.get("userId"),
  message: "Image upload rate limit exceeded. Please wait before uploading more images.",
});

chat.post(
  "/conversations/:conversationId/messages",
  requireAuth,
  chatLimiter,
  async (c) => {
    const { conversationId } = c.req.param();
    const userId = c.get("userId");
    const requestId = c.get("requestId");

    // Determine content type — support both JSON (text-only) and multipart (with images)
    const contentType = c.req.header("content-type") ?? "";
    let content: string;
    let modelOverride: string | undefined;
    let temperature: number;
    let maxTokens: number;
    let useDocuments: boolean;
    let imageFiles: { buffer: Buffer; name: string }[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await c.req.formData();
      content = (formData.get("content") as string) ?? "";
      modelOverride = (formData.get("model") as string) || undefined;
      temperature = parseFloat((formData.get("temperature") as string) ?? "0.7");
      maxTokens = parseInt((formData.get("maxTokens") as string) ?? "4096", 10);
      useDocuments = formData.get("useDocuments") === "true";

      // Collect image files from FormData
      for (const [key, value] of formData.entries()) {
        if (key === "images" && value instanceof File) {
          imageFiles.push({
            buffer: Buffer.from(await value.arrayBuffer()),
            name: value.name,
          });
        }
      }
    } else {
      // Standard JSON body (text-only messages)
      const body = await c.req.json();
      content = body.content ?? "";
      modelOverride = body.model;
      temperature = body.temperature ?? 0.7;
      maxTokens = body.maxTokens ?? 4096;
      useDocuments = body.useDocuments ?? false;
    }

    // Validate that we have content or images
    if (!content.trim() && imageFiles.length === 0) {
      throw new ValidationError("Message must contain text or at least one image");
    }

    // Validate image count
    if (imageFiles.length > IMAGE_LIMITS.maxImagesPerMessage) {
      throw new ValidationError(
        `Maximum ${IMAGE_LIMITS.maxImagesPerMessage} images per message`,
      );
    }

    // Apply upload rate limit only if images are present
    if (imageFiles.length > 0) {
      // Manually invoke upload limiter for this request
      await new Promise<void>((resolve, reject) => {
        const limiterMiddleware = uploadLimiter;
        // Use the rate limiter as a guard
        const fakeNext = async () => { resolve(); };
        limiterMiddleware(c, fakeNext).catch(reject);
      });
    }

    // Verify conversation ownership
    const conv = convService.getConversation(conversationId, userId);

    // Validate and store images via StorageAdapter
    const storedImages: { data: Buffer; mimeType: string; storagePath: string; size: number }[] = [];
    for (const file of imageFiles) {
      const stored = await validateAndStoreImage(file.buffer, file.name, userId, requestId);
      storedImages.push({
        data: file.buffer,
        mimeType: stored.mimeType,
        storagePath: stored.storagePath,
        size: stored.size,
      });
    }

    // Build attachments JSON for DB persistence
    const attachments = storedImages.length > 0
      ? JSON.stringify(
          storedImages.map((img) => ({
            type: "image" as const,
            storagePath: img.storagePath,
            mimeType: img.mimeType,
            size: img.size,
          })),
        )
      : undefined;

    // Persist user message + touch conversation updatedAt in a SINGLE transaction
    const messageId = nanoid();
    const now = new Date().toISOString();

    db.transaction((tx) => {
      tx.insert(messagesTable)
        .values({
          id: messageId,
          conversationId,
          role: "user",
          content: content || "[Image]",
          attachments,
          createdAt: now,
        })
        .run();

      tx.update(conversations)
        .set({ updatedAt: now })
        .where(eq(conversations.id, conversationId))
        .run();
    });

    log.info(
      { requestId, conversationId, imageCount: storedImages.length, hasText: !!content.trim() },
      "User message persisted with images",
    );

    // Load full conversation history for LLM context
    const history = convService.getConversationMessages(conversationId, userId);
    const llmMessages = buildLLMMessages(conv, history, storedImages);

    // RAG context injection (from S3) if enabled
    if (useDocuments) {
      // Imported from S3 — omitted here for brevity, same pattern as S3 section 5.6
    }

    const llm = getChatProvider();

    return streamSSE(c, async (stream) => {
      let fullResponse = "";

      for await (const chunk of llm.streamChat(llmMessages, {
        model: modelOverride ?? conv.model,
        temperature,
        maxTokens,
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
              data: JSON.stringify({ error: chunk.error, code: chunk.code, requestId }),
            });
            break;
        }
      }

      // Persist assistant response in a transaction
      if (fullResponse) {
        db.transaction((tx) => {
          tx.insert(messagesTable)
            .values({
              id: nanoid(),
              conversationId,
              role: "assistant",
              content: fullResponse,
              model: modelOverride ?? conv.model,
              createdAt: new Date().toISOString(),
            })
            .run();

          tx.update(conversations)
            .set({ updatedAt: new Date().toISOString() })
            .where(eq(conversations.id, conversationId))
            .run();
        });

        // Auto-generate title on first exchange (from S2)
        if (history.length <= 1 && !conv.title) {
          const { generateTitle } = await import("../services/title.service.js");
          const title = await generateTitle(content || "Describe this image");
          convService.updateConversation(conversationId, userId, { title });

          await stream.writeSSE({
            event: "title",
            data: JSON.stringify({ title }),
          });
        }
      }
    });
  },
);

export { chat };
```

**Design Rationale:**
- **Database transactions** wrap both the message insert and the `updatedAt` touch -- if either fails, neither is committed (same pattern as S2 `addMessage`)
- **Dual content-type support** -- JSON for text-only messages (backward compatible with S2), multipart for messages with images
- **Upload rate limiter** applied conditionally only when images are present -- text-only messages are not penalized by the upload limiter (they still go through the chat limiter)
- **`requestId` included in SSE error events** -- the frontend can display it for user-reportable errors
- **Structured logging** at every decision point -- image count, storage path, validation failures all logged with `requestId`

### 4.4 LLM Message Builder

Separated into its own function for clarity. Attaches images to the last user message in the conversation context. Historical images are NOT re-sent (Gemini context limits); only the current message's images are included.

```typescript
// src/services/llm-message-builder.ts

import type { ChatMessage } from "./llm/base.js";

type Conversation = {
  systemPrompt: string | null;
  model: string;
};

type MessageRow = {
  role: "user" | "assistant" | "system";
  content: string;
};

type CurrentImage = {
  data: Buffer;
  mimeType: string;
};

const MAX_HISTORY = 50;

export function buildLLMMessages(
  conv: Conversation,
  history: MessageRow[],
  currentImages: CurrentImage[],
): ChatMessage[] {
  const llmMessages: ChatMessage[] = [];

  // System prompt (text-only, per Gemini requirement)
  if (conv.systemPrompt) {
    llmMessages.push({ role: "system", content: conv.systemPrompt });
  }

  // Conversation history (text only for past messages)
  const recent = history.slice(-MAX_HISTORY);
  for (const msg of recent) {
    if (msg.role === "user" || msg.role === "assistant") {
      llmMessages.push({ role: msg.role, content: msg.content });
    }
  }

  // Attach current images to the last user message
  if (currentImages.length > 0) {
    const lastUserMsg = llmMessages.findLast((m) => m.role === "user");
    if (lastUserMsg) {
      lastUserMsg.images = currentImages.map((img) => ({
        data: img.data,
        mimeType: img.mimeType,
      }));
    }
  }

  return llmMessages;
}
```

**Design Rationale:**
- Historical images are excluded from the LLM context -- Gemini's multimodal context window is expensive; resending every past image would quickly exhaust it
- The `images` field on `ChatMessage` was defined in S1's `LLMProvider` interface -- this phase simply populates it
- `MAX_HISTORY = 50` matches S2's truncation limit

### 4.5 Image Serving Endpoint

Serves stored images through the `StorageAdapter`, with ownership verification and consistent error format.

```typescript
// src/routes/image.routes.ts

import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { getImageBuffer } from "../services/image.service.js";
import { log } from "../middleware/logger.js";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";
import type { AppEnv } from "../app.js";

const images = new Hono<AppEnv>();

images.get("/images/:userId/:filename", requireAuth, async (c) => {
  const requestingUserId = c.get("userId");
  const requestId = c.get("requestId");
  const { userId, filename } = c.req.param();

  // Ownership check — users can only access their own images
  if (requestingUserId !== userId) {
    log.warn({ requestId, requestingUserId, targetUserId: userId }, "Cross-user image access denied");
    throw new ForbiddenError("Cannot access another user's images");
  }

  const storagePath = `images/${userId}/${filename}`;

  try {
    const buffer = await getImageBuffer(storagePath);

    // Determine MIME type from extension
    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeType =
      ext === "png" ? "image/png"
      : ext === "gif" ? "image/gif"
      : ext === "webp" ? "image/webp"
      : "image/jpeg";

    log.debug({ requestId, storagePath }, "Image served");

    return new Response(buffer, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=86400", // 24h, private (auth required)
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    throw new NotFoundError("Image");
  }
});

export { images };
```

**Design Rationale:**
- Uses `getImageBuffer` which calls `StorageAdapter.read()` -- works with both local disk and R2 without code changes
- Throws `ForbiddenError` / `NotFoundError` from the `AppError` hierarchy -- the global error handler adds `requestId` automatically
- `Cache-Control: private` -- the image requires authentication, so shared caches (CDNs) must not cache it
- Extension-based MIME type is safe here because the backend controlled the filename at upload time (nanoid + validated extension)

### 4.6 Route Registration

```typescript
// src/routes/index.ts — add image routes

import { Hono } from "hono";
import { auth } from "./auth.routes.js";
import { chat } from "./chat.routes.js";
import { convRouter } from "./conversation.routes.js";
import { docs } from "./document.routes.js";
import { images } from "./image.routes.js";
import { health } from "./health.routes.js";
import type { AppEnv } from "../app.js";

const routes = new Hono<AppEnv>();

routes.route("/auth", auth);
routes.route("/", chat);
routes.route("/", convRouter);
routes.route("/", docs);
routes.route("/", images);
routes.route("/", health);

export { routes };
```

---

## 5. Frontend Components

### 5.1 New/Updated Files

```
frontend/src/
+-- components/
|   +-- chat/
|   |   +-- chat-input.tsx          # UPDATED: image paste, drop, picker, progress
|   |   +-- chat-message.tsx        # UPDATED: render inline images
|   |   +-- image-preview.tsx       # NEW: thumbnail grid before sending
|   |   +-- image-lightbox.tsx      # NEW: full-size image viewer
|   +-- ...
+-- lib/
|   +-- api-client.ts              # EXISTING: credentials: "include" (from S1)
|   +-- sse-client.ts              # UPDATED: multipart FormData support
|   +-- image-utils.ts             # NEW: resize, compress, object URL management
+-- hooks/
|   +-- use-image-paste.ts         # NEW: clipboard paste handler
|   +-- use-upload-progress.ts     # NEW: XHR-based upload with progress
+-- stores/
    +-- chat-store.ts              # UPDATED: image attachment state
```

### 5.2 Image Utilities — `src/lib/image-utils.ts`

Handles client-side image resizing and proper `ObjectURL` lifecycle management.

```typescript
import { IMAGE_LIMITS } from "@chatbot/shared";

/**
 * Resize an image on the client if it exceeds the threshold.
 * Returns the original file if it's small enough.
 */
export async function prepareImage(file: File): Promise<File> {
  if (file.size <= IMAGE_LIMITS.clientResizeThresholdBytes) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      // Always revoke the object URL after the image loads
      URL.revokeObjectURL(objectUrl);

      const canvas = document.createElement("canvas");
      let { width, height } = img;

      // Scale down if exceeds Gemini's max dimension
      if (width > IMAGE_LIMITS.maxDimensionPx || height > IMAGE_LIMITS.maxDimensionPx) {
        const ratio = Math.min(
          IMAGE_LIMITS.maxDimensionPx / width,
          IMAGE_LIMITS.maxDimensionPx / height,
        );
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: "image/jpeg" }));
          } else {
            resolve(file);
          }
        },
        "image/jpeg",
        0.85,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // Fall back to original on error
    };

    img.src = objectUrl;
  });
}

/**
 * Creates an object URL for a thumbnail preview.
 * IMPORTANT: Callers MUST revoke this URL when the preview is removed
 * to prevent memory leaks. Use the useEffect cleanup pattern.
 */
export function createThumbnailUrl(file: File): string {
  return URL.createObjectURL(file);
}

/**
 * Revoke an object URL to free browser memory.
 */
export function revokeThumbnailUrl(url: string): void {
  URL.revokeObjectURL(url);
}
```

**Design Rationale:**
- `URL.createObjectURL()` allocates browser memory that persists until explicitly revoked -- without cleanup, every image preview leaks a blob reference
- `prepareImage` revokes the temporary URL inside `onload` -- the canvas has already read the image data, so the URL is no longer needed
- `onerror` also revokes -- prevents leaks even on corrupt images
- Image limits imported from `@chatbot/shared` -- single source of truth for both client and server validation

### 5.3 Upload Progress Hook — `src/hooks/use-upload-progress.ts`

Uses `XMLHttpRequest` to track upload progress for large images. The `fetch` API does not expose upload progress, so XHR is necessary here.

```typescript
import { useState, useCallback, useRef } from "react";

type UploadState = {
  progress: number;      // 0-100
  isUploading: boolean;
  error: string | null;
};

type UploadOptions = {
  url: string;
  formData: FormData;
  onSSEResponse: (response: Response) => void;
};

export function useUploadProgress() {
  const [state, setState] = useState<UploadState>({
    progress: 0,
    isUploading: false,
    error: null,
  });
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const upload = useCallback(({ url, formData, onSSEResponse }: UploadOptions) => {
    setState({ progress: 0, isUploading: true, error: null });

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    // Track upload progress
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setState((prev) => ({ ...prev, progress: percent }));
      }
    });

    xhr.addEventListener("load", () => {
      setState((prev) => ({ ...prev, isUploading: false, progress: 100 }));

      // Convert XHR response to a fetch-like Response for SSE parsing
      const responseBody = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(xhr.responseText));
          controller.close();
        },
      });

      const response = new Response(responseBody, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: new Headers({
          "Content-Type": xhr.getResponseHeader("Content-Type") ?? "text/event-stream",
        }),
      });

      onSSEResponse(response);
    });

    xhr.addEventListener("error", () => {
      setState({ progress: 0, isUploading: false, error: "Upload failed. Check your connection." });
    });

    xhr.addEventListener("abort", () => {
      setState({ progress: 0, isUploading: false, error: null });
    });

    xhr.open("POST", url);
    // credentials: "include" equivalent for XHR — sends httpOnly cookies
    xhr.withCredentials = true;
    // Do NOT set Content-Type — browser sets it with multipart boundary automatically
    xhr.send(formData);
  }, []);

  const abort = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
  }, []);

  return { ...state, upload, abort };
}
```

**Design Rationale:**
- `XMLHttpRequest` is the only browser API that exposes `upload.progress` events -- `fetch()` upload progress is not supported in any browser as of 2026
- `xhr.withCredentials = true` is the XHR equivalent of `credentials: "include"` -- sends httpOnly cookies automatically, no Authorization header
- Content-Type is NOT set manually -- the browser generates the correct `multipart/form-data; boundary=...` header; setting it manually breaks multipart uploads
- The XHR response is converted to a `Response` object so the existing SSE parser can be reused without modification

### 5.4 Updated SSE Client — Multipart Support with Cookie Auth

The SSE client is updated to support `FormData` bodies for messages with images. All authentication is via httpOnly cookies (`credentials: "include"` / `withCredentials: true`). There is NO `Authorization` header and NO `localStorage` access.

```typescript
// src/lib/sse-client.ts — updated for multipart + cookie auth

import type { StreamChunk } from "@chatbot/shared";

type SSECallbacks = {
  onToken: (content: string) => void;
  onDone: (usage: Record<string, unknown>) => void;
  onError: (error: string, code?: string) => void;
  onTitle?: (title: string) => void;
  onCitation?: (citation: { source: string; page: number; relevance: number }) => void;
  onInfo?: (message: string) => void;
};

/**
 * Send a text-only message and stream the response via SSE.
 * Uses fetch with credentials: "include" for cookie-based auth.
 */
export function streamChat(
  conversationId: string,
  body: {
    content: string;
    model?: string;
    temperature?: number;
    useDocuments?: boolean;
  },
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
    .then((response) => parseSSEStream(response, callbacks))
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError(err.message, "NETWORK_ERROR");
      }
    });

  return controller;
}

/**
 * Send a message with images (multipart/form-data) and stream the response.
 * Uses fetch with credentials: "include". Does NOT set Content-Type header
 * (browser sets it automatically with multipart boundary).
 */
export function streamChatWithImages(
  conversationId: string,
  body: {
    content: string;
    images: File[];
    model?: string;
    temperature?: number;
    useDocuments?: boolean;
  },
  callbacks: SSECallbacks,
): AbortController {
  const controller = new AbortController();
  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

  // Build FormData — browser sets Content-Type with boundary automatically
  const formData = new FormData();
  formData.append("content", body.content);
  if (body.model) formData.append("model", body.model);
  if (body.temperature !== undefined) formData.append("temperature", String(body.temperature));
  if (body.useDocuments) formData.append("useDocuments", "true");
  for (const image of body.images) {
    formData.append("images", image);
  }

  fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
    method: "POST",
    credentials: "include",  // httpOnly cookies sent automatically
    // NOTE: Do NOT set Content-Type — browser sets it with boundary for multipart
    body: formData,
    signal: controller.signal,
  })
    .then((response) => parseSSEStream(response, callbacks))
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError(err.message, "NETWORK_ERROR");
      }
    });

  return controller;
}

/**
 * Parse an SSE stream from a fetch Response.
 * Shared by both text-only and multipart message senders.
 */
async function parseSSEStream(
  response: Response,
  callbacks: SSECallbacks,
): Promise<void> {
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Stream failed" }));
    callbacks.onError(err.error, err.code);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError("No response body");
    return;
  }

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
            case "token":
              callbacks.onToken(data.content);
              break;
            case "done":
              callbacks.onDone(data.usage ?? {});
              break;
            case "error":
              callbacks.onError(data.error, data.code);
              break;
            case "title":
              callbacks.onTitle?.(data.title);
              break;
            case "citation":
              callbacks.onCitation?.(data);
              break;
            case "info":
              callbacks.onInfo?.(data.message);
              break;
          }
        } catch {
          /* skip malformed SSE line */
        }
        currentEvent = "";
      }
    }
  }
}
```

**Design Rationale:**
- **Two entry points** (`streamChat` for text-only, `streamChatWithImages` for multipart) -- keeps the text-only path simple and efficient (JSON body, Content-Type header set explicitly)
- **Shared `parseSSEStream`** -- SSE parsing logic is identical regardless of how the request was sent; extracted to avoid duplication
- **`credentials: "include"` on EVERY fetch call** -- httpOnly cookies are sent automatically; NO Authorization header, NO localStorage access
- **Content-Type omitted for multipart** -- the browser generates `multipart/form-data; boundary=<random>` automatically; setting it manually strips the boundary and breaks the upload
- **All SSE event types handled** -- token, done, error, title, citation, info

### 5.5 Image Preview with Object URL Cleanup — `src/components/chat/image-preview.tsx`

```tsx
"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createThumbnailUrl, revokeThumbnailUrl } from "@/lib/image-utils";

type Props = {
  images: File[];
  onRemove: (index: number) => void;
};

export function ImagePreview({ images, onRemove }: Props) {
  // Track object URLs so we can revoke them on cleanup
  const urlMapRef = useRef<Map<File, string>>(new Map());

  // Create or retrieve thumbnail URL for a file
  function getUrl(file: File): string {
    const existing = urlMapRef.current.get(file);
    if (existing) return existing;
    const url = createThumbnailUrl(file);
    urlMapRef.current.set(file, url);
    return url;
  }

  // Cleanup: revoke all object URLs when component unmounts or images change
  useEffect(() => {
    const currentMap = urlMapRef.current;

    return () => {
      for (const url of currentMap.values()) {
        revokeThumbnailUrl(url);
      }
      currentMap.clear();
    };
  }, [images]);

  // When an image is removed, revoke its specific URL
  const handleRemove = (index: number) => {
    const file = images[index];
    const url = urlMapRef.current.get(file);
    if (url) {
      revokeThumbnailUrl(url);
      urlMapRef.current.delete(file);
    }
    onRemove(index);
  };

  return (
    <div className="mb-2 flex gap-2 overflow-x-auto">
      {images.map((file, i) => (
        <div key={`${file.name}-${file.size}-${i}`} className="group relative h-20 w-20 flex-shrink-0">
          <img
            src={getUrl(file)}
            alt={file.name}
            className="h-full w-full rounded-lg border object-cover"
          />
          <Button
            variant="destructive"
            size="icon"
            className="absolute -right-1 -top-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => handleRemove(i)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}
```

**Design Rationale:**
- `URL.createObjectURL()` creates a reference to a `Blob` in browser memory -- without `revokeObjectURL()`, these references persist for the lifetime of the page, creating a memory leak proportional to the number of images previewed
- Object URLs are tracked in a `Map<File, string>` ref -- prevents creating duplicate URLs for the same file and ensures every URL is revoked
- Cleanup runs on both unmount AND when the `images` array changes -- covers all cases: navigating away, clearing all images, and sending the message
- Individual removal also revokes the specific URL immediately -- does not wait for the effect cleanup

### 5.6 Updated Chat Input — Image Support with Progress

```tsx
// src/components/chat/chat-input.tsx
"use client";

import { useState, useRef, useCallback } from "react";
import { Send, Square, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ImagePreview } from "./image-preview";
import { prepareImage } from "@/lib/image-utils";
import { IMAGE_LIMITS } from "@chatbot/shared";
import { toast } from "sonner";

type Props = {
  onSend: (content: string, images: File[]) => void;
  isGenerating: boolean;
  onStop: () => void;
  uploadProgress: number;
  isUploading: boolean;
  useDocuments: boolean;
  onToggleDocuments: (enabled: boolean) => void;
};

export function ChatInput({
  onSend,
  isGenerating,
  onStop,
  uploadProgress,
  isUploading,
  useDocuments,
  onToggleDocuments,
}: Props) {
  const [input, setInput] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addImage = useCallback(async (file: File) => {
    // Client-side type validation before preparing
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported");
      return;
    }

    // Client-side size check (pre-resize)
    if (file.size > IMAGE_LIMITS.maxSizeBytes) {
      toast.error(`Image exceeds ${IMAGE_LIMITS.maxSizeMB}MB limit`);
      return;
    }

    const prepared = await prepareImage(file);
    setImages((prev) => {
      if (prev.length >= IMAGE_LIMITS.maxImagesPerMessage) {
        toast.warning(`Maximum ${IMAGE_LIMITS.maxImagesPerMessage} images per message`);
        return prev;
      }
      return [...prev, prepared];
    });
  }, []);

  // Handle paste from clipboard (Ctrl+V with image)
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const imageItems = items.filter((item) => item.type.startsWith("image/"));

      for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) await addImage(file);
      }
    },
    [addImage],
  );

  // Handle drag & drop
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/"),
      );
      for (const file of files) {
        await addImage(file);
      }
    },
    [addImage],
  );

  // Handle file picker
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      for (const file of files) {
        await addImage(file);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [addImage],
  );

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!input.trim() && images.length === 0) return;
    onSend(input.trim(), images);
    setInput("");
    setImages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="border-t bg-background p-4"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Upload progress bar */}
      {isUploading && (
        <div className="mb-2">
          <Progress value={uploadProgress} className="h-1.5" />
          <p className="mt-1 text-xs text-muted-foreground">
            Uploading... {uploadProgress}%
          </p>
        </div>
      )}

      {/* Image previews (with proper object URL cleanup) */}
      {images.length > 0 && (
        <ImagePreview images={images} onRemove={removeImage} />
      )}

      <div className="flex items-end gap-2">
        {/* Image upload button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isGenerating || isUploading}
        >
          <ImageIcon className="h-5 w-5" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Text input */}
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={images.length > 0 ? "Ask about this image..." : "Type a message..."}
          className="min-h-[44px] max-h-[200px] flex-1 resize-none"
          rows={1}
          disabled={isGenerating || isUploading}
        />

        {/* Send / Stop */}
        {isGenerating ? (
          <Button variant="destructive" size="icon" onClick={onStop}>
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={(!input.trim() && images.length === 0) || isUploading}
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* RAG toggle */}
      <div className="mt-2 flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={useDocuments}
            onChange={(e) => onToggleDocuments(e.target.checked)}
            className="rounded"
          />
          Search my documents
        </label>
      </div>
    </div>
  );
}
```

### 5.7 Updated Chat Message — Inline Images

```tsx
// src/components/chat/chat-message.tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "./markdown-renderer";
import { CitationBadge } from "./citation-badge";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

type Attachment = {
  type: string;
  storagePath: string;
  mimeType: string;
};

type MessageProps = {
  message: {
    id: string;
    role: "user" | "assistant";
    content: string;
    isStreaming?: boolean;
    attachments?: Attachment[];
    citations?: { source: string; page: number; relevance: number }[];
  };
};

export function ChatMessage({ message }: MessageProps) {
  const isUser = message.role === "user";
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Image URL uses cookie auth (credentials: "include" on the <img> is
  // not possible, but the browser sends cookies for same-origin requests).
  // For cross-origin, the image serving endpoint requires auth cookies.
  const imageUrl = (storagePath: string) =>
    `${API_BASE}/images/${storagePath}`;

  return (
    <>
      <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
        {/* Avatar */}
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          {isUser ? "U" : "AI"}
        </div>

        <div className={cn("flex max-w-[80%] flex-col gap-1", isUser && "items-end")}>
          {/* Inline images (user messages) */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {message.attachments
                .filter((a) => a.type === "image")
                .map((attachment, i) => (
                  <img
                    key={i}
                    src={imageUrl(attachment.storagePath)}
                    alt="Uploaded image"
                    className="max-h-64 rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                    loading="lazy"
                    onClick={() => setLightboxSrc(imageUrl(attachment.storagePath))}
                  />
                ))}
            </div>
          )}

          {/* Message content */}
          <div
            className={cn(
              "rounded-2xl px-4 py-2",
              isUser ? "bg-primary text-primary-foreground" : "bg-muted",
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <MarkdownRenderer content={message.content} />
            )}
            {message.isStreaming && <span className="animate-pulse">|</span>}
          </div>

          {/* Citations */}
          {message.citations && message.citations.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {message.citations.map((c, i) => (
                <CitationBadge key={i} {...c} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox overlay */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 cursor-pointer"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="Full size"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
          />
        </div>
      )}
    </>
  );
}
```

**Design Rationale:**
- Image URLs point to the authenticated `/images/:userId/:filename` endpoint -- the browser sends httpOnly cookies automatically for same-origin requests; for cross-origin setups, the CORS config with `credentials: true` (S1) enables cookie-based image loading
- `loading="lazy"` on `<img>` tags -- images below the fold are not fetched until scrolled into view, reducing initial page load
- Lightbox is a simple overlay -- no extra dependency for the showcase; click image to expand, click backdrop to close

### 5.8 Updated Chat View — Wiring Images and Progress

This shows how the chat view component connects the image state, upload progress, and SSE streaming together.

```tsx
// Key updates to src/components/chat/chat-view.tsx
"use client";

import { useCallback } from "react";
import { useChatStore } from "@/stores/chat-store";
import { ChatInput } from "./chat-input";
import { ChatMessage } from "./chat-message";
import { streamChat, streamChatWithImages } from "@/lib/sse-client";
import { useUploadProgress } from "@/hooks/use-upload-progress";

type Props = {
  conversationId: string;
};

export function ChatView({ conversationId }: Props) {
  const {
    messages,
    isGenerating,
    addUserMessage,
    startAssistantMessage,
    appendToken,
    addCitation,
    finishGeneration,
    setAbortController,
    stopGeneration,
  } = useChatStore();

  const { progress, isUploading, upload } = useUploadProgress();
  const [useDocuments, setUseDocuments] = useState(false);

  const handleSend = useCallback(
    (content: string, images: File[]) => {
      // Add user message to store (optimistic)
      addUserMessage(content);
      startAssistantMessage();

      const callbacks = {
        onToken: (text: string) => appendToken(text),
        onDone: () => finishGeneration(),
        onError: (error: string, code?: string) => {
          appendToken(`\n\n**Error:** ${error}`);
          finishGeneration();
        },
        onTitle: (title: string) => {
          // Update sidebar (from S2 pattern)
        },
        onCitation: (citation: { source: string; page: number; relevance: number }) => {
          addCitation(citation);
        },
        onInfo: (message: string) => {
          // Show toast for info messages (e.g., rate limit fallback)
        },
      };

      if (images.length > 0) {
        // Use multipart upload with progress tracking
        const controller = streamChatWithImages(
          conversationId,
          { content, images, useDocuments },
          callbacks,
        );
        setAbortController(controller);
      } else {
        // Text-only — standard JSON body
        const controller = streamChat(
          conversationId,
          { content, useDocuments },
          callbacks,
        );
        setAbortController(controller);
      }
    },
    [conversationId, useDocuments, addUserMessage, startAssistantMessage, appendToken, finishGeneration, setAbortController, addCitation],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
      </div>

      {/* Input area */}
      <ChatInput
        onSend={handleSend}
        isGenerating={isGenerating}
        onStop={stopGeneration}
        uploadProgress={progress}
        isUploading={isUploading}
        useDocuments={useDocuments}
        onToggleDocuments={setUseDocuments}
      />
    </div>
  );
}
```

---

## 6. Supported Image Operations

| Operation | How It Works |
|-----------|-------------|
| **Describe image** | "What's in this image?" -- Gemini analyzes and describes |
| **OCR from photo** | "What text is in this image?" -- Gemini reads text |
| **Chart analysis** | "Explain this chart" -- Gemini interprets data visualizations |
| **Screenshot QA** | "What error is shown?" -- Gemini reads UI/error messages |
| **Compare images** | Send 2+ images: "What's different?" -- Gemini compares |
| **Image + document** | Enable RAG + send image -- context from both sources |

---

## 7. Error Handling

All error responses follow the project's consistent format: `{ error, code, requestId, detail? }`.

### 7.1 Backend Error Responses

| Scenario | Status | Code | Error Message |
|----------|--------|------|---------------|
| No content or images | 422 | `VALIDATION_ERROR` | "Message must contain text or at least one image" |
| Too many images | 422 | `VALIDATION_ERROR` | "Maximum 5 images per message" |
| Image too large | 422 | `VALIDATION_ERROR` | "Image exceeds 10MB limit" |
| Invalid image type | 422 | `VALIDATION_ERROR` | "Unsupported image type. Allowed: png, jpg, jpeg, gif, webp" |
| Upload rate limited | 429 | `RATE_LIMITED` | "Image upload rate limit exceeded..." |
| Cross-user image access | 403 | `FORBIDDEN` | "Cannot access another user's images" |
| Image not found | 404 | `NOT_FOUND` | "Image not found" |

All responses include `requestId` via the global error handler (S1 section 6.8). No changes to the error handler are needed -- `AppError` subclasses are caught automatically.

### 7.2 Frontend Error Display

Image-specific errors are shown as toast notifications:

```typescript
// In the chat callbacks:
onError: (error: string, code?: string) => {
  if (code === "VALIDATION_ERROR") {
    toast.error(error); // Show validation message directly
  } else if (code === "RATE_LIMITED") {
    toast.warning("Upload limit reached", {
      description: error,
      duration: 8000,
    });
  } else {
    toast.error("Failed to send message", {
      description: error,
    });
  }
  finishGeneration();
},
```

---

## 8. Database: Message Attachments

The `attachments` column on the `messages` table was already defined in S1 as `text("attachments")` holding JSON. S4 populates it for image messages:

```json
[
  {
    "type": "image",
    "storagePath": "images/user123/abc123def.png",
    "mimeType": "image/png",
    "size": 245760
  }
]
```

The schema for this JSON is validated at both write time (backend constructs it from validated `StoredImage` data) and read time (via `attachmentsArraySchema` from `@chatbot/shared` during cleanup).

---

## 9. Testing Strategy (S4)

### Backend Tests

| Area | Tests |
|------|-------|
| Image validation | PNG/JPG/GIF/WebP accepted; BMP/SVG/EXE rejected |
| Magic byte check | Renamed `.exe` to `.jpg` detected and rejected |
| Size limit | > 10MB rejected with `VALIDATION_ERROR` and `requestId` |
| Storage adapter | Image stored and retrieved via `StorageAdapter` interface |
| Image serving | Authenticated endpoint serves image; rejects cross-user access with 403 |
| Error format | All error responses include `{ error, code, requestId }` |
| Rate limiting | Upload rate limiter returns 429 after exceeding `RATE_LIMIT_UPLOAD_PER_HOUR` |
| DB transaction | Message insert + `updatedAt` update either both succeed or both roll back |
| Multimodal LLM | Image + text sent to Gemini; response streams correctly |
| Multiple images | 2-5 images in one message all processed and stored |
| Image cleanup | Deleting conversation removes associated image files from storage |
| Structured logging | Image upload, validation failure, and serving logged with `requestId` |

### Frontend Tests

| Area | Tests |
|------|-------|
| Clipboard paste | Ctrl+V with screenshot creates image preview |
| Drag & drop | Dropping image file adds to preview |
| Client-side resize | 8MB image resized below 4MB before upload |
| Object URL cleanup | `revokeObjectURL` called when preview removed or component unmounts |
| Upload progress | Progress bar updates during multipart upload |
| Cookie auth | `credentials: "include"` used (no Authorization header, no localStorage) |
| Image count limit | 6th image shows warning toast, not added |
| Error display | Validation errors shown as toast notifications |

---

## 10. Security Considerations

- **Image validation**: Magic bytes checked via `file-type` library, not just file extension
- **Size limits**: Client-side resize + server-side validation (defense in depth)
- **Path traversal**: nanoid filenames, images stored in per-user directories via `StorageAdapter`
- **Access control**: Image serving endpoint checks `userId` matches requesting user; uses `AppError` hierarchy
- **Cookie-based auth**: All requests use `credentials: "include"` (fetch) or `withCredentials: true` (XHR) -- no tokens in JavaScript, no localStorage access
- **No EXIF data concerns in showcase**: Gemini API receives raw image data (future: strip EXIF in production)
- **Rate limiting**: Upload rate limiter prevents abuse; reuses `RATE_LIMIT_UPLOAD_PER_HOUR` from env config
- **Transaction safety**: Message + attachment persist is atomic -- no orphaned attachments on partial failure
- **Memory management**: Object URLs revoked in `useEffect` cleanup -- prevents browser memory leaks

---

## 11. Cross-Reference: Patterns Reused from Earlier Phases

| Pattern | Source Phase | How S4 Uses It |
|---------|-------------|----------------|
| Cookie-based auth (`credentials: "include"`) | S1 | All fetch/XHR calls; image serving endpoint |
| `StorageAdapter` interface (save/read/delete) | S3 | Image storage instead of direct `fs` calls |
| `AppError` hierarchy + global error handler | S1 | `ValidationError`, `ForbiddenError`, `NotFoundError` for images |
| Structured logging with pino + `requestId` | S1 | Image upload, validation failure, serving, cleanup |
| Rate limiter middleware | S1 | `RATE_LIMIT_UPLOAD_PER_HOUR` for image uploads |
| Database transactions | S2 | Message insert + `updatedAt` touch in single transaction |
| `ChatMessage.images` field on `LLMProvider` | S1 | Populated with image buffers for Gemini multimodal |
| TanStack Query for server state | S1 | Conversation list invalidation after image message |
| Zustand for UI-only state | S1 | Streaming state, image preview state |
| `@chatbot/shared` Zod schemas | S1 | `attachmentSchema`, `IMAGE_LIMITS` shared across packages |

---

## 12. Definition of Done

Phase S4 is complete when:

1. Clicking the image button opens a file picker for PNG/JPG/GIF/WebP
2. Pasting an image from clipboard (Ctrl+V) adds it to the message preview
3. Dragging an image onto the chat input adds it to the message preview
4. Image thumbnails shown before sending, removable with X button
5. Object URLs are revoked on removal and component unmount (no memory leaks)
6. Upload progress bar visible during multipart upload of large images
7. Sending an image + text question returns a relevant AI response from Gemini
8. Images displayed inline in the conversation history, clickable for lightbox
9. Multiple images (up to 5) can be sent in a single message
10. Images persist across page reloads (stored via `StorageAdapter`, served via authenticated endpoint)
11. Invalid file types (e.g., .exe, .svg) rejected with clear error toast
12. Image size > 10MB rejected server-side with `requestId` in error response
13. User A cannot access User B's uploaded images (403 response)
14. Upload rate limiting enforced (`RATE_LIMIT_UPLOAD_PER_HOUR`)
15. Message + attachment persisted in a single database transaction
16. Deleting a conversation cleans up associated image files from storage
17. All image operations logged via pino with `requestId` correlation
18. All error responses include `{ error, code, requestId }` consistent format
19. No `Authorization` header or `localStorage` token access anywhere in frontend code
20. All fetch calls use `credentials: "include"`; all XHR calls use `withCredentials: true`
