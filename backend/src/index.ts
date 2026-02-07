import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { env } from "./env.js";
import { log } from "./middleware/logger.js";
import { runMigrations } from "./db/migrate.js";
import { db } from "./db/index.js";
import { resetProviders } from "./services/llm/factory.js";
import Database from "better-sqlite3";

// Run migrations on startup
runMigrations();

const app = createApp();

// ── Track active SSE connections for graceful abort ──
const activeStreams = new Set<AbortController>();

export function trackStream(controller: AbortController): void {
  activeStreams.add(controller);
  controller.signal.addEventListener("abort", () => {
    activeStreams.delete(controller);
  });
}

export function untrackStream(controller: AbortController): void {
  activeStreams.delete(controller);
}

const server = serve(
  { fetch: app.fetch, port: env.PORT },
  (info) => {
    log.info({
      port: info.port,
      env: env.NODE_ENV,
      provider: env.LLM_PROVIDER,
      storage: env.STORAGE_TYPE,
    }, "Server started");
  },
);

// ── Graceful Shutdown ─────────────────────────────

let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log.info({ signal }, "Graceful shutdown initiated");

  // 1. Stop accepting new connections
  server.close(() => {
    log.info("HTTP server closed — no new connections");
  });

  // 2. Abort all in-flight SSE streams
  const streamCount = activeStreams.size;
  for (const controller of activeStreams) {
    controller.abort();
  }
  activeStreams.clear();
  if (streamCount > 0) {
    log.info({ aborted: streamCount }, "In-flight SSE streams aborted");
  }

  // 3. Reset LLM providers (cleanup any open connections)
  resetProviders();

  // 4. Close database connection
  try {
    const rawDb = (db as any)._.session.client as InstanceType<typeof Database>;
    rawDb.close();
    log.info("Database connection closed");
  } catch (err) {
    log.error({ err }, "Error closing database");
  }

  // 5. Allow time for final log flush
  await new Promise((resolve) => setTimeout(resolve, 500));

  log.info("Shutdown complete");
  process.exit(0);
}

// Railway sends SIGTERM on redeploy; Docker sends SIGTERM then SIGKILL after timeout
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Catch unhandled errors — log and exit
process.on("uncaughtException", (err) => {
  log.fatal({ err: err.message, stack: err.stack }, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log.fatal({ reason: String(reason) }, "Unhandled rejection");
  process.exit(1);
});
