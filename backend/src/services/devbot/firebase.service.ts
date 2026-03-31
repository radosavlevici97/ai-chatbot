import { exec } from "node:child_process";
import { promisify } from "node:util";
import { log } from "../../middleware/logger.js";
import type { DeployStatus } from "@chatbot/shared";

const execAsync = promisify(exec);

export async function deployPreview(
  projectId: string,
  branch: string,
): Promise<DeployStatus> {
  const channelId = sanitizeChannelId(branch);

  try {
    const { stdout, stderr } = await execAsync(
      `firebase hosting:channel:deploy ${channelId} --project ${projectId} --json`,
      { timeout: 120_000 },
    );

    log.info({ projectId, channelId, stdout: stdout.slice(0, 200) }, "Firebase deploy completed");

    // Parse Firebase CLI JSON output for the preview URL
    try {
      const result = JSON.parse(stdout);
      const url = result?.result?.[projectId]?.url
        ?? result?.result?.url
        ?? extractUrlFromOutput(stdout);

      return {
        status: "deployed",
        previewUrl: url ?? undefined,
      };
    } catch {
      // Fallback: try to extract URL from stdout text
      const url = extractUrlFromOutput(stdout);
      return {
        status: "deployed",
        previewUrl: url ?? undefined,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ projectId, channelId, error: message }, "Firebase deploy failed");

    return {
      status: "failed",
      error: message,
    };
  }
}

export async function getDeployStatus(
  projectId: string,
  branch: string,
): Promise<DeployStatus> {
  const channelId = sanitizeChannelId(branch);

  try {
    const { stdout } = await execAsync(
      `firebase hosting:channel:list --project ${projectId} --json`,
      { timeout: 30_000 },
    );

    const result = JSON.parse(stdout);
    const channels = result?.result?.channels ?? result?.result ?? [];
    const channel = channels.find(
      (ch: any) => ch.name?.endsWith(`/channels/${channelId}`) || ch.channelId === channelId,
    );

    if (!channel) {
      return { status: "failed", error: "Preview channel not found" };
    }

    return {
      status: "deployed",
      previewUrl: channel.url ?? channel.release?.version?.preview?.url,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "failed", error: message };
  }
}

function sanitizeChannelId(branch: string): string {
  // Firebase channel IDs: lowercase alphanumeric + hyphens, max 63 chars
  return branch
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 63);
}

function extractUrlFromOutput(output: string): string | null {
  const match = output.match(/https?:\/\/[^\s"]+\.web\.app[^\s"]*/);
  return match?.[0] ?? null;
}
