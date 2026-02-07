type SSECallbacks = {
  onToken: (content: string) => void;
  onDone: (usage: Record<string, unknown>) => void;
  onError: (error: string, code?: string) => void;
  onTitle?: (title: string) => void;
  onCitation?: (citation: { source: string; page: number; relevance: number }) => void;
  onInfo?: (message: string) => void;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/**
 * Send a text-only message and stream the response via SSE.
 */
export function streamChat(
  conversationId: string,
  body: { content: string; model?: string; temperature?: number; useDocuments?: boolean },
  callbacks: SSECallbacks,
): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
    method: "POST",
    credentials: "include",
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
 * Does NOT set Content-Type header — the browser generates it with boundary.
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
    credentials: "include",
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
}
