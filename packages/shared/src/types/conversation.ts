import type { Message } from "./chat.js";

export type Conversation = {
  id: string;
  userId: string;
  title: string | null;
  model: string;
  systemPrompt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConversationListItem = {
  id: string;
  title: string | null;
  model: string;
  updatedAt: string;
  createdAt: string;
};

export type ConversationWithMessages = Conversation & {
  messages: Message[];
};
