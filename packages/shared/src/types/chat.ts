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
