"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  Repo,
  DevBotSettings,
  ConnectRepoInput,
  SaveTokenInput,
  Conversation,
  CreateDevBotConversationInput,
} from "@chatbot/shared";
import { conversationKeys } from "./use-conversations";

// ── Query Keys ───────────────────────────────────

export const devbotKeys = {
  all: ["devbot"] as const,
  settings: () => [...devbotKeys.all, "settings"] as const,
  repos: () => [...devbotKeys.all, "repos"] as const,
};

// ── Settings (token status) ──────────────────────

export function useDevBotSettings() {
  return useQuery({
    queryKey: devbotKeys.settings(),
    queryFn: () => api.get<DevBotSettings>("/devbot/settings"),
    staleTime: 60_000,
  });
}

// ── Save GitHub token ────────────────────────────

export function useSaveToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveTokenInput) =>
      api.put<DevBotSettings>("/devbot/settings/token", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: devbotKeys.settings() });
      queryClient.invalidateQueries({ queryKey: devbotKeys.repos() });
    },
  });
}

// ── Remove GitHub token ──────────────────────────

export function useRemoveToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.delete<{ deleted: boolean }>("/devbot/settings/token"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: devbotKeys.settings() });
      queryClient.invalidateQueries({ queryKey: devbotKeys.repos() });
    },
  });
}

// ── List repos ───────────────────────────────────

export function useRepos() {
  return useQuery({
    queryKey: devbotKeys.repos(),
    queryFn: () => api.get<Repo[]>("/devbot/repos"),
    staleTime: 30_000,
  });
}

// ── Connect a new repo ───────────────────────────

export function useConnectRepo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ConnectRepoInput) =>
      api.post<Repo>("/devbot/repos", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: devbotKeys.repos() });
    },
  });
}

// ── Remove a repo ────────────────────────────────

export function useRemoveRepo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (repoId: string) =>
      api.delete<{ deleted: boolean }>(`/devbot/repos/${repoId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: devbotKeys.repos() });
    },
  });
}

// ── Create DevBot conversation ───────────────────

export function useCreateDevBotConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDevBotConversationInput) =>
      api.post<Conversation>("/conversations", { ...input, mode: "devbot" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.list("devbot") });
    },
  });
}
