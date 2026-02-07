import { fileTypeFromBuffer } from "file-type";
import { nanoid } from "nanoid";
import { env } from "../env.js";
import { getStorage } from "../lib/storage.js";
import { ValidationError } from "../lib/errors.js";
import { log } from "../middleware/logger.js";

const ALLOWED_TYPES: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "text/plain": ["txt"],
};

const MAX_SIZE = () => env.UPLOAD_MAX_SIZE_MB * 1024 * 1024;

export async function validateAndStore(
  buffer: Buffer,
  originalFilename: string,
  userId: string,
  requestId: string,
): Promise<{ filename: string; fileType: string; storagePath: string; fileSize: number }> {
  // 1. Size check
  if (buffer.length > MAX_SIZE()) {
    throw new ValidationError(`File exceeds ${env.UPLOAD_MAX_SIZE_MB}MB limit`);
  }

  // 2. Magic byte detection
  const detected = await fileTypeFromBuffer(buffer);
  const ext = originalFilename.split(".").pop()?.toLowerCase() ?? "";

  let fileType: string;
  if (detected && ALLOWED_TYPES[detected.mime]) {
    fileType = ALLOWED_TYPES[detected.mime][0];
  } else if (ext === "txt") {
    fileType = "txt"; // text/plain has no magic bytes
  } else {
    throw new ValidationError(
      `Unsupported file type. Allowed: ${Object.values(ALLOWED_TYPES).flat().join(", ")}`,
    );
  }

  // 3. Store file via storage abstraction
  const filename = `${nanoid()}.${fileType}`;
  const storagePath = `${userId}/${filename}`;
  const storage = getStorage();
  await storage.save(storagePath, buffer);

  log.info({ requestId, userId, filename, fileType, fileSize: buffer.length }, "File stored");

  return { filename, fileType, storagePath, fileSize: buffer.length };
}

export async function deleteFile(storagePath: string, requestId: string) {
  const storage = getStorage();
  if (await storage.exists(storagePath)) {
    await storage.delete(storagePath);
    log.info({ requestId, storagePath }, "File deleted from storage");
  }
}
