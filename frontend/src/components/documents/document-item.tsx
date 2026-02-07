"use client";

import { FileText, Trash2, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeleteDocument, useDocumentStatus } from "@/hooks/use-documents";
import type { DocumentListItem } from "@chatbot/shared";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_ICONS = {
  processing: <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />,
  indexed: <CheckCircle className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
};

type Props = {
  document: DocumentListItem;
};

export function DocumentItem({ document: doc }: Props) {
  const deleteMutation = useDeleteDocument();

  const { data: statusData } = useDocumentStatus(
    doc.id,
    doc.status === "processing",
  );

  const currentStatus = statusData?.status ?? doc.status;

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <FileText className="h-8 w-8 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{doc.originalFilename}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{doc.fileType.toUpperCase()}</span>
          <span>{formatFileSize(doc.fileSize)}</span>
          {currentStatus === "indexed" && (
            <span>{statusData?.chunkCount ?? doc.chunkCount} chunks</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {STATUS_ICONS[currentStatus as keyof typeof STATUS_ICONS]}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => deleteMutation.mutate(doc.id)}
          disabled={deleteMutation.isPending}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
