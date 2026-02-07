import { GoogleGenAI } from "@google/genai";
import type { LLMProvider, ChatMessage, EmbeddingProvider } from "./base.js";
import type { StreamChunk } from "@chatbot/shared";

export class GeminiChatProvider implements LLMProvider {
  private client: GoogleGenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = "gemini-2.5-flash") {
    this.client = new GoogleGenAI({ apiKey });
    this.defaultModel = defaultModel;
  }

  async *streamChat(
    messages: ChatMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): AsyncGenerator<StreamChunk> {
    const model = options?.model ?? this.defaultModel;

    let systemInstruction: string | undefined;
    const contents = messages.flatMap((msg) => {
      if (msg.role === "system") {
        systemInstruction = msg.content;
        return [];
      }

      const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
      if (msg.content) parts.push({ text: msg.content });
      if (msg.images) {
        for (const img of msg.images) {
          parts.push({ inlineData: { data: img.data.toString("base64"), mimeType: img.mimeType } });
        }
      }

      return [{ role: msg.role === "user" ? "user" : "model", parts }];
    });

    try {
      const stream = await this.client.models.generateContentStream({
        model,
        contents,
        config: {
          temperature: options?.temperature ?? 0.7,
          maxOutputTokens: options?.maxTokens ?? 4096,
          systemInstruction,
        },
      });

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) yield { event: "token", content: text };
      }

      yield { event: "done", finishReason: "stop", usage: { promptTokens: 0, completionTokens: 0 } };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const code = message.includes("429") || message.includes("RESOURCE_EXHAUSTED")
        ? "RATE_LIMITED"
        : "LLM_ERROR";
      yield { event: "error", error: message, code };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.models.get({ model: this.defaultModel });
      return true;
    } catch {
      return false;
    }
  }
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private client: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model = "text-embedding-004") {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.client.models.embedContent({
      model: this.model,
      contents: text,
    });
    return result.embeddings?.[0]?.values ?? [];
  }

  async embedBatch(texts: string[], concurrency = 5): Promise<number[][]> {
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += concurrency) {
      const batch = texts.slice(i, i + concurrency);
      const embeddings = await Promise.all(batch.map((t) => this.embed(t)));
      results.push(...embeddings);
    }
    return results;
  }
}
