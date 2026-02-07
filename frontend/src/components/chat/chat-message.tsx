"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";
import { MarkdownRenderer } from "./markdown-renderer";
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

export function ChatMessage({ role, content, isStreaming, citations, attachments }: ChatMessageProps) {
  const isUser = role === "user";
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const imageAttachments = attachments?.filter((a) => a.type === "image") ?? [];

  const imageUrl = (storagePath: string) =>
    `${API_BASE}/${storagePath}`;

  return (
    <>
      <div className={cn("flex gap-3 py-4", isUser && "flex-row-reverse")}>
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </div>
        <div className={cn("flex max-w-[80%] flex-col gap-1", isUser && "items-end")}>
          {/* Inline images */}
          {imageAttachments.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {imageAttachments.map((attachment, i) => (
                <img
                  key={i}
                  src={imageUrl(attachment.storagePath)}
                  alt="Uploaded image"
                  className="max-h-64 rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
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
                : "bg-muted",
            )}
          >
            <div className="break-words prose prose-sm dark:prose-invert max-w-none">
              {isUser ? (
                content !== "[Image]" && <p className="whitespace-pre-wrap">{content}</p>
              ) : (
                <MarkdownRenderer content={content} />
              )}
              {isStreaming && (
                <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-current" />
              )}
            </div>
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
