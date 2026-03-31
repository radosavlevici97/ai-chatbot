"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, XCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCallEvent } from "@chatbot/shared";

type Props = {
  toolCalls: ToolCallEvent[];
};

const MAX_VISIBLE = 4;

export function ToolCallStack({ toolCalls }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (toolCalls.length === 0) return null;

  const visibleCalls = expanded ? toolCalls : toolCalls.slice(-MAX_VISIBLE);
  const hiddenCount = toolCalls.length - MAX_VISIBLE;

  return (
    <div className="my-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
      {/* Expand toggle */}
      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className="h-3 w-3" />
          Show {hiddenCount} more
        </button>
      )}

      {visibleCalls.map((tc, i) => (
        <div key={`${tc.toolName}-${i}`} className="flex items-center gap-2 py-0.5">
          <StatusIcon status={tc.status} />
          <span
            className={cn(
              "truncate text-xs",
              tc.status === "running" && "text-foreground",
              tc.status === "completed" && "text-muted-foreground",
              tc.status === "failed" && "text-destructive",
            )}
          >
            {tc.summary}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatusIcon({ status }: { status: ToolCallEvent["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />;
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-500" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />;
  }
}
