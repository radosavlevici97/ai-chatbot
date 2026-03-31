import { z } from "zod";

export const connectRepoInputSchema = z.object({
  repoUrl: z.string().min(1).max(500),
});

export const saveTokenInputSchema = z.object({
  token: z.string().min(1).regex(/^gh[ps]_/, "Must be a GitHub PAT (ghp_ or ghs_ prefix)"),
});

export const repoSchema = z.object({
  id: z.string(),
  githubOwner: z.string(),
  githubRepo: z.string(),
  defaultBranch: z.string(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  firebaseProjectId: z.string().nullable(),
  addedAt: z.string(),
});

export const updateRepoInputSchema = z.object({
  firebaseProjectId: z.string().optional(),
});

export const createDevBotConversationInputSchema = z.object({
  repoId: z.string(),
  title: z.string().optional(),
});

export type ConnectRepoInput = z.infer<typeof connectRepoInputSchema>;
export type SaveTokenInput = z.infer<typeof saveTokenInputSchema>;
export type UpdateRepoInput = z.infer<typeof updateRepoInputSchema>;
export type CreateDevBotConversationInput = z.infer<typeof createDevBotConversationInputSchema>;
