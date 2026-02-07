"use client";

import { useParams } from "next/navigation";
import { useConversation } from "@/hooks/use-conversations";
import { useChatStore } from "@/stores/chat-store";
import { ChatView } from "@/components/chat/chat-view";
import { ChatSkeleton } from "@/components/chat/chat-skeleton";
import { useEffect } from "react";

function parseDbMessages(messages: { id: string; role: string; content: string; createdAt: string; citations?: string; attachments?: string }[]) {
  return messages.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
    createdAt: m.createdAt,
    citations: m.citations ? JSON.parse(m.citations) : undefined,
    attachments: m.attachments ? JSON.parse(m.attachments) : undefined,
  }));
}

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useConversation(id);
  const setConversation = useChatStore((s) => s.setConversation);
  const storeConversationId = useChatStore((s) => s.conversationId);
  const storeHasMessages = useChatStore((s) => s.messages.length > 0);

  // True when NewChatPage already populated the store before navigating here
  const storeIsPreloaded = storeConversationId === id && storeHasMessages;

  useEffect(() => {
    if (data) {
      // Don't overwrite the store while it's actively streaming — the store
      // already has the live messages managed by NewChatPage / ChatView.
      const { isGenerating, conversationId } = useChatStore.getState();
      if (isGenerating && conversationId === id) return;

      setConversation(id, parseDbMessages(data.messages));
    }
  }, [id, data, setConversation]);

  if (isLoading && !storeIsPreloaded) {
    return <ChatSkeleton />;
  }

  if (error && !storeIsPreloaded) {
    return (
      <div className="flex flex-1 items-center justify-center text-destructive">
        Failed to load conversation. It may have been deleted.
      </div>
    );
  }

  return <ChatView conversationId={id} />;
}
