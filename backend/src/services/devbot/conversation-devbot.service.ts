import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { conversations } from "../../db/schema.js";

export function setWorkingBranch(conversationId: string, branch: string): void {
  db.update(conversations)
    .set({ workingBranch: branch, updatedAt: new Date().toISOString() })
    .where(eq(conversations.id, conversationId))
    .run();
}
