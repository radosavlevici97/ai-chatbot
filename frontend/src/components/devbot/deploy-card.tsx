"use client";

import { Rocket, ExternalLink, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { DeployStatus } from "@chatbot/shared";

type Props = {
  deploy: DeployStatus;
  branch?: string;
};

export function DeployCard({ deploy, branch }: Props) {
  return (
    <Card className="my-3 overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
        <Rocket className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">
          {deploy.status === "deploying" ? "Deploying..." : "Preview Deployed"}
        </span>
      </div>

      <div className="px-4 py-3 space-y-2">
        {branch && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Branch:</span>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {branch}
            </code>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <span>Status:</span>
          <StatusBadge status={deploy.status} />
        </div>

        {deploy.status === "deployed" && deploy.previewUrl && (
          <a
            href={deploy.previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Open Preview
          </a>
        )}

        {deploy.status === "failed" && deploy.error && (
          <p className="text-xs text-destructive">{deploy.error}</p>
        )}
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: DeployStatus["status"] }) {
  switch (status) {
    case "deploying":
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Deploying
        </span>
      );
    case "deployed":
      return (
        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-500">
          <CheckCircle2 className="h-3 w-3" />
          Live
        </span>
      );
    case "failed":
      return (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <XCircle className="h-3 w-3" />
          Failed
        </span>
      );
  }
}
