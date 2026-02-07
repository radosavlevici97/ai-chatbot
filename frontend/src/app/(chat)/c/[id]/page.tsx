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
  const { setConversation } = useChatStore();

  useEffect(() => {
    if (data) {
      setConversation(id, parseDbMessages(data.messages));
    }
  }, [id, data, setConversation]);

  if (isLoading) {
    return <ChatSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-destructive">
        Failed to load conversation. It may have been deleted.
      </div>
    );
  }

  return <ChatView conversationId={id} />;
}
