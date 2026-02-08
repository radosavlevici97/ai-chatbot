import { create } from "zustand";
import type { Attachment, MessageRole } from "@chatbot/shared";

export type Citation = { source: string; page: number; relevance: number };

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  isStreaming?: boolean;
  createdAt: string;
  citations?: Citation[];
  attachments?: Attachment[];
};

type ChatState = {
  conversationId: string | null;
  messages: ChatMessage[];
  isGenerating: boolean;
  abortController: AbortController | null;

  setConversation: (id: string, messages: ChatMessage[]) => void;
  setConversationId: (id: string) => void;
  addUserMessage: (content: string, attachments?: Attachment[]) => void;
  startAssistantMessage: () => void;
  appendToken: (content: string) => void;
  addCitation: (citation: Citation) => void;
  finishGeneration: () => void;
  setAbortController: (controller: AbortController | null) => void;
  stopGeneration: () => void;
  clearMessages: () => void;
};

export const useChatStore = create<ChatState>((set, get) => ({
  conversationId: null,
  messages: [],
  isGenerating: false,
  abortController: null,

  setConversation: (id, messages) =>
    set({ conversationId: id, messages, isGenerating: false, abortController: null }),

  setConversationId: (id) => set({ conversationId: id }),

  addUserMessage: (content, attachments) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: crypto.randomUUID(),
          role: "user",
          content,
          createdAt: new Date().toISOString(),
          attachments,
        },
      ],
    })),

  startAssistantMessage: () =>
    set((state) => ({
      isGenerating: true,
      messages: [
        ...state.messages,
        { id: crypto.randomUUID(), role: "assistant", content: "", isStreaming: true, createdAt: new Date().toISOString() },
      ],
    })),

  appendToken: (content) =>
    set((state) => {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant" && last.isStreaming) {
        msgs[msgs.length - 1] = { ...last, content: last.content + content };
      }
      return { messages: msgs };
    }),

  addCitation: (citation) =>
    set((state) => {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") {
        msgs[msgs.length - 1] = {
          ...last,
          citations: [...(last.citations ?? []), citation],
        };
      }
      return { messages: msgs };
    }),

  finishGeneration: () =>
    set((state) => ({
      messages: state.messages.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
      isGenerating: false,
      abortController: null,
    })),

  setAbortController: (controller) => set({ abortController: controller }),

  stopGeneration: () => {
    get().abortController?.abort();
    set((state) => ({
      messages: state.messages.map((m) =>
        m.isStreaming ? { ...m, isStreaming: false, content: m.content + " [stopped]" } : m,
      ),
      isGenerating: false,
      abortController: null,
    }));
  },

  clearMessages: () => set({ conversationId: null, messages: [], isGenerating: false, abortController: null }),
}));
