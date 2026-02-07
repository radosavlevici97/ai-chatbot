import type { StreamChunk } from "@chatbot/shared";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  images?: { data: Buffer; mimeType: string }[];
}

export interface LLMProvider {
  streamChat(
    messages: ChatMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): AsyncGenerator<StreamChunk>;

  healthCheck(): Promise<boolean>;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[], concurrency?: number): Promise<number[][]>;
}
