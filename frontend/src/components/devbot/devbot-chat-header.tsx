"use client";

import { GitBranch } from "lucide-react";
import type { Repo } from "@chatbot/shared";

type Props = {
  repo: Repo;
  workingBranch: string | null;
};

export function DevBotChatHeader({ repo, workingBranch }: Props) {
  const branch = workingBranch ?? repo.defaultBranch;

  return (
    <div className="flex items-center gap-2 border-b px-4 py-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{repo.githubRepo}</span>
          <span className="flex items-center gap-1 shrink-0">
            <GitBranch className="h-3 w-3 text-muted-foreground" />
            <code
              className={`rounded px-1.5 py-0.5 text-xs font-mono ${
                workingBranch
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {branch}
            </code>
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {repo.githubOwner}/{repo.githubRepo}
        </p>
      </div>
    </div>
  );
}
