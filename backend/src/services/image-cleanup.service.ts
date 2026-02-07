import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { messages } from "../db/schema.js";
import { deleteImage } from "./image.service.js";
import { attachmentsArraySchema } from "@chatbot/shared";
import { log } from "../middleware/logger.js";

/**
 * Deletes all image attachments for every message in a conversation.
 * Call this BEFORE deleting the conversation from the DB (cascade would
 * remove the message rows we need to read).
 */
export async function cleanupConversationImages(
  conversationId: string,
  requestId: string,
): Promise<number> {
  const msgs = db
    .select({ attachments: messages.attachments })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .all();

  let deletedCount = 0;

  for (const msg of msgs) {
    if (!msg.attachments) continue;

    try {
      const parsed = attachmentsArraySchema.parse(JSON.parse(msg.attachments));
      for (const attachment of parsed) {
        if (attachment.type === "image") {
          await deleteImage(attachment.storagePath, requestId);
          deletedCount++;
        }
      }
    } catch (err) {
      log.warn({ requestId, conversationId, err }, "Failed to parse attachments for cleanup");
    }
  }

  log.info({ requestId, conversationId, deletedCount }, "Conversation image cleanup complete");
  return deletedCount;
}
