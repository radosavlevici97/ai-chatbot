"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import type { DocumentListItem, PaginatedResponse } from "@chatbot/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

// ── Query: document list ────────────────────────────
export function useDocuments(limit = 20) {
  return useQuery({
    queryKey: ["documents", { limit }],
    queryFn: () =>
      api.get<PaginatedResponse<DocumentListItem>>(`/documents?limit=${limit}`),
    staleTime: 30_000,
  });
}

// ── Mutation: upload ────────────────────────────────
export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(
        `${API_BASE}/documents/upload`,
        {
          method: "POST",
          credentials: "include",
          body: formData,
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Upload failed", code: "UNKNOWN" }));
        throw new ApiError(res.status, body.code, body.error, body.requestId);
      }

      const json = await res.json();
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

// ── Mutation: delete ────────────────────────────────
export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

// ── Query: document status (polling) ────────────────
export function useDocumentStatus(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["documents", id, "status"],
    queryFn: () =>
      api.get<{ status: string; chunkCount: number; errorMessage: string | null }>(
        `/documents/${id}/status`,
      ),
    enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "processing" ? 2000 : false;
    },
  });
}
