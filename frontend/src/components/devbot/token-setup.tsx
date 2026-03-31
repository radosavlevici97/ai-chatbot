"use client";

import { useState } from "react";
import { KeyRound, ExternalLink, Loader2, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSaveToken, useRemoveToken } from "@/hooks/use-devbot";
import type { DevBotSettings } from "@chatbot/shared";
import { toast } from "sonner";

type Props = {
  settings: DevBotSettings | null;
};

export function TokenSetup({ settings }: Props) {
  const [token, setToken] = useState("");
  const [showForm, setShowForm] = useState(!settings?.hasToken);

  const saveMutation = useSaveToken();
  const removeMutation = useRemoveToken();

  const handleSave = async () => {
    const trimmed = token.trim();
    if (!trimmed) return;

    if (!/^gh[ps]_/.test(trimmed)) {
      toast.error("Invalid token", { description: "Must start with ghp_ or ghs_" });
      return;
    }

    try {
      await saveMutation.mutateAsync({ token: trimmed });
      setToken("");
      setShowForm(false);
      toast.success("GitHub token saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save token";
      toast.error(msg);
    }
  };

  const handleRemove = async () => {
    try {
      await removeMutation.mutateAsync();
      setShowForm(true);
      toast.success("GitHub token removed");
    } catch {
      toast.error("Failed to remove token");
    }
  };

  // Connected state — show username + change/remove options
  if (settings?.hasToken && !showForm) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={settings.avatarUrl ?? undefined} />
            <AvatarFallback>
              {settings.githubUsername?.charAt(0).toUpperCase() ?? "G"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              Connected as @{settings.githubUsername}
            </p>
            <p className="text-xs text-muted-foreground">GitHub token active</p>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowForm(true)}
            >
              Change
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={removeMutation.isPending}
              className="text-destructive hover:text-destructive"
            >
              {removeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // Setup form — first time or changing token
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <KeyRound className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Connect GitHub</h2>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Paste your GitHub Personal Access Token to get started.
      </p>

      <div className="space-y-3">
        <div>
          <Label htmlFor="github-token" className="sr-only">
            GitHub Token
          </Label>
          <Input
            id="github-token"
            type="password"
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
          />
        </div>

        <div className="flex items-center justify-between">
          <a
            href="https://github.com/settings/tokens/new?scopes=repo&description=AI+ChatBot+DevBot"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Needs <code className="text-xs">repo</code> scope
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={!token.trim() || saveMutation.isPending}
            className="flex-1"
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Save Token
          </Button>
          {settings?.hasToken && (
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
