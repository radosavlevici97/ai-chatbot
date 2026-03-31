"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TokenSetup } from "./token-setup";
import { PasteRepoBar } from "./paste-repo-bar";
import { RepoCard } from "./repo-card";
import { useDevBotSettings, useRepos, useRemoveRepo, useCreateDevBotConversation } from "@/hooks/use-devbot";
import { useChatStore } from "@/stores/chat-store";
import type { Repo } from "@chatbot/shared";
import { toast } from "sonner";

export function DevBotHome() {
  const router = useRouter();
  const { data: settings, isLoading: settingsLoading } = useDevBotSettings();
  const { data: repos, isLoading: reposLoading } = useRepos();
  const removeMutation = useRemoveRepo();
  const createConversation = useCreateDevBotConversation();

  const handleSelectRepo = async (repo: Repo) => {
    try {
      const conv = await createConversation.mutateAsync({
        repoId: repo.id,
        title: repo.githubRepo,
      });
      useChatStore.getState().clearMessages();
      router.push(`/c/${conv.id}`);
    } catch {
      toast.error("Failed to create DevBot conversation");
    }
  };

  const handleRemoveRepo = async (repoId: string) => {
    try {
      await removeMutation.mutateAsync(repoId);
      toast.success("Repo removed");
    } catch {
      toast.error("Failed to remove repo");
    }
  };

  if (settingsLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasToken = settings?.hasToken ?? false;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">DevBot</h1>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-lg space-y-4 px-4 py-6">
        {/* Token setup — always visible (collapsed when connected) */}
        {!hasToken ? (
          <TokenSetup settings={settings ?? null} />
        ) : (
          <>
            {/* Paste bar */}
            <PasteRepoBar />

            {/* Repo list */}
            <div>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Your Repos
              </h2>
              {reposLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : repos && repos.length > 0 ? (
                <div className="space-y-2">
                  {repos.map((repo) => (
                    <RepoCard
                      key={repo.id}
                      repo={repo}
                      onSelect={handleSelectRepo}
                      onRemove={handleRemoveRepo}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No repos connected yet. Paste a GitHub URL above to get started.
                </p>
              )}
            </div>

            {/* Token settings at bottom */}
            <div className="pt-4 border-t">
              <TokenSetup settings={settings ?? null} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
