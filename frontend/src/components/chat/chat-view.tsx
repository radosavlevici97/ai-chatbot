"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore } from "@/stores/chat-store";
import { streamChat, streamChatWithUpload, retryChat } from "@/lib/sse-client";
import type { SSECallbacks } from "@/lib/sse-client";
import { useUpdateConversationTitle, conversationKeys } from "@/hooks/use-conversations";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { ChatEmptyState } from "./empty-state";
import { toast } from "sonner";

type Props = {
  conversationId: string;
  shouldRetry?: boolean;
};

export function ChatView({ conversationId, shouldRetry }: Props) {
  const {
    messages,
    isGenerating,
    addUserMessage,
    startAssistantMessage,
    appendToken,
    addCitation,
    finishGeneration,
    setAbortController,
    stopGeneration,
  } = useChatStore();

  const updateTitle = useUpdateConversationTitle();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const makeCallbacks = useCallback((): SSECallbacks => ({
    onToken: (token) => appendToken(token),
    onDone: () => {
      finishGeneration();
      queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
    },
    onError: (error, code) => {
      finishGeneration();
      if (code === "RATE_LIMITED") {
        toast.warning("Rate limit reached", {
          description: "Please wait a moment and try again.",
          duration: 8000,
        });
      } else {
        toast.error("Failed to send message", {
          description: error || "Please check your connection and try again.",
        });
      }
    },
    onTitle: (title) => updateTitle(conversationId, title),
    onCitation: (citation) => addCitation(citation),
    onInfo: (message) => toast.warning(message, { duration: 8000 }),
  }), [conversationId, appendToken, finishGeneration, queryClient, updateTitle, addCitation]);

  // Auto-retry: if the page loaded with an interrupted stream, re-send
  const retriedRef = useRef(false);
  useEffect(() => {
    if (!shouldRetry || retriedRef.current || isGenerating) return;
    retriedRef.current = true;

    startAssistantMessage();
    const controller = retryChat(conversationId, makeCallbacks());
    setAbortController(controller);
  }, [shouldRetry]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(
    (content: string, images: File[], options?: { useDocuments?: boolean }) => {
      addUserMessage(content || "[Image]");
      startAssistantMessage();

      const callbacks = makeCallbacks();

      if (images.length > 0) {
        setIsUploading(true);
        setUploadProgress(0);

        const controller = streamChatWithUpload(
          conversationId,
          { content, images, useDocuments: options?.useDocuments },
          callbacks,
          {
            onProgress: (percent) => setUploadProgress(percent),
            onUploadComplete: () => {
              setIsUploading(false);
              setUploadProgress(100);
            },
          },
        );
        setAbortController(controller);
      } else {
        const controller = streamChat(
          conversationId,
          { content, useDocuments: options?.useDocuments },
          callbacks,
        );
        setAbortController(controller);
      }
    },
    [conversationId, addUserMessage, startAssistantMessage, makeCallbacks, setAbortController],
  );

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 md:px-4">
        {messages.length === 0 ? (
          <ChatEmptyState onPromptClick={(prompt) => handleSend(prompt, [])} />
        ) : (
          <div className="mx-auto max-w-3xl py-4" role="log" aria-live="polite">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                role={msg.role}
                content={msg.content}
                isStreaming={msg.isStreaming}
                citations={msg.citations}
                attachments={msg.attachments}
              />
            ))}
          </div>
        )}
      </div>
      <div className="mx-auto w-full max-w-3xl">
        <ChatInput
          onSend={handleSend}
          onStop={stopGeneration}
          isGenerating={isGenerating}
          uploadProgress={uploadProgress}
          isUploading={isUploading}
        />
      </div>
    </div>
  );
}
