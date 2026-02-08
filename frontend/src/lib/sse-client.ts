import { API_BASE } from "./utils";

export type SSECallbacks = {
  onToken: (content: string) => void;
  onDone: (usage: Record<string, unknown>) => void;
  onError: (error: string, code?: string) => void;
  onTitle?: (title: string) => void;
  onCitation?: (citation: { source: string; page: number; relevance: number }) => void;
  onInfo?: (message: string) => void;
};

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

type UploadProgressCallbacks = {
  onProgress: (percent: number) => void;
  onUploadComplete: () => void;
};

/**
 * Send a message with images via XHR (for upload progress tracking)
 * and parse the SSE response. Replaces the duplicated XHR blocks
 * in NewChatPage and ChatView.
 */
export function streamChatWithUpload(
  conversationId: string,
  body: { content: string; images: File[]; useDocuments?: boolean },
  callbacks: SSECallbacks,
  uploadCallbacks: UploadProgressCallbacks,
): AbortController {
  const controller = new AbortController();

  const formData = new FormData();
  formData.append("content", body.content);
  if (body.useDocuments) formData.append("useDocuments", "true");
  for (const image of body.images) {
    formData.append("images", image);
  }

  const xhr = new XMLHttpRequest();

  xhr.upload.addEventListener("progress", (e) => {
    if (e.lengthComputable) {
      uploadCallbacks.onProgress(Math.round((e.loaded / e.total) * 100));
    }
  });

  xhr.addEventListener("load", () => {
    uploadCallbacks.onUploadComplete();

    if (xhr.status >= 400) {
      try {
        const err = JSON.parse(xhr.responseText);
        callbacks.onError(err.error ?? "Upload failed", err.code);
      } catch {
        callbacks.onError("Upload failed");
      }
      return;
    }

    parseSSEText(xhr.responseText, callbacks);
  });

  xhr.addEventListener("error", () => {
    uploadCallbacks.onUploadComplete();
    callbacks.onError("Upload failed. Check your connection.");
  });

  xhr.addEventListener("abort", () => {
    uploadCallbacks.onUploadComplete();
  });

  xhr.open("POST", `${API_BASE}/conversations/${conversationId}/messages`);
  xhr.withCredentials = true;
  xhr.send(formData);

  controller.signal.addEventListener("abort", () => xhr.abort());

  return controller;
}

/**
 * Retry the last user message in a conversation (re-stream LLM response).
 */
export function retryChat(
  conversationId: string,
  callbacks: SSECallbacks,
): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/conversations/${conversationId}/retry`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
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
 * Parse SSE events from a completed XHR responseText.
 */
function parseSSEText(text: string, callbacks: SSECallbacks): void {
  const lines = text.split("\n");
  let currentEvent = "";

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith("data: ") && currentEvent) {
      try {
        const data = JSON.parse(line.slice(6));
        dispatchSSEEvent(currentEvent, data, callbacks);
      } catch { /* skip malformed SSE */ }
      currentEvent = "";
    }
  }
}

/**
 * Parse an SSE stream from a fetch Response.
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
          dispatchSSEEvent(currentEvent, data, callbacks);
        } catch { /* skip malformed SSE */ }
        currentEvent = "";
      }
    }
  }
}

/**
 * Dispatch a single SSE event to the appropriate callback.
 */
function dispatchSSEEvent(
  event: string,
  data: Record<string, unknown>,
  callbacks: SSECallbacks,
): void {
  switch (event) {
    case "token": callbacks.onToken(data.content as string); break;
    case "done": callbacks.onDone((data.usage as Record<string, unknown>) ?? {}); break;
    case "error": callbacks.onError(data.error as string, data.code as string | undefined); break;
    case "title": callbacks.onTitle?.(data.title as string); break;
    case "citation": callbacks.onCitation?.(data as unknown as { source: string; page: number; relevance: number }); break;
    case "info": callbacks.onInfo?.(data.message as string); break;
  }
}
