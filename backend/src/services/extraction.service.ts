import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { getStorage } from "../lib/storage.js";
import { log } from "../middleware/logger.js";

type ExtractedPage = {
  pageNumber: number;
  text: string;
};

export async function extractText(
  storagePath: string,
  fileType: string,
  requestId: string,
): Promise<ExtractedPage[]> {
  const storage = getStorage();
  const buffer = await storage.read(storagePath);

  log.debug({ requestId, storagePath, fileType, bufferSize: buffer.length }, "Starting text extraction");

  let pages: ExtractedPage[];
  switch (fileType) {
    case "pdf":
      pages = await extractPdf(buffer);
      break;
    case "docx":
      pages = await extractDocx(buffer);
      break;
    case "txt":
      pages = [{ pageNumber: 1, text: buffer.toString("utf-8") }];
      break;
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }

  log.info({ requestId, storagePath, pageCount: pages.length }, "Text extraction complete");
  return pages;
}

async function extractPdf(buffer: Buffer): Promise<ExtractedPage[]> {
  const pdf = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const textResult = await pdf.getText();
    const pages: ExtractedPage[] = [];

    if (textResult.pages && textResult.pages.length > 0) {
      for (const page of textResult.pages) {
        const text = page.text?.trim();
        if (text) {
          pages.push({ pageNumber: page.num, text });
        }
      }
    }

    // Fallback: if per-page extraction yields nothing, use the full text
    if (pages.length === 0 && textResult.text?.trim()) {
      pages.push({ pageNumber: 1, text: textResult.text.trim() });
    }

    return pages;
  } finally {
    await pdf.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<ExtractedPage[]> {
  const result = await mammoth.extractRawText({ buffer });
  return [{ pageNumber: 1, text: result.value }];
}
