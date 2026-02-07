import { z } from "zod";

// ── Upload ──────────────────────────────────────────
export const uploadResponseSchema = z.object({
  id: z.string(),
  originalFilename: z.string(),
  fileType: z.enum(["pdf", "docx", "txt"]),
  fileSize: z.number(),
  status: z.enum(["processing", "indexed", "failed"]),
  chunkCount: z.number(),
  createdAt: z.string(),
});

export type UploadResponse = z.infer<typeof uploadResponseSchema>;

// ── Document status ─────────────────────────────────
export const documentStatusSchema = z.object({
  status: z.enum(["processing", "indexed", "failed"]),
  chunkCount: z.number(),
  errorMessage: z.string().nullable(),
});

export type DocumentStatus = z.infer<typeof documentStatusSchema>;

// ── Document list item ──────────────────────────────
export const documentListItemSchema = z.object({
  id: z.string(),
  originalFilename: z.string(),
  fileType: z.enum(["pdf", "docx", "txt"]),
  fileSize: z.number(),
  status: z.enum(["processing", "indexed", "failed"]),
  chunkCount: z.number(),
  createdAt: z.string(),
});

export type DocumentListItem = z.infer<typeof documentListItemSchema>;

// ── Search ──────────────────────────────────────────
export const documentSearchSchema = z.object({
  query: z.string().min(1, "Search query is required").max(2000),
  topK: z.coerce.number().int().min(1).max(20).default(5),
});

export type DocumentSearchInput = z.infer<typeof documentSearchSchema>;

export const documentSearchResultSchema = z.object({
  text: z.string(),
  filename: z.string(),
  pageNumber: z.number(),
  relevance: z.number(),
});

export type DocumentSearchResult = z.infer<typeof documentSearchResultSchema>;
