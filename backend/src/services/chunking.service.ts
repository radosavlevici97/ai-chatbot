import { log } from "../middleware/logger.js";

type Chunk = {
  text: string;
  pageNumber?: number;
  index: number;
};

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_OVERLAP = 200;

export function chunkText(
  pages: { pageNumber: number; text: string }[],
  requestId: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_OVERLAP,
): Chunk[] {
  const chunks: Chunk[] = [];
  let globalIndex = 0;

  for (const page of pages) {
    const paragraphs = page.text.split(/\n\n+/);
    let buffer = "";

    for (const para of paragraphs) {
      if (buffer.length + para.length > chunkSize && buffer.length > 0) {
        chunks.push({
          text: buffer.trim(),
          pageNumber: page.pageNumber,
          index: globalIndex++,
        });
        // Keep overlap from end of previous chunk
        buffer = buffer.slice(-overlap) + "\n\n" + para;
      } else {
        buffer += (buffer ? "\n\n" : "") + para;
      }
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      chunks.push({
        text: buffer.trim(),
        pageNumber: page.pageNumber,
        index: globalIndex++,
      });
    }
  }

  log.info({ requestId, chunkCount: chunks.length, chunkSize, overlap }, "Chunking complete");
  return chunks;
}
