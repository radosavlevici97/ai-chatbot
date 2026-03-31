import type { Message } from "./chat.js";
import type { ConversationMode } from "./devbot.js";

export type Conversation = {
  id: string;
  userId: string;
  title: string | null;
  model: string;
  systemPrompt: string | null;
  mode: ConversationMode;
  repoId: string | null;
  workingBranch: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConversationListItem = {
  id: string;
  title: string | null;
  model: string;
  mode: ConversationMode;
  repoId: string | null;
  updatedAt: string;
  createdAt: string;
};

export type ConversationWithMessages = Conversation & {
  messages: Message[];
};
