import { create } from "zustand";
import type { Repo, ToolCallEvent, ApprovalRequest } from "@chatbot/shared";

type DevBotState = {
  // Repo selection
  selectedRepo: Repo | null;
  workingBranch: string | null;

  // Tool calls (inline in chat)
  toolCallStack: ToolCallEvent[];

  // Approval flow
  pendingApproval: ApprovalRequest | null;

  // Token status
  hasToken: boolean;

  // Actions
  setSelectedRepo: (repo: Repo | null) => void;
  setWorkingBranch: (branch: string | null) => void;
  pushToolCall: (event: ToolCallEvent) => void;
  updateToolCall: (toolName: string, status: ToolCallEvent["status"], summary?: string) => void;
  clearToolCalls: () => void;
  setPendingApproval: (approval: ApprovalRequest | null) => void;
  setHasToken: (has: boolean) => void;
  reset: () => void;
};

const initialState = {
  selectedRepo: null,
  workingBranch: null,
  toolCallStack: [],
  pendingApproval: null,
  hasToken: false,
};

export const useDevBotStore = create<DevBotState>((set) => ({
  ...initialState,

  setSelectedRepo: (repo) => set({ selectedRepo: repo }),

  setWorkingBranch: (branch) => set({ workingBranch: branch }),

  pushToolCall: (event) =>
    set((s) => ({ toolCallStack: [...s.toolCallStack, event] })),

  updateToolCall: (toolName, status, summary) =>
    set((s) => ({
      toolCallStack: s.toolCallStack.map((tc) =>
        tc.toolName === toolName && tc.status === "running"
          ? { ...tc, status, ...(summary ? { summary } : {}) }
          : tc,
      ),
    })),

  clearToolCalls: () => set({ toolCallStack: [] }),

  setPendingApproval: (approval) => set({ pendingApproval: approval }),

  setHasToken: (has) => set({ hasToken: has }),

  reset: () => set(initialState),
}));
