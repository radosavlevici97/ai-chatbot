export interface Repo {
  id: string;
  githubOwner: string;
  githubRepo: string;
  defaultBranch: string;
  description: string | null;
  language: string | null;
  avatarUrl: string | null;
  firebaseProjectId: string | null;
  addedAt: string;
}

export interface DevBotSettings {
  hasToken: boolean;
  githubUsername: string | null;
  avatarUrl: string | null;
}

export interface ToolCallEvent {
  callId: string;
  toolName: string;
  status: "running" | "completed" | "failed";
  summary: string;
}

export interface ApprovalRequest {
  fixDescription: string;
  files: { path: string; diff: string }[];
}

export interface DeployStatus {
  status: "deploying" | "deployed" | "failed";
  previewUrl?: string;
  error?: string;
}

export type ConversationMode = "chat" | "devbot";
