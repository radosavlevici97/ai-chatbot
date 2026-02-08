import type { ChatMessage } from "@/stores/chat-store";
import type { MessageRole } from "@chatbot/shared";

type DbMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  citations?: string;
  attachments?: string;
};

export function parseDbMessages(messages: DbMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role as MessageRole,
    content: m.content,
    createdAt: m.createdAt,
    citations: m.citations ? JSON.parse(m.citations) : undefined,
    attachments: m.attachments ? JSON.parse(m.attachments) : undefined,
  }));
}
