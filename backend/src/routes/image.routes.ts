import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { getImageBuffer } from "../services/image.service.js";
import { log } from "../middleware/logger.js";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";
import type { AppEnv } from "../app.js";

const images = new Hono<AppEnv>();

images.get("/images/:userId/:filename", requireAuth, async (c) => {
  const requestingUserId = c.get("userId");
  const requestId = c.get("requestId");
  const { userId, filename } = c.req.param();

  if (requestingUserId !== userId) {
    log.warn({ requestId, requestingUserId, targetUserId: userId }, "Cross-user image access denied");
    throw new ForbiddenError("Cannot access another user's images");
  }

  const storagePath = `images/${userId}/${filename}`;

  try {
    const buffer = await getImageBuffer(storagePath);

    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeType =
      ext === "png" ? "image/png"
      : ext === "gif" ? "image/gif"
      : ext === "webp" ? "image/webp"
      : "image/jpeg";

    log.debug({ requestId, storagePath }, "Image served");

    return new Response(buffer, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=86400",
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    throw new NotFoundError("Image");
  }
});

export { images };
