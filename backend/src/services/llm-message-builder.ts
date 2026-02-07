import type { ChatMessage } from "./llm/base.js";

type Conversation = {
  systemPrompt: string | null;
  model: string;
};

type MessageRow = {
  role: "user" | "assistant" | "system";
  content: string;
};

type CurrentImage = {
  data: Buffer;
  mimeType: string;
};

const MAX_HISTORY = 50;

export function buildLLMMessages(
  conv: Conversation,
  history: MessageRow[],
  currentImages: CurrentImage[],
): ChatMessage[] {
  const llmMessages: ChatMessage[] = [];

  if (conv.systemPrompt) {
    llmMessages.push({ role: "system", content: conv.systemPrompt });
  }

  // Conversation history (text only for past messages)
  const recent = history.slice(-MAX_HISTORY);
  for (const msg of recent) {
    if (msg.role === "user" || msg.role === "assistant") {
      llmMessages.push({ role: msg.role, content: msg.content });
    }
  }

  // Attach current images to the last user message
  if (currentImages.length > 0) {
    const lastUserMsg = llmMessages.findLast((m) => m.role === "user");
    if (lastUserMsg) {
      lastUserMsg.images = currentImages.map((img) => ({
        data: img.data,
        mimeType: img.mimeType,
      }));
    }
  }

  return llmMessages;
}
