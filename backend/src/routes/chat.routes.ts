import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { sendMessageInputSchema, IMAGE_LIMITS } from "@chatbot/shared";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limiter.js";
import { getChatProvider, getFallbackChatProvider } from "../services/llm/factory.js";
import { trackStream, untrackStream } from "../index.js";
import { buildContextMessages } from "../services/context.service.js";
import { buildLLMMessages } from "../services/llm-message-builder.js";
import { generateTitle } from "../services/title.service.js";
import { validateAndStoreImage } from "../services/image.service.js";
import * as convService from "../services/conversation.service.js";
import * as vectorStore from "../services/vector-store.service.js";
import { ValidationError } from "../lib/errors.js";
import { log } from "../middleware/logger.js";
import { env } from "../env.js";
import type { AppEnv } from "../app.js";

const RAG_SYSTEM_PROMPT = `You are a helpful assistant with access to the user's documents.
When answering questions, cite your sources using [Source: filename, page X] format.
If the retrieved documents don't contain relevant information, say so honestly.`;

const chat = new Hono<AppEnv>();

const chatLimiter = rateLimit("chat", {
  windowMs: 60_000,
  max: env.RATE_LIMIT_CHAT_PER_MINUTE,
  keyFn: (c) => c.get("userId"),
});

const uploadLimiter = rateLimit("image-upload", {
  windowMs: 60 * 60_000,
  max: env.RATE_LIMIT_UPLOAD_PER_HOUR,
  keyFn: (c) => c.get("userId"),
  message: "Image upload rate limit exceeded. Please wait before uploading more images.",
});

// ── Text-only messages (JSON body) ────────────────
chat.post(
  "/conversations/:conversationId/messages",
  requireAuth,
  chatLimiter,
  async (c) => {
    const { conversationId } = c.req.param();
    const userId = c.get("userId");
    const requestId = c.get("requestId");
    const contentType = c.req.header("content-type") ?? "";

    // ── Route to multipart handler if images are present ──
    if (contentType.includes("multipart/form-data")) {
      return handleMultipartMessage(c, conversationId, userId, requestId);
    }

    // ── Standard JSON body (text-only) ──
    const body = await c.req.json();
    const input = sendMessageInputSchema.parse(body);

    const conv = convService.getConversation(conversationId, userId);

    convService.addMessage({
      conversationId,
      role: "user",
      content: input.content,
    });

    const history = convService.getConversationMessages(conversationId, userId);

    const llmMessages = buildContextMessages(
      history.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
      conv.systemPrompt,
    );

    // RAG context injection
    const useRag = input.useDocuments ?? false;
    const ragCitations = await injectRagContext(llmMessages, useRag, input.content, userId, requestId, conversationId);

    return streamLLMResponse(c, {
      llmMessages,
      model: input.model ?? conv.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      conversationId,
      userId,
      requestId,
      history,
      conv,
      userContent: input.content,
      ragCitations,
    });
  },
);

// ── Multipart handler (images + text) ─────────────
async function handleMultipartMessage(
  c: any,
  conversationId: string,
  userId: string,
  requestId: string,
) {
  const formData = await c.req.formData();
  const content = (formData.get("content") as string) ?? "";
  const modelOverride = (formData.get("model") as string) || undefined;
  const temperature = parseFloat((formData.get("temperature") as string) ?? "0.7");
  const maxTokens = parseInt((formData.get("maxTokens") as string) ?? "4096", 10);
  const useDocuments = formData.get("useDocuments") === "true";

  // Collect image files
  const imageFiles: { buffer: Buffer; name: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key === "images" && value instanceof File) {
      imageFiles.push({
        buffer: Buffer.from(await value.arrayBuffer()),
        name: value.name,
      });
    }
  }

  if (!content.trim() && imageFiles.length === 0) {
    throw new ValidationError("Message must contain text or at least one image");
  }

  if (imageFiles.length > IMAGE_LIMITS.maxImagesPerMessage) {
    throw new ValidationError(
      `Maximum ${IMAGE_LIMITS.maxImagesPerMessage} images per message`,
    );
  }

  // Apply upload rate limit only when images present
  if (imageFiles.length > 0) {
    const limiterMiddleware = uploadLimiter;
    await new Promise<void>((resolve, reject) => {
      limiterMiddleware(c, async () => { resolve(); }).catch(reject);
    });
  }

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

  convService.addMessage({
    conversationId,
    role: "user",
    content: content || "[Image]",
    attachments,
  });

  log.info(
    { requestId, conversationId, imageCount: storedImages.length, hasText: !!content.trim() },
    "User message persisted with images",
  );

  const history = convService.getConversationMessages(conversationId, userId);

  // Build LLM messages with images attached to last user message
  const llmMessages = buildLLMMessages(
    conv,
    history.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
    storedImages,
  );

  // RAG context injection if enabled
  const ragCitations = await injectRagContext(llmMessages, useDocuments, content, userId, requestId, conversationId);

  return streamLLMResponse(c, {
    llmMessages,
    model: modelOverride ?? conv.model,
    temperature,
    maxTokens,
    conversationId,
    userId,
    requestId,
    history,
    conv,
    userContent: content || "Describe this image",
    ragCitations,
  });
}

// ── Retry: re-stream LLM response for the last user message ──
chat.post(
  "/conversations/:conversationId/retry",
  requireAuth,
  chatLimiter,
  async (c) => {
    const { conversationId } = c.req.param();
    const userId = c.get("userId");
    const requestId = c.get("requestId");

    const conv = convService.getConversation(conversationId, userId);
    const allMessages = convService.getConversationMessages(conversationId, userId);

    // Clean up any stale streaming placeholders left by an interrupted stream.
    // These are empty assistant rows that the finally{} block hasn't deleted yet
    // (race condition: the client refreshed before server cleanup finished).
    const staleStreamingIds = allMessages
      .filter((m) => m.status === "streaming")
      .map((m) => m.id);
    for (const id of staleStreamingIds) {
      convService.deleteMessage(id);
      log.info({ requestId, conversationId, messageId: id }, "[retry] deleted stale streaming placeholder");
    }

    const history = allMessages.filter((m) => m.status !== "streaming");

    log.info({ requestId, conversationId, messageCount: history.length }, "[retry] endpoint hit");

    if (history.length === 0) {
      log.warn({ requestId, conversationId }, "[retry] no messages to retry");
      return c.json({ error: "No messages to retry" }, 400);
    }

    const lastMessage = history[history.length - 1];
    log.info({ requestId, conversationId, lastRole: lastMessage.role, lastContent: lastMessage.content.slice(0, 50) }, "[retry] last message");

    if (lastMessage.role !== "user") {
      log.warn({ requestId, conversationId, lastRole: lastMessage.role }, "[retry] last message is not from user");
      return c.json({ error: "Last message is not from user" }, 400);
    }

    const llmMessages = buildContextMessages(
      history.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
      conv.systemPrompt,
    );

    return streamLLMResponse(c, {
      llmMessages,
      model: conv.model,
      temperature: 0.7,
      maxTokens: 4096,
      conversationId,
      userId,
      requestId,
      history,
      conv,
      userContent: lastMessage.content,
      ragCitations: [],
    });
  },
);

// ── RAG context injection (shared by both paths) ──
async function injectRagContext(
  llmMessages: { role: string; content: string }[],
  useRag: boolean,
  userContent: string,
  userId: string,
  requestId: string,
  conversationId: string,
): Promise<{ source: string; page: number; relevance: number }[]> {
  if (!useRag || !userContent.trim()) return [];

  try {
    const relevantChunks = await vectorStore.queryChunks(userContent, userId, 5);
    if (relevantChunks.length === 0) return [];

    const context = relevantChunks
      .map((chunk, i) =>
        `[Document ${i + 1}: ${chunk.filename}, Page ${chunk.pageNumber}]\n${chunk.text}`,
      )
      .join("\n\n---\n\n");

    llmMessages.unshift({
      role: "system",
      content: `${RAG_SYSTEM_PROMPT}\n\n--- Retrieved Documents ---\n${context}`,
    });

    return relevantChunks.map((chunk) => ({
      source: chunk.filename,
      page: chunk.pageNumber,
      relevance: Math.round(chunk.relevance * 100) / 100,
    }));
  } catch (err) {
    log.warn(
      { requestId, conversationId, err: (err as Error).message },
      "RAG retrieval failed, proceeding without document context",
    );
    return [];
  }
}

// ── Stream LLM response (shared by both paths) ───
type StreamOptions = {
  llmMessages: any[];
  model: string;
  temperature: number;
  maxTokens: number;
  conversationId: string;
  userId: string;
  requestId: string;
  history: any[];
  conv: { title: string | null; model: string };
  userContent: string;
  ragCitations: { source: string; page: number; relevance: number }[];
};

function streamLLMResponse(c: any, opts: StreamOptions) {
  const primaryLlm = getChatProvider();
  const streamController = new AbortController();
  trackStream(streamController);

  // Pre-insert assistant message with status=streaming BEFORE the SSE begins.
  // If the client disconnects mid-stream, this row stays as "streaming" —
  // the frontend detects it on reload and auto-retries.
  const assistantRow = convService.addMessage({
    conversationId: opts.conversationId,
    role: "assistant",
    content: "",
    status: "streaming",
    model: opts.model ?? opts.conv.model,
  });

  return streamSSE(c, async (stream) => {
    let fullResponse = "";
    let usedFallback = false;
    let completed = false;

    try {
      // Send citation events before response tokens
      for (const citation of opts.ragCitations) {
        await stream.writeSSE({
          event: "citation",
          data: JSON.stringify(citation),
        });
      }

      for await (const chunk of primaryLlm.streamChat(opts.llmMessages, {
        model: opts.model,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
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
                log.warn({ requestId: opts.requestId }, "Primary LLM rate-limited, switching to fallback");

                // Notify frontend
                await stream.writeSSE({
                  event: "info",
                  data: JSON.stringify({
                    message: "Rate limit reached. Switching to backup model...",
                  }),
                });

                usedFallback = true;

                // Retry with fallback (text-only — OpenRouter free models don't support images)
                const textMessages = opts.llmMessages.map((m: any) => ({
                  role: m.role,
                  content: m.content,
                }));

                for await (const fallbackChunk of fallback.streamChat(textMessages, {
                  temperature: opts.temperature,
                  maxTokens: opts.maxTokens,
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
                        requestId: opts.requestId,
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
                    requestId: opts.requestId,
                  }),
                });
              }
            } else {
              // Non-rate-limit error, or fallback already tried
              await stream.writeSSE({
                event: "error",
                data: JSON.stringify({
                  error: chunk.error,
                  code: chunk.code,
                  requestId: opts.requestId,
                }),
              });
            }
            break;
          }

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

      // Stream completed successfully — finalize the assistant message
      if (fullResponse) {
        const finalModel = usedFallback ? env.OPENROUTER_MODEL : (opts.model ?? opts.conv.model);
        convService.completeMessage(assistantRow.id, fullResponse, finalModel);
        completed = true;

        // Auto-generate title on first exchange
        if (opts.history.length <= 1 && !opts.conv.title) {
          try {
            const title = await generateTitle(opts.userContent, opts.requestId);
            convService.updateConversation(opts.conversationId, opts.userId, { title });

            await stream.writeSSE({
              event: "title",
              data: JSON.stringify({ title }),
            });
          } catch (err) {
            log.warn(
              { requestId: opts.requestId, conversationId: opts.conversationId, err: (err as Error).message },
              "Auto-title generation failed",
            );
          }
        }
      } else {
        // LLM returned nothing — clean up the empty placeholder
        convService.deleteMessage(assistantRow.id);
        completed = true;
      }
    } finally {
      // If we never completed (client disconnected mid-stream), the row stays
      // as status="streaming". The frontend will detect this and auto-retry.
      if (!completed) {
        // Delete the incomplete placeholder so the retry creates a fresh one
        convService.deleteMessage(assistantRow.id);
      }
      untrackStream(streamController);
    }
  });
}

export { chat };
