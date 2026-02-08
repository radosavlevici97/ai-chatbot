"use client";

import { UploadPanel } from "@/components/documents/upload-panel";
import { DocumentList } from "@/components/documents/document-list";

export default function DocumentsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:space-y-6 md:p-6 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold">Document Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload documents to enable AI-powered search and Q&A across your files.
        </p>
      </div>
      <UploadPanel />
      <DocumentList />
    </div>
  );
}
