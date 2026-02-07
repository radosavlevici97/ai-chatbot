import { fileTypeFromBuffer } from "file-type";
import { nanoid } from "nanoid";
import { getStorage } from "../lib/storage.js";
import { ValidationError } from "../lib/errors.js";
import { IMAGE_LIMITS, type AllowedImageMime } from "@chatbot/shared";
import { log } from "../middleware/logger.js";

export type StoredImage = {
  id: string;
  filename: string;
  mimeType: string;
  storagePath: string;
  size: number;
};

export async function validateAndStoreImage(
  buffer: Buffer,
  originalFilename: string,
  userId: string,
  requestId: string,
): Promise<StoredImage> {
  const storage = getStorage();

  if (buffer.length > IMAGE_LIMITS.maxSizeBytes) {
    log.warn({ requestId, size: buffer.length, limit: IMAGE_LIMITS.maxSizeBytes }, "Image size exceeded");
    throw new ValidationError(`Image exceeds ${IMAGE_LIMITS.maxSizeMB}MB limit`);
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (
    !detected ||
    !IMAGE_LIMITS.allowedMimeTypes.includes(detected.mime as AllowedImageMime)
  ) {
    log.warn(
      { requestId, detectedMime: detected?.mime, originalFilename },
      "Image type rejected",
    );
    throw new ValidationError(
      `Unsupported image type. Allowed: ${IMAGE_LIMITS.allowedExtensions.join(", ")}`,
    );
  }

  const id = nanoid();
  const filename = `${id}.${detected.ext}`;
  const storagePath = `images/${userId}/${filename}`;

  await storage.save(storagePath, buffer);

  log.info(
    { requestId, storagePath, mimeType: detected.mime, size: buffer.length },
    "Image stored",
  );

  return {
    id,
    filename,
    mimeType: detected.mime,
    storagePath,
    size: buffer.length,
  };
}

export async function getImageBuffer(storagePath: string): Promise<Buffer> {
  const storage = getStorage();
  return storage.read(storagePath);
}

export async function deleteImage(storagePath: string, requestId: string): Promise<void> {
  const storage = getStorage();
  try {
    await storage.delete(storagePath);
    log.info({ requestId, storagePath }, "Image deleted");
  } catch (err) {
    log.warn({ requestId, storagePath, err }, "Image deletion failed (may already be removed)");
  }
}
