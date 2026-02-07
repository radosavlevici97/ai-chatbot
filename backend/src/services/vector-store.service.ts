import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import { documentChunks, documents } from "../db/schema.js";
import { getEmbeddingProvider } from "./llm/factory.js";
import { log } from "../middleware/logger.js";

// ── Cosine similarity ────────────────────────────
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Add chunks (embed + store in SQLite) ─────────
export async function addChunks(
  chunks: { text: string; pageNumber?: number; index: number }[],
  metadata: { userId: string; documentId: string; filename: string },
  requestId: string,
): Promise<string[]> {
  const embedder = getEmbeddingProvider();

  const texts = chunks.map((c) => c.text);
  const embeddings = await embedder.embedBatch(texts);

  log.info(
    { requestId, documentId: metadata.documentId, chunkCount: chunks.length },
    "Chunk embeddings complete",
  );

  const ids: string[] = [];

  db.transaction((tx) => {
    for (let i = 0; i < chunks.length; i++) {
      const id = nanoid();
      ids.push(id);
      tx.insert(documentChunks).values({
        id,
        documentId: metadata.documentId,
        chunkIndex: chunks[i].index,
        content: chunks[i].text,
        pageNumber: chunks[i].pageNumber,
        tokenCount: Math.ceil(chunks[i].text.length / 4),
        embedding: JSON.stringify(embeddings[i]),
      }).run();
    }
  });

  log.info(
    { requestId, documentId: metadata.documentId, vectorCount: ids.length },
    "Vectors stored in SQLite",
  );

  return ids;
}

// ── Query chunks (embed query + cosine similarity in JS) ──
export async function queryChunks(
  query: string,
  userId: string,
  topK = 5,
): Promise<{ text: string; filename: string; pageNumber: number; relevance: number }[]> {
  const embedder = getEmbeddingProvider();
  const queryEmbedding = await embedder.embed(query);

  // Load all chunks for this user with their embeddings
  // JOIN documents to get filename and enforce user isolation
  const rows = db
    .select({
      content: documentChunks.content,
      pageNumber: documentChunks.pageNumber,
      embedding: documentChunks.embedding,
      filename: documents.originalFilename,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(
      and(
        eq(documents.userId, userId),
        eq(documents.status, "indexed"),
      ),
    )
    .all();

  if (rows.length === 0) return [];

  // Score each chunk
  const scored = rows.map((row) => {
    const embedding: number[] = JSON.parse(row.embedding);
    return {
      text: row.content,
      filename: row.filename,
      pageNumber: row.pageNumber ?? 0,
      relevance: cosineSimilarity(queryEmbedding, embedding),
    };
  });

  // Sort by relevance descending, take top-k
  scored.sort((a, b) => b.relevance - a.relevance);
  return scored.slice(0, topK).map((r) => ({
    ...r,
    relevance: Math.round(r.relevance * 100) / 100,
  }));
}

// ── Delete (cascades via FK, nothing else needed) ──
export async function deleteDocumentChunks(documentId: string, requestId: string) {
  // Chunks are deleted by CASCADE when the document is deleted from SQL.
  // This function exists for the interface contract — no external store to clean up.
  log.info({ requestId, documentId }, "Vectors will be deleted via SQL CASCADE");
}
