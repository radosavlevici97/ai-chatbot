"use client";

import { GitPullRequest, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";

type Props = {
  prNumber: number;
  title: string;
  headBranch: string;
  baseBranch: string;
  url: string;
};

export function PRCard({ prNumber, title, headBranch, baseBranch, url }: Props) {
  return (
    <Card className="my-3 overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
        <GitPullRequest className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Pull Request Opened</span>
      </div>

      <div className="px-4 py-3 space-y-2">
        <p className="text-sm font-medium">
          #{prNumber} {title}
        </p>
        <p className="text-xs text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
            {headBranch}
          </code>
          {" → "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
            {baseBranch}
          </code>
        </p>

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          View on GitHub
        </a>
      </div>
    </Card>
  );
}
