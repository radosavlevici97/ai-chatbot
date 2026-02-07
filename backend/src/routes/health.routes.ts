import { Hono } from "hono";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import { getChatProvider, getFallbackChatProvider } from "../services/llm/factory.js";
import { env } from "../env.js";
import { log } from "../middleware/logger.js";
import { existsSync, statSync } from "node:fs";
import { dirname } from "node:path";
import type { AppEnv } from "../app.js";

const health = new Hono<AppEnv>();

const startTime = Date.now();

type CheckResult = { status: "ok" | "degraded" | "error"; latency?: number; detail?: string };

// Detailed health check — returns subsystem statuses
health.get("/health", async (c) => {
  const requestId = c.get("requestId");
  const checks: Record<string, CheckResult> = {};

  // 1. Database connectivity
  const dbStart = Date.now();
  try {
    db.run(sql`SELECT 1`);
    checks.database = { status: "ok", latency: Date.now() - dbStart };
  } catch (err) {
    checks.database = {
      status: "error",
      latency: Date.now() - dbStart,
      detail: err instanceof Error ? err.message : "Database unreachable",
    };
  }

  // 2. LLM provider health (non-blocking timeout)
  try {
    const llm = getChatProvider();
    const llmStart = Date.now();
    const healthy = await Promise.race([
      llm.healthCheck(),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 5000)),
    ]);
    checks.llm = {
      status: healthy ? "ok" : "degraded",
      latency: Date.now() - llmStart,
      detail: healthy ? env.LLM_PROVIDER : "Health check failed or timed out",
    };
  } catch {
    checks.llm = { status: "degraded", detail: "Provider not initialized" };
  }

  // 3. Fallback LLM health
  try {
    const fallback = getFallbackChatProvider();
    if (fallback) {
      const fallbackStart = Date.now();
      const healthy = await Promise.race([
        fallback.healthCheck(),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 5000)),
      ]);
      checks.fallbackLlm = {
        status: healthy ? "ok" : "degraded",
        latency: Date.now() - fallbackStart,
      };
    } else {
      checks.fallbackLlm = { status: "ok", detail: "Not configured" };
    }
  } catch {
    checks.fallbackLlm = { status: "degraded", detail: "Health check failed" };
  }

  // 4. Storage health
  try {
    const uploadDir = env.UPLOAD_DIR;
    const dbDir = dirname(env.DATABASE_PATH);
    const uploadsExist = existsSync(uploadDir);
    const dbExists = existsSync(env.DATABASE_PATH);

    if (uploadsExist && dbExists) {
      const dbStat = statSync(env.DATABASE_PATH);
      checks.storage = {
        status: "ok",
        detail: `DB size: ${(dbStat.size / 1024 / 1024).toFixed(1)}MB, type: ${env.STORAGE_TYPE}`,
      };
    } else {
      checks.storage = {
        status: "error",
        detail: `uploads: ${uploadsExist}, db: ${dbExists}`,
      };
    }
  } catch (err) {
    checks.storage = {
      status: "error",
      detail: err instanceof Error ? err.message : "Storage check failed",
    };
  }

  // Determine overall status
  const hasError = Object.values(checks).some((c) => c.status === "error");
  const hasDegraded = Object.values(checks).some((c) => c.status === "degraded");
  const overallStatus = hasError ? "error" : hasDegraded ? "degraded" : "ok";

  const response = {
    status: overallStatus,
    version: process.env.npm_package_version ?? "0.1.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks,
  };

  // Return 200 even if degraded (LLM down shouldn't prevent deploy)
  // Return 503 only if DB is down (critical dependency)
  const statusCode = checks.database.status === "error" ? 503 : 200;

  if (overallStatus !== "ok") {
    log.warn({ requestId, health: response }, "Health check returned non-ok status");
  }

  return c.json(response, statusCode);
});

// Readiness probe — simpler, for Railway
health.get("/ready", (c) => {
  try {
    db.run(sql`SELECT 1`);
    return c.json({ ready: true });
  } catch {
    return c.json({ ready: false }, 503);
  }
});

export { health };
