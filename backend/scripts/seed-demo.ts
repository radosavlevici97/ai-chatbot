/**
 * Demo seed script — creates a demo user and sample conversations.
 *
 * Run from project root:
 *   pnpm --filter @chatbot/backend tsx scripts/seed-demo.ts
 *
 * Uses the service layer to ensure password hashing, validation,
 * and all side effects are applied correctly.
 */

import { nanoid } from "nanoid";
import { db } from "../src/db/index.js";
import { users, conversations, messages } from "../src/db/schema.js";
import { hashPassword } from "../src/lib/password.js";
import { runMigrations } from "../src/db/migrate.js";
import { log } from "../src/middleware/logger.js";
import { eq } from "drizzle-orm";

async function seed() {
  // Ensure DB schema is up to date
  runMigrations();

  log.info("Starting demo seed...");

  const email = "demo@example.com";

  // Check if demo user already exists
  const existing = db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    log.info({ userId: existing.id }, "Demo user already exists, skipping seed");
    process.exit(0);
  }

  // 1. Create demo user (hash password via password service)
  const userId = nanoid();
  const passwordHash = await hashPassword("DemoPass123!");

  db.insert(users).values({
    id: userId,
    email,
    username: "demo",
    passwordHash,
  }).run();

  log.info({ userId }, "Demo user created");

  // 2. Create sample conversation — getting started
  const conv1Id = nanoid();
  db.insert(conversations).values({
    id: conv1Id,
    userId,
    title: "Getting started with the chatbot",
    model: "gemini-2.5-flash",
  }).run();

  const msg1Id = nanoid();
  db.transaction((tx) => {
    tx.insert(messages).values({
      id: msg1Id,
      conversationId: conv1Id,
      role: "user",
      content: "What can you help me with?",
    }).run();

    tx.update(conversations)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(conversations.id, conv1Id))
      .run();
  });

  const msg2Id = nanoid();
  db.transaction((tx) => {
    tx.insert(messages).values({
      id: msg2Id,
      conversationId: conv1Id,
      role: "assistant",
      content: [
        "I can help with:",
        "",
        "- **General questions** -- ask me anything",
        "- **Document analysis** -- upload PDFs and ask questions about them",
        "- **Image understanding** -- paste or upload images for AI analysis",
        "- **Code help** -- write, explain, or debug code",
        "",
        "Try uploading a document or pasting an image to get started!",
      ].join("\n"),
      model: "gemini-2.5-flash",
    }).run();

    tx.update(conversations)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(conversations.id, conv1Id))
      .run();
  });

  // 3. Create a second conversation — coding example
  const conv2Id = nanoid();
  db.insert(conversations).values({
    id: conv2Id,
    userId,
    title: "Python quicksort example",
    model: "gemini-2.5-flash",
  }).run();

  const msg3Id = nanoid();
  db.transaction((tx) => {
    tx.insert(messages).values({
      id: msg3Id,
      conversationId: conv2Id,
      role: "user",
      content: "Write a quicksort in Python with type hints",
    }).run();

    tx.update(conversations)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(conversations.id, conv2Id))
      .run();
  });

  const msg4Id = nanoid();
  db.transaction((tx) => {
    tx.insert(messages).values({
      id: msg4Id,
      conversationId: conv2Id,
      role: "assistant",
      content: [
        "Here is a quicksort implementation with type hints:",
        "",
        "```python",
        "def quicksort(arr: list[int]) -> list[int]:",
        '    """Sort a list of integers using quicksort."""',
        "    if len(arr) <= 1:",
        "        return arr",
        "",
        "    pivot = arr[len(arr) // 2]",
        "    left = [x for x in arr if x < pivot]",
        "    middle = [x for x in arr if x == pivot]",
        "    right = [x for x in arr if x > pivot]",
        "",
        "    return quicksort(left) + middle + quicksort(right)",
        "```",
        "",
        "This uses the list comprehension approach for clarity. The time complexity is O(n log n) on average, O(n^2) worst case.",
      ].join("\n"),
      model: "gemini-2.5-flash",
    }).run();

    tx.update(conversations)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(conversations.id, conv2Id))
      .run();
  });

  log.info("Demo seed complete");
  log.info("Login credentials: demo@example.com / DemoPass123!");
  process.exit(0);
}

seed().catch((err) => {
  log.error({ err: err.message }, "Seed failed");
  process.exit(1);
});
