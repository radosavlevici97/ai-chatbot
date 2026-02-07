import type { LLMProvider, ChatMessage } from "./base.js";
import type { StreamChunk } from "@chatbot/shared";
import { log } from "../../middleware/logger.js";

const OPENROUTER_API = "https://openrouter.ai/api/v1";

export class OpenRouterProvider implements LLMProvider {
  private apiKey: string;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel?: string) {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel ?? "meta-llama/llama-3.1-8b-instruct:free";
  }

  async *streamChat(
    messages: ChatMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): AsyncGenerator<StreamChunk> {
    const model = options?.model ?? this.defaultModel;

    // OpenRouter free models are text-only — strip images from messages
    const body = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      stream: true,
    };

    try {
      const response = await fetch(`${OPENROUTER_API}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": "https://chatbot-showcase.vercel.app",
          "X-Title": "SecureChatBot Showcase",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(`OpenRouter API error: ${response.status} ${errorBody}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              yield { event: "token", content };
            }
          } catch {
            /* skip malformed SSE line */
          }
        }
      }

      yield { event: "done", finishReason: "stop" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      log.error({ provider: "openrouter", error: message }, "OpenRouter stream error");
      yield { event: "error", error: message, code: "LLM_ERROR" };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${OPENROUTER_API}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
