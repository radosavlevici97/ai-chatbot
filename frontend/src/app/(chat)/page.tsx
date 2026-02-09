"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateConversation, useUpdateConversationTitle, conversationKeys } from "@/hooks/use-conversations";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatEmptyState } from "@/components/chat/empty-state";
import { ChatMessage } from "@/components/chat/chat-message";
import { useChatStore } from "@/stores/chat-store";
import { streamChat, streamChatWithUpload } from "@/lib/sse-client";
import type { SSECallbacks } from "@/lib/sse-client";
import { toast } from "sonner";

export default function NewChatPage() {
  const router = useRouter();
  const createMutation = useCreateConversation();
  const updateTitle = useUpdateConversationTitle();
  const queryClient = useQueryClient();
  const {
    messages,
    addUserMessage,
    startAssistantMessage,
    appendToken,
    finishGeneration,
    setAbortController,
    setConversationId,
    isGenerating,
    stopGeneration,
  } = useChatStore();

  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  // Track that we already fired off a send so we don't double-submit
  const [isSending, setIsSending] = useState(false);

  const handleSend = useCallback(
    async (content: string, images: File[], options?: { useDocuments?: boolean }) => {
      if (isSending) return;
      setIsSending(true);

      // Show user message + thinking indicator IMMEDIATELY — before any API call
      addUserMessage(content || "[Image]");
      startAssistantMessage();

      try {
        // Now create the conversation in the background
        const conv = await createMutation.mutateAsync({ model: "gemini-2.5-flash" });

        setConversationId(conv.id);

        router.push(`/c/${conv.id}`);

        const callbacks: SSECallbacks = {
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
          onTitle: (title) => updateTitle(conv.id, title),
          onInfo: (message) => toast.warning(message, { duration: 8000 }),
        };

        if (images.length > 0) {
          setIsUploading(true);
          setUploadProgress(0);

          const controller = streamChatWithUpload(
            conv.id,
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
          const controller = streamChat(conv.id, { content, useDocuments: options?.useDocuments }, callbacks);
          setAbortController(controller);
        }
      } catch {
        finishGeneration();
        toast.error("Failed to start conversation");
        setIsSending(false);
      }
    },
    [isSending, createMutation, router, setConversationId, addUserMessage, startAssistantMessage, appendToken, finishGeneration, setAbortController, updateTitle, queryClient],
  );

  // Show messages inline while the conversation is being created
  const showMessages = messages.length > 0;

  return (
    <div className="flex h-full flex-col">
      {showMessages ? (
        <div className="flex-1 overflow-y-auto px-3 md:px-4">
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
        </div>
      ) : (
        <ChatEmptyState onPromptClick={(prompt) => handleSend(prompt, [])} />
      )}
      <div className="mx-auto w-full max-w-3xl shrink-0 pb-2 md:pb-3">
        <ChatInput
          onSend={handleSend}
          onStop={stopGeneration}
          isGenerating={isGenerating}
          disabled={isSending && !isGenerating}
          uploadProgress={uploadProgress}
          isUploading={isUploading}
        />
      </div>
    </div>
  );
}
