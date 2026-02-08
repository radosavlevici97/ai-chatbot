"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";
import { CitationBadge } from "./citation-badge";
import { ImageLightbox } from "./image-lightbox";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

type Attachment = {
  type: string;
  storagePath: string;
  mimeType: string;
  size?: number;
};

type Citation = { source: string; page: number; relevance: number };

type ChatMessageProps = {
  role: "user" | "assistant" | "system";
  content: string;
  isStreaming?: boolean;
  citations?: Citation[];
  attachments?: Attachment[];
};

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <div className="flex gap-1">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-thinking-dot" style={{ animationDelay: "0ms" }} />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-thinking-dot" style={{ animationDelay: "160ms" }} />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-thinking-dot" style={{ animationDelay: "320ms" }} />
      </div>
      <span className="text-xs text-muted-foreground ml-1">Thinking...</span>
    </div>
  );
}

export function ChatMessage({ role, content, isStreaming, citations, attachments }: ChatMessageProps) {
  const isUser = role === "user";
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const isThinking = isStreaming && !content;

  const imageAttachments = attachments?.filter((a) => a.type === "image") ?? [];

  const imageUrl = (storagePath: string) =>
    `${API_BASE}/${storagePath}`;

  return (
    <>
      <div
        className={cn(
          "flex gap-2 py-3 animate-message-in md:gap-3 md:py-4",
          isUser && "flex-row-reverse",
        )}
      >
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full md:h-8 md:w-8",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </div>
        <div className={cn("flex max-w-[85%] flex-col gap-1 md:max-w-[80%]", isUser && "items-end")}>
          {/* Inline images */}
          {imageAttachments.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {imageAttachments.map((attachment, i) => (
                <img
                  key={i}
                  src={imageUrl(attachment.storagePath)}
                  alt="Uploaded image"
                  className="max-h-48 rounded-lg border cursor-pointer hover:opacity-90 transition-opacity md:max-h-64"
                  loading="lazy"
                  onClick={() => setLightboxSrc(imageUrl(attachment.storagePath))}
                />
              ))}
            </div>
          )}

          {/* Message content */}
          <div
            className={cn(
              "rounded-lg px-4 py-2 text-sm",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground",
            )}
          >
            {isThinking ? (
              <ThinkingIndicator />
            ) : (
              <div className="break-words">
                <p className="whitespace-pre-wrap">
                  {content || "..."}
                </p>
                {isStreaming && content && (
                  <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-current" />
                )}
              </div>
            )}
            {citations && citations.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {citations.map((c, i) => (
                  <CitationBadge key={i} source={c.source} page={c.page} relevance={c.relevance} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox overlay */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </>
  );
}
