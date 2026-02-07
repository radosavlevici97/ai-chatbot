import { and, eq, gt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import { documents } from "../db/schema.js";
import { validateAndStore, deleteFile } from "./upload.service.js";
import { extractText } from "./extraction.service.js";
import { chunkText } from "./chunking.service.js";
import * as vectorStore from "./vector-store.service.js";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";
import { log } from "../middleware/logger.js";

export async function processUpload(
  buffer: Buffer,
  originalFilename: string,
  userId: string,
  requestId: string,
) {
  log.info({ requestId, userId, originalFilename, fileSize: buffer.length }, "Upload started");

  // 1. Validate and store file
  const { filename, fileType, storagePath, fileSize } = await validateAndStore(
    buffer,
    originalFilename,
    userId,
    requestId,
  );

  // 2. Create document record
  const docId = nanoid();

  db.transaction((tx) => {
    tx.insert(documents).values({
      id: docId,
      userId,
      filename,
      originalFilename,
      fileType,
      fileSize,
      storagePath,
      status: "processing",
    }).run();
  });

  // 3. Process pipeline
  try {
    const pages = await extractText(storagePath, fileType, requestId);
    log.info({ requestId, docId, pageCount: pages.length }, "Extraction complete");

    const chunks = chunkText(pages, requestId);
    log.info({ requestId, docId, chunkCount: chunks.length }, "Chunking complete");

    // Embed and store chunks in SQLite (vector-store handles both)
    const chunkIds = await vectorStore.addChunks(chunks, {
      userId,
      documentId: docId,
      filename: originalFilename,
    }, requestId);
    log.info({ requestId, docId, vectorCount: chunkIds.length }, "Indexing complete");

    // Update document status
    db.update(documents)
      .set({ status: "indexed", chunkCount: chunks.length })
      .where(eq(documents.id, docId))
      .run();

    log.info({ requestId, docId, status: "indexed" }, "Document processing complete");
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    db.update(documents)
      .set({ status: "failed", errorMessage })
      .where(eq(documents.id, docId))
      .run();

    log.error({ requestId, docId, error: errorMessage }, "Document processing failed");
    throw err;
  }

  return db.select().from(documents).where(eq(documents.id, docId)).get()!;
}

export function listDocuments(
  userId: string,
  cursor?: string,
  limit = 20,
) {
  let rows;

  if (cursor) {
    const cursorDoc = db.select().from(documents).where(eq(documents.id, cursor)).get();
    if (cursorDoc) {
      rows = db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.userId, userId),
            gt(documents.createdAt, cursorDoc.createdAt),
          ),
        )
        .orderBy(documents.createdAt)
        .limit(limit + 1)
        .all();
    } else {
      rows = db
        .select()
        .from(documents)
        .where(eq(documents.userId, userId))
        .orderBy(documents.createdAt)
        .limit(limit + 1)
        .all();
    }
  } else {
    rows = db
      .select()
      .from(documents)
      .where(eq(documents.userId, userId))
      .orderBy(documents.createdAt)
      .limit(limit + 1)
      .all();
  }

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor };
}

export function getDocument(id: string, userId: string) {
  const doc = db.select().from(documents).where(eq(documents.id, id)).get();
  if (!doc) throw new NotFoundError("Document");
  if (doc.userId !== userId) throw new ForbiddenError();
  return doc;
}

export async function deleteDocument(id: string, userId: string, requestId: string) {
  const doc = getDocument(id, userId);

  // Delete from vector store
  await vectorStore.deleteDocumentChunks(id, requestId);

  // Delete file from storage
  await deleteFile(doc.storagePath, requestId);

  // Delete from SQL (cascades to chunks)
  db.delete(documents).where(eq(documents.id, id)).run();

  log.info({ requestId, docId: id }, "Document deleted");
}
