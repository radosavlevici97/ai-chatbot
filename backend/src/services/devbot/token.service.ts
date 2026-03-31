import { eq } from "drizzle-orm";
import { Octokit } from "octokit";
import { db } from "../../db/index.js";
import { githubTokens } from "../../db/schema.js";
import { encrypt, decrypt } from "../../lib/crypto.js";
import { env } from "../../env.js";
import { log } from "../../middleware/logger.js";
import type { DevBotSettings } from "@chatbot/shared";

export function getDevBotSettings(userId: string): DevBotSettings {
  const row = db.select().from(githubTokens).where(eq(githubTokens.userId, userId)).get();

  if (!row) {
    return { hasToken: false, githubUsername: null, avatarUrl: null };
  }

  return {
    hasToken: true,
    githubUsername: row.githubUsername,
    avatarUrl: row.avatarUrl,
  };
}

export async function saveToken(
  userId: string,
  token: string,
): Promise<{ githubUsername: string; avatarUrl: string | null; scopes: string }> {
  // Validate token against GitHub API
  const octokit = new Octokit({ auth: token });

  const { data: user, headers } = await octokit.rest.users.getAuthenticated();
  const scopes = (headers["x-oauth-scopes"] as string) ?? "";

  // Check for required 'repo' scope
  if (!scopes.includes("repo")) {
    throw new Error("Token needs the 'repo' scope to access repositories");
  }

  const encryptedToken = encrypt(token);

  // Upsert: insert or update on conflict
  const existing = db.select().from(githubTokens).where(eq(githubTokens.userId, userId)).get();

  if (existing) {
    db.update(githubTokens)
      .set({
        encryptedToken,
        githubUsername: user.login,
        avatarUrl: user.avatar_url,
        tokenScope: scopes,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(githubTokens.userId, userId))
      .run();
  } else {
    db.insert(githubTokens)
      .values({
        userId,
        encryptedToken,
        githubUsername: user.login,
        avatarUrl: user.avatar_url,
        tokenScope: scopes,
      })
      .run();
  }

  log.info({ userId, githubUsername: user.login }, "GitHub token saved");

  return {
    githubUsername: user.login,
    avatarUrl: user.avatar_url,
    scopes,
  };
}

export function deleteToken(userId: string): void {
  db.delete(githubTokens).where(eq(githubTokens.userId, userId)).run();
  log.info({ userId }, "GitHub token deleted");
}

export function getDecryptedToken(userId: string): string | null {
  const row = db.select().from(githubTokens).where(eq(githubTokens.userId, userId)).get();

  if (row) {
    return decrypt(row.encryptedToken);
  }

  // Fallback to env var for V1 single-user mode
  return env.GITHUB_TOKEN ?? null;
}

export function getOctokit(userId: string): Octokit {
  const token = getDecryptedToken(userId);
  if (!token) {
    throw new Error("No GitHub token configured. Set one in DevBot settings.");
  }
  return new Octokit({ auth: token });
}
