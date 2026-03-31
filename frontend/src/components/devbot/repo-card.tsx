"use client";

import { Code2, GitBranch, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Repo } from "@chatbot/shared";

type Props = {
  repo: Repo;
  onSelect: (repo: Repo) => void;
  onRemove: (repoId: string) => void;
};

export function RepoCard({ repo, onSelect, onRemove }: Props) {
  return (
    <Card
      className="group cursor-pointer p-4 hover:bg-muted/50 transition-colors"
      onClick={() => onSelect(repo)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(repo);
        }
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Code2 className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{repo.githubRepo}</p>
          <p className="text-xs text-muted-foreground truncate">
            {repo.githubOwner}/{repo.githubRepo}
          </p>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              {repo.defaultBranch}
            </span>
            {repo.language && <span>{repo.language}</span>}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(repo.id);
          }}
          aria-label={`Remove ${repo.githubRepo}`}
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    </Card>
  );
}
