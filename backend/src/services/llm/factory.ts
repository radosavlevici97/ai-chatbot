import type { LLMProvider, EmbeddingProvider } from "./base.js";
import { GeminiChatProvider, GeminiEmbeddingProvider } from "./gemini.js";
import { OpenRouterProvider } from "./openrouter.js";
import { env } from "../../env.js";
import { log } from "../../middleware/logger.js";

let chatProvider: LLMProvider | null = null;
let embeddingProvider: EmbeddingProvider | null = null;
let fallbackChatProvider: LLMProvider | null = null;

export function getChatProvider(): LLMProvider {
  if (chatProvider) return chatProvider;

  switch (env.LLM_PROVIDER) {
    case "gemini":
      chatProvider = new GeminiChatProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL);
      break;
    case "openrouter":
      if (!env.OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY required when LLM_PROVIDER=openrouter");
      }
      chatProvider = new OpenRouterProvider(env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL);
      break;
    case "ollama":
      throw new Error("Ollama provider not yet implemented");
  }

  log.info({ provider: env.LLM_PROVIDER }, "Chat provider initialized");
  return chatProvider;
}

// Embedding provider is ALWAYS Gemini — independent of chat provider
export function getEmbeddingProvider(): EmbeddingProvider {
  if (embeddingProvider) return embeddingProvider;
  embeddingProvider = new GeminiEmbeddingProvider(env.GEMINI_API_KEY, env.GEMINI_EMBEDDING_MODEL);
  log.info({ provider: "gemini", model: env.GEMINI_EMBEDDING_MODEL }, "Embedding provider initialized");
  return embeddingProvider;
}

// Fallback chat provider (OpenRouter) — used when primary hits rate limit
export function getFallbackChatProvider(): LLMProvider | null {
  if (!env.OPENROUTER_API_KEY) return null;
  if (env.LLM_PROVIDER === "openrouter") return null; // Don't fallback to self
  if (fallbackChatProvider) return fallbackChatProvider;

  fallbackChatProvider = new OpenRouterProvider(env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL);
  log.info({ provider: "openrouter", model: env.OPENROUTER_MODEL }, "Fallback chat provider initialized");
  return fallbackChatProvider;
}

// Reset providers — used in graceful shutdown and testing
export function resetProviders(): void {
  chatProvider = null;
  embeddingProvider = null;
  fallbackChatProvider = null;
}
