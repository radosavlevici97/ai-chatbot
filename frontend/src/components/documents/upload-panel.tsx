"use client";

import { useCallback, useState } from "react";
import { Upload } from "lucide-react";
import { useUploadDocument } from "@/hooks/use-documents";

export function UploadPanel() {
  const uploadMutation = useUploadDocument();
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      try {
        await uploadMutation.mutateAsync(file);
      } catch {
        // Error handled by TanStack Query — accessible via uploadMutation.error
      }
    },
    [uploadMutation],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) await handleFile(file);
    },
    [handleFile],
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) await handleFile(file);
    },
    [handleFile],
  );

  return (
    <div
      className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "hover:border-primary/50"
      }`}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
    >
      <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
      <p className="mt-2 text-sm font-medium">
        {uploadMutation.isPending ? "Processing..." : "Drop files here or click to upload"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">PDF, DOCX, TXT -- max 25MB</p>

      {uploadMutation.isError && (
        <p className="mt-2 text-sm text-destructive">
          {uploadMutation.error instanceof Error
            ? uploadMutation.error.message
            : "Upload failed"}
        </p>
      )}

      <input
        type="file"
        accept=".pdf,.docx,.txt"
        onChange={handleFileSelect}
        className="absolute inset-0 cursor-pointer opacity-0"
        disabled={uploadMutation.isPending}
      />
    </div>
  );
}
