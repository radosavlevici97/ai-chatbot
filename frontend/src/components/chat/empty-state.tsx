"use client";

import { Sparkles } from "lucide-react";

const SUGGESTED_PROMPTS = [
  "Explain quantum computing simply",
  "Write a Python sorting algorithm",
  "Summarize this PDF for me",
  "Help me draft a professional email",
];

type Props = {
  onPromptClick?: (prompt: string) => void;
};

export function ChatEmptyState({ onPromptClick }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <Sparkles className="h-10 w-10 text-muted-foreground/50 md:h-12 md:w-12" />
      <div>
        <h2 className="text-lg font-semibold">Start a conversation</h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          Ask me anything. I can help with analysis, writing, code, and more.
          Upload documents or images for context.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 max-w-md">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            className="rounded-full border px-3 py-1.5 text-xs hover:bg-muted active:bg-muted transition"
            onClick={() => onPromptClick?.(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
