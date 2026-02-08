"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore } from "@/stores/chat-store";
import { streamChat, retryChat } from "@/lib/sse-client";
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

  // Auto-retry: if the page loaded with an interrupted stream, re-send
  const retriedRef = useRef(false);
  useEffect(() => {
    console.log("[ChatView] retry effect:", { shouldRetry, retriedRef: retriedRef.current, isGenerating, conversationId });
    if (!shouldRetry || retriedRef.current || isGenerating) {
      console.log("[ChatView] retry SKIPPED:", { shouldRetry, alreadyRetried: retriedRef.current, isGenerating });
      return;
    }
    retriedRef.current = true;
    console.log("[ChatView] 🔄 RETRYING — calling retryChat for", conversationId);

    startAssistantMessage();

    const callbacks = {
      onToken: (token: string) => {
        appendToken(token);
      },
      onDone: () => {
        console.log("[ChatView] retry onDone — stream completed");
        finishGeneration();
        queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
      },
      onError: (error: string, code?: string) => {
        console.error("[ChatView] retry onError:", error, code);
        finishGeneration();
        toast.error("Failed to regenerate response", {
          description: error || "Please try again.",
        });
      },
      onTitle: (title: string) => updateTitle(conversationId, title),
      onCitation: (citation: { source: string; page: number; relevance: number }) => addCitation(citation),
      onInfo: (message: string) => toast.warning(message, { duration: 8000 }),
    };

    const controller = retryChat(conversationId, callbacks);
    setAbortController(controller);
  }, [shouldRetry]); // eslint-disable-line react-hooks/exhaustive-deps

  const makeCallbacks = useCallback(() => ({
    onToken: (token: string) => appendToken(token),
    onDone: () => {
      finishGeneration();
      queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
    },
    onError: (error: string, code?: string) => {
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
    onTitle: (title: string) => {
      updateTitle(conversationId, title);
    },
    onCitation: (citation: { source: string; page: number; relevance: number }) => {
      addCitation(citation);
    },
    onInfo: (message: string) => {
      toast.warning(message, { duration: 8000 });
    },
  }), [conversationId, appendToken, finishGeneration, queryClient, updateTitle, addCitation]);

  const handleSend = useCallback(
    (content: string, images: File[], options?: { useDocuments?: boolean }) => {
      addUserMessage(content || "[Image]");
      startAssistantMessage();

      const callbacks = makeCallbacks();

      if (images.length > 0) {
        setIsUploading(true);
        setUploadProgress(0);

        // Use XHR for upload progress tracking
        const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
        const formData = new FormData();
        formData.append("content", content);
        if (options?.useDocuments) formData.append("useDocuments", "true");
        for (const image of images) {
          formData.append("images", image);
        }

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener("load", async () => {
          setIsUploading(false);
          setUploadProgress(100);

          if (xhr.status >= 400) {
            try {
              const err = JSON.parse(xhr.responseText);
              callbacks.onError(err.error ?? "Upload failed", err.code);
            } catch {
              callbacks.onError("Upload failed");
            }
            return;
          }

          // Parse SSE from XHR response
          const lines = xhr.responseText.split("\n");
          let currentEvent = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ") && currentEvent) {
              try {
                const data = JSON.parse(line.slice(6));
                switch (currentEvent) {
                  case "token": callbacks.onToken(data.content); break;
                  case "done": callbacks.onDone(); break;
                  case "error": callbacks.onError(data.error, data.code); break;
                  case "title": callbacks.onTitle(data.title); break;
                  case "citation": callbacks.onCitation(data); break;
                  case "info": callbacks.onInfo?.(data.message); break;
                }
              } catch { /* skip malformed */ }
              currentEvent = "";
            }
          }
        });

        xhr.addEventListener("error", () => {
          setIsUploading(false);
          callbacks.onError("Upload failed. Check your connection.");
        });

        xhr.addEventListener("abort", () => {
          setIsUploading(false);
          finishGeneration();
        });

        xhr.open("POST", `${API_BASE}/conversations/${conversationId}/messages`);
        xhr.withCredentials = true;
        xhr.send(formData);

        // Create an abort controller that wraps XHR abort
        const controller = new AbortController();
        controller.signal.addEventListener("abort", () => xhr.abort());
        setAbortController(controller);
      } else {
        // Text-only — standard fetch with SSE streaming
        const controller = streamChat(
          conversationId,
          { content, useDocuments: options?.useDocuments },
          callbacks,
        );
        setAbortController(controller);
      }
    },
    [conversationId, addUserMessage, startAssistantMessage, makeCallbacks, setAbortController, finishGeneration],
  );

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 md:px-4">
        {messages.length === 0 ? (
          <ChatEmptyState onPromptClick={(prompt) => handleSend(prompt, [])} />
        ) : (
          <div className="mx-auto max-w-3xl py-4">
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
