"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore } from "@/stores/chat-store";
import { useDevBotStore } from "@/stores/devbot-store";
import { streamChat, streamChatWithUpload, retryChat } from "@/lib/sse-client";
import type { SSECallbacks } from "@/lib/sse-client";
import { useUpdateConversationTitle, conversationKeys } from "@/hooks/use-conversations";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { ChatEmptyState } from "./empty-state";
import { ToolCallStack } from "@/components/devbot/tool-call-stack";
import { ApprovalCard } from "@/components/devbot/approval-card";
import { DevBotChatHeader } from "@/components/devbot/devbot-chat-header";
import { toast } from "sonner";
import type { ConversationMode, Repo } from "@chatbot/shared";

type Props = {
  conversationId: string;
  shouldRetry?: boolean;
  mode?: ConversationMode;
  repo?: Repo | null;
};

export function ChatView({ conversationId, shouldRetry, mode = "chat", repo }: Props) {
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

  const isDevBot = mode === "devbot";
  const {
    toolCallStack,
    pendingApproval,
    workingBranch,
    pushToolCall,
    updateToolCall,
    clearToolCalls,
    setPendingApproval,
    setWorkingBranch,
  } = useDevBotStore();

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
    onToolCall: isDevBot
      ? (event) => {
          if (event.status === "running") {
            pushToolCall(event);
          } else {
            updateToolCall(event.toolName, event.status, event.summary);
          }
          // Detect branch creation from tool calls
          if (event.toolName === "create_branch" && event.status === "completed") {
            const branchMatch = event.summary.match(/branch\s+(\S+)/i);
            if (branchMatch) setWorkingBranch(branchMatch[1]);
          }
        }
      : undefined,
    onApprovalRequest: isDevBot
      ? (approval) => {
          setPendingApproval(approval);
        }
      : undefined,
  }), [conversationId, appendToken, finishGeneration, queryClient, updateTitle, addCitation, isDevBot, pushToolCall, updateToolCall, setPendingApproval, setWorkingBranch]);

  // Auto-retry: if the page loaded with an interrupted stream, re-send
  const retriedRef = useRef(false);
  useEffect(() => {
    if (!shouldRetry || retriedRef.current || isGenerating) return;
    retriedRef.current = true;

    startAssistantMessage();
    const controller = retryChat(conversationId, makeCallbacks());
    setAbortController(controller);
  }, [shouldRetry]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApprove = useCallback(() => {
    setPendingApproval(null);
    handleSendText("Approved");
  }, [setPendingApproval]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReject = useCallback((reason: string) => {
    setPendingApproval(null);
    handleSendText(`Rejected: ${reason}`);
  }, [setPendingApproval]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSendText = useCallback(
    (content: string) => {
      addUserMessage(content);
      startAssistantMessage();
      if (isDevBot) clearToolCalls();
      const callbacks = makeCallbacks();
      const controller = streamChat(conversationId, { content }, callbacks);
      setAbortController(controller);
    },
    [conversationId, addUserMessage, startAssistantMessage, makeCallbacks, setAbortController, isDevBot, clearToolCalls],
  );

  const handleSend = useCallback(
    (content: string, images: File[], options?: { useDocuments?: boolean }) => {
      addUserMessage(content || "[Image]");
      startAssistantMessage();
      if (isDevBot) clearToolCalls();

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
    <div className="flex min-h-0 flex-1 flex-col">
      {/* DevBot header with repo + branch info */}
      {isDevBot && repo && (
        <DevBotChatHeader repo={repo} workingBranch={workingBranch} />
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 md:px-4">
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

            {/* DevBot: tool call stack */}
            {isDevBot && toolCallStack.length > 0 && (
              <ToolCallStack toolCalls={toolCallStack} />
            )}

            {/* DevBot: approval card */}
            {isDevBot && pendingApproval && (
              <ApprovalCard
                approval={pendingApproval}
                onApprove={handleApprove}
                onReject={handleReject}
                disabled={isGenerating}
              />
            )}
          </div>
        )}
      </div>
      <div className="mx-auto w-full max-w-3xl shrink-0 pb-2 md:pb-3">
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
