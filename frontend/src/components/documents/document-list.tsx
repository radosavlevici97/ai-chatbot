"use client";

import { useDocuments } from "@/hooks/use-documents";
import { DocumentItem } from "./document-item";

export function DocumentList() {
  const { data, isLoading, isError, error } = useDocuments();

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="p-4 text-sm text-destructive">
        Failed to load documents: {error instanceof Error ? error.message : "Unknown error"}
      </p>
    );
  }

  const documents = data?.data ?? [];

  if (documents.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No documents uploaded yet. Upload a PDF, DOCX, or TXT file to get started.
      </p>
    );
  }

  return (
    <div className="space-y-2 p-4">
      {documents.map((doc) => (
        <DocumentItem key={doc.id} document={doc} />
      ))}
    </div>
  );
}
