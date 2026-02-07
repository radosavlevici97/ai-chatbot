"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  Conversation,
  ConversationListItem,
  ConversationWithMessages,
  CreateConversationInput,
  PaginatedResponse,
} from "@chatbot/shared";

// ── Query Keys ───────────────────────────────────

export const conversationKeys = {
  all: ["conversations"] as const,
  list: () => [...conversationKeys.all, "list"] as const,
  detail: (id: string) => [...conversationKeys.all, "detail", id] as const,
};

// ── List conversations (infinite scroll / cursor pagination) ──

export function useConversations() {
  return useInfiniteQuery({
    queryKey: conversationKeys.list(),
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set("cursor", pageParam);
      params.set("limit", "20");
      return api.get<PaginatedResponse<ConversationListItem>>(
        `/conversations?${params.toString()}`,
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}

// ── Get single conversation with messages ────────

export function useConversation(id: string) {
  return useQuery({
    queryKey: conversationKeys.detail(id),
    queryFn: () => api.get<ConversationWithMessages>(`/conversations/${id}`),
    enabled: !!id,
  });
}

// ── Create conversation ──────────────────────────

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateConversationInput) =>
      api.post<Conversation>("/conversations", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
    },
  });
}

// ── Rename conversation ──────────────────────────

export function useRenameConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.put<Conversation>(`/conversations/${id}`, { title }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
      queryClient.invalidateQueries({ queryKey: conversationKeys.detail(id) });
    },
  });
}

// ── Delete conversation ──────────────────────────

export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete<{ deleted: boolean }>(`/conversations/${id}`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
      queryClient.removeQueries({ queryKey: conversationKeys.detail(id) });
    },
  });
}

// ── Update title from SSE (called after auto-title) ──

export function useUpdateConversationTitle() {
  const queryClient = useQueryClient();

  return (id: string, title: string) => {
    queryClient.setQueriesData(
      { queryKey: conversationKeys.list() },
      (old: unknown) => {
        const data = old as { pages: PaginatedResponse<ConversationListItem>[] } | undefined;
        if (!data?.pages) return old;
        return {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            data: page.data.map((conv) =>
              conv.id === id ? { ...conv, title } : conv,
            ),
          })),
        };
      },
    );
  };
}
