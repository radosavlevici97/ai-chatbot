"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateConversation, useUpdateConversationTitle, conversationKeys } from "@/hooks/use-conversations";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatEmptyState } from "@/components/chat/empty-state";
import { useChatStore } from "@/stores/chat-store";
import { streamChat } from "@/lib/sse-client";
import { toast } from "sonner";

export default function NewChatPage() {
  const router = useRouter();
  const createMutation = useCreateConversation();
  const updateTitle = useUpdateConversationTitle();
  const queryClient = useQueryClient();
  const {
    addUserMessage,
    startAssistantMessage,
    appendToken,
    finishGeneration,
    setAbortController,
    setConversation,
    isGenerating,
    stopGeneration,
  } = useChatStore();

  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const handleSend = useCallback(
    async (content: string, images: File[], options?: { useDocuments?: boolean }) => {
      const conv = await createMutation.mutateAsync({ model: "gemini-2.5-flash" });

      setConversation(conv.id, []);
      addUserMessage(content || "[Image]");
      startAssistantMessage();

      router.push(`/c/${conv.id}`);

      const callbacks = {
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
          updateTitle(conv.id, title);
        },
        onInfo: (message: string) => {
          toast.warning(message, { duration: 8000 });
        },
      };

      if (images.length > 0) {
        setIsUploading(true);
        setUploadProgress(0);

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

        xhr.addEventListener("load", () => {
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

        xhr.open("POST", `${API_BASE}/conversations/${conv.id}/messages`);
        xhr.withCredentials = true;
        xhr.send(formData);

        const controller = new AbortController();
        controller.signal.addEventListener("abort", () => xhr.abort());
        setAbortController(controller);
      } else {
        const controller = streamChat(conv.id, { content, useDocuments: options?.useDocuments }, callbacks);
        setAbortController(controller);
      }
    },
    [createMutation, router, setConversation, addUserMessage, startAssistantMessage, appendToken, finishGeneration, setAbortController, updateTitle, queryClient],
  );

  return (
    <div className="flex h-full flex-col">
      <ChatEmptyState onPromptClick={(prompt) => handleSend(prompt, [])} />
      <div className="mx-auto w-full max-w-3xl">
        <ChatInput
          onSend={handleSend}
          onStop={stopGeneration}
          isGenerating={isGenerating || createMutation.isPending}
          disabled={createMutation.isPending}
          uploadProgress={uploadProgress}
          isUploading={isUploading}
        />
      </div>
    </div>
  );
}
