"use client";

import { useParams } from "next/navigation";
import { useConversation } from "@/hooks/use-conversations";
import { useChatStore } from "@/stores/chat-store";
import { ChatView } from "@/components/chat/chat-view";
import { ChatSkeleton } from "@/components/chat/chat-skeleton";
import { useEffect, useState } from "react";

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
  const [shouldRetry, setShouldRetry] = useState(false);

  // True when NewChatPage already populated the store before navigating here
  const storeConversationId = useChatStore((s) => s.conversationId);
  const storeHasMessages = useChatStore((s) => s.messages.length > 0);
  const storeIsPreloaded = storeConversationId === id && storeHasMessages;

  useEffect(() => {
    console.log("[ConversationPage] useEffect fired", { id, hasData: !!data, isLoading });
    if (!data) return;

    const { isGenerating, conversationId } = useChatStore.getState();

    // Don't overwrite the store while actively streaming for this conversation
    if (isGenerating && conversationId === id) {
      console.log("[ConversationPage] SKIP: actively streaming");
      return;
    }

    // Backend filters out streaming placeholders (status="streaming"),
    // so data.messages only contains completed messages.
    console.log("[ConversationPage] messages:", data.messages.length, "last role:", data.messages[data.messages.length - 1]?.role);
    setConversation(id, parseDbMessages(data.messages));

    // Detect interrupted stream: last message is from user with no assistant reply
    const lastMsg = data.messages[data.messages.length - 1];
    if (lastMsg && lastMsg.role === "user") {
      console.log("[ConversationPage] ✅ INTERRUPTED — last msg is user, triggering retry");
      setShouldRetry(true);
    } else {
      console.log("[ConversationPage] No retry needed — last msg role:", lastMsg?.role);
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

  return <ChatView conversationId={id} shouldRetry={shouldRetry} />;
}
