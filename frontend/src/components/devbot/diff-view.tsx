"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  path: string;
  diff: string;
  defaultOpen?: boolean;
};

export function DiffView({ path, diff, defaultOpen = true }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const lines = diff.split("\n");

  return (
    <div className="rounded-md border overflow-hidden text-sm">
      {/* File header */}
      <button
        type="button"
        className="flex w-full items-center gap-2 bg-muted/50 px-3 py-2 text-left font-mono text-xs hover:bg-muted transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span className="truncate">{path}</span>
      </button>

      {/* Diff content */}
      {open && (
        <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
          <pre className="p-0 m-0">
            {lines.map((line, i) => {
              const isAdd = line.startsWith("+");
              const isRemove = line.startsWith("-");

              return (
                <div
                  key={i}
                  className={cn(
                    "px-3 py-0.5 font-mono text-xs leading-5 whitespace-pre",
                    isAdd && "bg-green-500/10 text-green-700 dark:text-green-400",
                    isRemove && "bg-red-500/10 text-red-700 dark:text-red-400",
                    !isAdd && !isRemove && "text-muted-foreground",
                  )}
                >
                  {line}
                </div>
              );
            })}
          </pre>
        </div>
      )}
    </div>
  );
}
