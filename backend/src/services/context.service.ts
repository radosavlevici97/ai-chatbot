import type { ChatMessage } from "./llm/base.js";
import { log } from "../middleware/logger.js";

// Gemini uses ~1 token per 4 characters for English text.
const CHARS_PER_TOKEN = 4;

// Reserve reasonable budget within Gemini 2.5 Flash's 1M window
const DEFAULT_MAX_CONTEXT_TOKENS = 128_000;
const RESPONSE_RESERVE_TOKENS = 8_192;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Build a context-window-aware message list for the LLM.
 *
 * Strategy:
 * 1. Always include the system prompt (if any).
 * 2. Always include the most recent user message.
 * 3. Fill remaining budget with messages from most-recent to oldest.
 * 4. If even the system prompt + latest message exceed the budget,
 *    send them anyway (the model handles truncation internally).
 */
export function buildContextMessages(
  allMessages: { role: "user" | "assistant" | "system"; content: string }[],
  systemPrompt: string | null,
  options?: {
    maxContextTokens?: number;
    responseReserveTokens?: number;
  },
): ChatMessage[] {
  const maxTokens = options?.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS;
  const reserveTokens = options?.responseReserveTokens ?? RESPONSE_RESERVE_TOKENS;
  const budget = maxTokens - reserveTokens;

  const result: ChatMessage[] = [];
  let usedTokens = 0;

  // 1. System prompt always included
  if (systemPrompt) {
    const systemTokens = estimateTokens(systemPrompt);
    result.push({ role: "system", content: systemPrompt });
    usedTokens += systemTokens;
  }

  // 2. Separate the latest user message (always included)
  const latestMessage = allMessages[allMessages.length - 1];
  const latestTokens = latestMessage ? estimateTokens(latestMessage.content) : 0;
  usedTokens += latestTokens;

  // 3. Fill from most-recent-to-oldest (excluding the latest)
  const historyMessages = allMessages.slice(0, -1);
  const includedHistory: ChatMessage[] = [];

  for (let i = historyMessages.length - 1; i >= 0; i--) {
    const msg = historyMessages[i];
    const msgTokens = estimateTokens(msg.content);

    if (usedTokens + msgTokens > budget) {
      log.debug(
        {
          truncatedAt: i,
          totalMessages: allMessages.length,
          usedTokens,
          budget,
        },
        "Context window truncated",
      );
      break;
    }

    includedHistory.unshift({ role: msg.role, content: msg.content });
    usedTokens += msgTokens;
  }

  // 4. Assemble: system prompt + included history + latest message
  result.push(...includedHistory);
  if (latestMessage) {
    result.push({ role: latestMessage.role, content: latestMessage.content });
  }

  return result;
}
