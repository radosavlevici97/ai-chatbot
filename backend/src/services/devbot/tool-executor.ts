import type { Octokit } from "octokit";
import type { StreamChunk, Repo } from "@chatbot/shared";
import * as githubService from "./github.service.js";
import * as firebaseService from "./firebase.service.js";
import { log } from "../../middleware/logger.js";

export interface ToolContext {
  octokit: Octokit;
  repo: Repo;
  workingBranch: string | null;
  setWorkingBranch: (branch: string) => void;
}

export interface ToolResult {
  success: boolean;
  output: string;
  events: StreamChunk[];
}

type ToolInput = Record<string, any>;

const toolHandlers: Record<
  string,
  (input: ToolInput, ctx: ToolContext) => Promise<ToolResult>
> = {
  read_file: async (input, ctx) => {
    const { path } = input as { path: string };
    const events: StreamChunk[] = [
      { event: "tool_call", toolName: "read_file", status: "running", summary: `Reading ${path}...` },
    ];

    try {
      const file = await githubService.readFile(
        ctx.octokit,
        ctx.repo.githubOwner,
        ctx.repo.githubRepo,
        path,
        ctx.workingBranch ?? ctx.repo.defaultBranch,
      );
      events.push({
        event: "tool_call",
        toolName: "read_file",
        status: "completed",
        summary: `Read ${path} (${file.size} bytes)`,
      });

      // Truncate very large files to avoid blowing up Claude's context
      const content = file.content.length > 50_000
        ? file.content.slice(0, 50_000) + "\n... [truncated]"
        : file.content;

      return { success: true, output: content, events };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      events.push({ event: "tool_call", toolName: "read_file", status: "failed", summary: `Failed to read ${path}: ${msg}` });
      return { success: false, output: msg, events };
    }
  },

  list_files: async (input, ctx) => {
    const { path } = input as { path: string };
    const events: StreamChunk[] = [
      { event: "tool_call", toolName: "list_files", status: "running", summary: `Listing ${path || "/"}...` },
    ];

    try {
      const files = await githubService.listFiles(
        ctx.octokit,
        ctx.repo.githubOwner,
        ctx.repo.githubRepo,
        path,
        ctx.workingBranch ?? ctx.repo.defaultBranch,
      );
      events.push({
        event: "tool_call",
        toolName: "list_files",
        status: "completed",
        summary: `Listed ${files.length} items in ${path || "/"}`,
      });

      const output = files
        .map((f) => `${f.type === "dir" ? "📁" : "📄"} ${f.path}${f.type === "dir" ? "/" : ""} (${f.size}b)`)
        .join("\n");

      return { success: true, output, events };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      events.push({ event: "tool_call", toolName: "list_files", status: "failed", summary: `Failed: ${msg}` });
      return { success: false, output: msg, events };
    }
  },

  create_branch: async (input, ctx) => {
    const { branchName } = input as { branchName: string };
    const events: StreamChunk[] = [
      { event: "tool_call", toolName: "create_branch", status: "running", summary: `Creating branch ${branchName}...` },
    ];

    try {
      await githubService.createBranch(
        ctx.octokit,
        ctx.repo.githubOwner,
        ctx.repo.githubRepo,
        branchName,
        ctx.repo.defaultBranch,
      );
      ctx.setWorkingBranch(branchName);
      events.push({
        event: "tool_call",
        toolName: "create_branch",
        status: "completed",
        summary: `Created branch ${branchName}`,
      });
      return { success: true, output: `Branch '${branchName}' created from '${ctx.repo.defaultBranch}'.`, events };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      events.push({ event: "tool_call", toolName: "create_branch", status: "failed", summary: `Failed: ${msg}` });
      return { success: false, output: msg, events };
    }
  },

  write_fix: async (input, ctx) => {
    const { files, commitMessage } = input as { files: { path: string; content: string }[]; commitMessage: string };
    const branch = ctx.workingBranch;
    if (!branch) {
      return {
        success: false,
        output: "No working branch set. Call create_branch first.",
        events: [{ event: "tool_call" as const, toolName: "write_fix", status: "failed" as const, summary: "No working branch" }],
      };
    }

    const events: StreamChunk[] = [
      { event: "tool_call", toolName: "write_fix", status: "running", summary: `Pushing ${files.length} file(s)...` },
    ];

    try {
      const sha = await githubService.pushFiles(
        ctx.octokit,
        ctx.repo.githubOwner,
        ctx.repo.githubRepo,
        branch,
        files,
        commitMessage,
      );
      events.push({
        event: "tool_call",
        toolName: "write_fix",
        status: "completed",
        summary: `Pushed ${files.length} file(s) to ${branch}`,
      });
      return {
        success: true,
        output: `Committed ${files.length} file(s) to '${branch}' (${sha.slice(0, 7)}).`,
        events,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      events.push({ event: "tool_call", toolName: "write_fix", status: "failed", summary: `Failed: ${msg}` });
      return { success: false, output: msg, events };
    }
  },

  deploy: async (_input, ctx) => {
    const branch = ctx.workingBranch;
    if (!branch) {
      return {
        success: false,
        output: "No working branch set. Call create_branch first.",
        events: [{ event: "tool_call" as const, toolName: "deploy", status: "failed" as const, summary: "No working branch" }],
      };
    }

    const projectId = ctx.repo.firebaseProjectId;
    if (!projectId) {
      return {
        success: false,
        output: "No Firebase project linked to this repo. Configure it in repo settings.",
        events: [{ event: "tool_call" as const, toolName: "deploy", status: "failed" as const, summary: "No Firebase project" }],
      };
    }

    const events: StreamChunk[] = [
      { event: "tool_call", toolName: "deploy", status: "running", summary: "Deploying to Firebase preview..." },
    ];

    const result = await firebaseService.deployPreview(projectId, branch);

    if (result.status === "deployed") {
      events.push({
        event: "tool_call",
        toolName: "deploy",
        status: "completed",
        summary: `Deployed! Preview: ${result.previewUrl ?? "URL pending"}`,
      });
      return {
        success: true,
        output: `Preview deployed: ${result.previewUrl ?? "Deployment complete, URL pending."}`,
        events,
      };
    }

    events.push({ event: "tool_call", toolName: "deploy", status: "failed", summary: `Deploy failed: ${result.error}` });
    return { success: false, output: result.error ?? "Deploy failed", events };
  },

  open_pr: async (input, ctx) => {
    const { title, body } = input as { title: string; body: string };
    const branch = ctx.workingBranch;
    if (!branch) {
      return {
        success: false,
        output: "No working branch set. Call create_branch first.",
        events: [{ event: "tool_call" as const, toolName: "open_pr", status: "failed" as const, summary: "No working branch" }],
      };
    }

    const events: StreamChunk[] = [
      { event: "tool_call", toolName: "open_pr", status: "running", summary: "Opening pull request..." },
    ];

    try {
      const pr = await githubService.openPullRequest(
        ctx.octokit,
        ctx.repo.githubOwner,
        ctx.repo.githubRepo,
        branch,
        ctx.repo.defaultBranch,
        title,
        body,
      );
      events.push({
        event: "tool_call",
        toolName: "open_pr",
        status: "completed",
        summary: `Opened PR #${pr.number}`,
      });
      return {
        success: true,
        output: `Pull request #${pr.number} opened: ${pr.htmlUrl}`,
        events,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      events.push({ event: "tool_call", toolName: "open_pr", status: "failed", summary: `Failed: ${msg}` });
      return { success: false, output: msg, events };
    }
  },
};

export async function executeTool(
  toolName: string,
  input: ToolInput,
  ctx: ToolContext,
): Promise<ToolResult> {
  const handler = toolHandlers[toolName];
  if (!handler) {
    return {
      success: false,
      output: `Unknown tool: ${toolName}`,
      events: [{ event: "tool_call", toolName, status: "failed", summary: `Unknown tool: ${toolName}` }],
    };
  }

  log.info({ toolName, input }, "Executing devbot tool");
  return handler(input, ctx);
}
