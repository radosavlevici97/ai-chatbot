import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  saveTokenInputSchema,
  connectRepoInputSchema,
  updateRepoInputSchema,
} from "@chatbot/shared";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limiter.js";
import { env } from "../env.js";
import * as tokenService from "../services/devbot/token.service.js";
import * as repoService from "../services/devbot/repo.service.js";
import { AppError } from "../lib/errors.js";
import type { AppEnv } from "../app.js";

const devbot = new Hono<AppEnv>();

const devbotLimiter = rateLimit("devbot", {
  windowMs: 60_000,
  max: 30,
  keyFn: (c) => c.get("userId"),
});

// Middleware: check that devbot mode is available
function requireDevBot(c: any, next: any) {
  if (!env.ANTHROPIC_API_KEY) {
    throw new AppError(503, "DEVBOT_UNAVAILABLE", "DevBot mode requires ANTHROPIC_API_KEY to be configured");
  }
  if (!env.ENCRYPTION_KEY && !env.GITHUB_TOKEN) {
    throw new AppError(503, "DEVBOT_UNAVAILABLE", "DevBot mode requires ENCRYPTION_KEY or GITHUB_TOKEN");
  }
  return next();
}

// ── Settings ────────────────────────────────────

devbot.get("/devbot/settings", requireAuth, devbotLimiter, requireDevBot, (c) => {
  const userId = c.get("userId");
  const settings = tokenService.getDevBotSettings(userId);
  return c.json({ data: settings });
});

// ── Save/update GitHub token ────────────────────

devbot.put(
  "/devbot/settings/token",
  requireAuth,
  devbotLimiter,
  requireDevBot,
  zValidator("json", saveTokenInputSchema),
  async (c) => {
    const userId = c.get("userId");
    const { token } = c.req.valid("json");

    try {
      const result = await tokenService.saveToken(userId, token);
      return c.json({
        data: {
          githubUsername: result.githubUsername,
          avatarUrl: result.avatarUrl,
          scopes: result.scopes,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Token validation failed";
      throw new AppError(400, "INVALID_TOKEN", message);
    }
  },
);

// ── Delete GitHub token ─────────────────────────

devbot.delete("/devbot/settings/token", requireAuth, devbotLimiter, requireDevBot, (c) => {
  const userId = c.get("userId");
  tokenService.deleteToken(userId);
  return c.json({ data: { deleted: true } });
});

// ── List repos ──────────────────────────────────

devbot.get("/devbot/repos", requireAuth, devbotLimiter, requireDevBot, (c) => {
  const userId = c.get("userId");
  const repos = repoService.listRepos(userId);
  return c.json({ data: repos });
});

// ── Connect repo ────────────────────────────────

devbot.post(
  "/devbot/repos",
  requireAuth,
  devbotLimiter,
  requireDevBot,
  zValidator("json", connectRepoInputSchema),
  async (c) => {
    const userId = c.get("userId");
    const { repoUrl } = c.req.valid("json");

    try {
      const repo = await repoService.connectRepo(userId, repoUrl);
      return c.json({ data: repo }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect repo";
      throw new AppError(400, "REPO_CONNECTION_FAILED", message);
    }
  },
);

// ── Update repo (e.g., link Firebase project) ───

devbot.put(
  "/devbot/repos/:repoId",
  requireAuth,
  devbotLimiter,
  requireDevBot,
  zValidator("json", updateRepoInputSchema),
  (c) => {
    const userId = c.get("userId");
    const repoId = c.req.param("repoId");
    const input = c.req.valid("json");
    const repo = repoService.updateRepo(repoId, userId, input);
    return c.json({ data: repo });
  },
);

// ── Delete repo ─────────────────────────────────

devbot.delete("/devbot/repos/:repoId", requireAuth, devbotLimiter, requireDevBot, (c) => {
  const userId = c.get("userId");
  const repoId = c.req.param("repoId");
  repoService.deleteRepo(repoId, userId);
  return c.json({ data: { deleted: true } });
});

// ── Validate repo access ────────────────────────

devbot.get("/devbot/repos/:repoId/validate", requireAuth, devbotLimiter, requireDevBot, async (c) => {
  const userId = c.get("userId");
  const repoId = c.req.param("repoId");
  const valid = await repoService.validateRepoAccess(repoId, userId);
  return c.json({ data: { valid } });
});

export { devbot };
