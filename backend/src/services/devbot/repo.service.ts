import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import { repos } from "../../db/schema.js";
import { getOctokit } from "./token.service.js";
import { NotFoundError } from "../../lib/errors.js";
import { log } from "../../middleware/logger.js";
import type { Repo } from "@chatbot/shared";

/** Parse owner/repo from URL or shorthand */
export function parseRepoUrl(input: string): { owner: string; repo: string } {
  // Strip protocol and github.com prefix
  const cleaned = input
    .replace(/^https?:\/\//, "")
    .replace(/^github\.com\//, "")
    .replace(/\.git$/, "")
    .trim();

  const parts = cleaned.split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new Error("Invalid repo format. Use 'owner/repo' or a GitHub URL.");
  }

  return { owner: parts[0], repo: parts[1] };
}

export async function connectRepo(userId: string, repoUrl: string): Promise<Repo> {
  const { owner, repo } = parseRepoUrl(repoUrl);
  const octokit = getOctokit(userId);

  // Check if already connected
  const existing = db
    .select()
    .from(repos)
    .where(and(eq(repos.userId, userId), eq(repos.githubOwner, owner), eq(repos.githubRepo, repo)))
    .get();

  if (existing) {
    return mapRow(existing);
  }

  // Validate access + fetch metadata
  const { data: ghRepo } = await octokit.rest.repos.get({ owner, repo });

  const id = nanoid();
  db.insert(repos)
    .values({
      id,
      userId,
      githubOwner: ghRepo.owner.login,
      githubRepo: ghRepo.name,
      defaultBranch: ghRepo.default_branch,
      description: ghRepo.description,
      language: ghRepo.language,
      avatarUrl: ghRepo.owner.avatar_url,
    })
    .run();

  log.info({ userId, owner, repo, repoId: id }, "Repo connected");

  return mapRow(db.select().from(repos).where(eq(repos.id, id)).get()!);
}

export function listRepos(userId: string): Repo[] {
  const rows = db.select().from(repos).where(eq(repos.userId, userId)).all();
  return rows.map(mapRow);
}

export function getRepo(repoId: string, userId: string): Repo {
  const row = db.select().from(repos).where(and(eq(repos.id, repoId), eq(repos.userId, userId))).get();
  if (!row) throw new NotFoundError("Repo");
  return mapRow(row);
}

export function updateRepo(repoId: string, userId: string, input: { firebaseProjectId?: string }): Repo {
  const row = db.select().from(repos).where(and(eq(repos.id, repoId), eq(repos.userId, userId))).get();
  if (!row) throw new NotFoundError("Repo");

  db.update(repos).set(input).where(eq(repos.id, repoId)).run();
  return mapRow(db.select().from(repos).where(eq(repos.id, repoId)).get()!);
}

export function deleteRepo(repoId: string, userId: string): void {
  const row = db.select().from(repos).where(and(eq(repos.id, repoId), eq(repos.userId, userId))).get();
  if (!row) throw new NotFoundError("Repo");
  db.delete(repos).where(eq(repos.id, repoId)).run();
  log.info({ userId, repoId }, "Repo removed");
}

export async function validateRepoAccess(repoId: string, userId: string): Promise<boolean> {
  const repo = getRepo(repoId, userId);
  const octokit = getOctokit(userId);

  try {
    await octokit.rest.repos.get({ owner: repo.githubOwner, repo: repo.githubRepo });
    return true;
  } catch {
    return false;
  }
}

function mapRow(row: typeof repos.$inferSelect): Repo {
  return {
    id: row.id,
    githubOwner: row.githubOwner,
    githubRepo: row.githubRepo,
    defaultBranch: row.defaultBranch,
    description: row.description,
    language: row.language,
    avatarUrl: row.avatarUrl,
    firebaseProjectId: row.firebaseProjectId,
    addedAt: row.addedAt,
  };
}
