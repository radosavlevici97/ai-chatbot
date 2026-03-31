export type MessageRole = "user" | "assistant" | "system";

export type MessageStatus = "streaming" | "done";

export type Message = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  model?: string;
  status?: MessageStatus;
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
  | { event: "info"; message: string }
  | { event: "tool_call"; callId: string; toolName: string; status: "running" | "completed" | "failed"; summary: string }
  | { event: "approval_request"; fixDescription: string; files: { path: string; diff: string }[] };
