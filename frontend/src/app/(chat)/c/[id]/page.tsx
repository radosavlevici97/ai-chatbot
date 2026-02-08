"use client";

import { useParams } from "next/navigation";
import { useConversation } from "@/hooks/use-conversations";
import { useChatStore } from "@/stores/chat-store";
import { ChatView } from "@/components/chat/chat-view";
import { ChatSkeleton } from "@/components/chat/chat-skeleton";
import { parseDbMessages } from "@/lib/message-utils";
import { useEffect, useState } from "react";

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
    if (!data) return;

    const { isGenerating, conversationId } = useChatStore.getState();

    // Don't overwrite the store while actively streaming for this conversation
    if (isGenerating && conversationId === id) return;

    setConversation(id, parseDbMessages(data.messages));

    // Detect interrupted stream: last message is from user with no assistant reply
    const lastMsg = data.messages[data.messages.length - 1];
    if (lastMsg && lastMsg.role === "user") {
      setShouldRetry(true);
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
