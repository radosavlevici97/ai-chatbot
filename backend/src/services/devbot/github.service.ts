import type { Octokit } from "octokit";
import { log } from "../../middleware/logger.js";

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
}

export interface FileContent {
  path: string;
  content: string;
  sha: string;
  size: number;
}

export interface PushFile {
  path: string;
  content: string;
}

export interface PullRequestResult {
  number: number;
  title: string;
  htmlUrl: string;
}

export async function listFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<FileEntry[]> {
  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: path || "",
    ref,
  });

  if (!Array.isArray(data)) {
    throw new Error(`Path '${path}' is a file, not a directory`);
  }

  return data.map((item) => ({
    name: item.name,
    path: item.path,
    type: item.type as "file" | "dir",
    size: item.size ?? 0,
  }));
}

export async function readFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<FileContent> {
  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
    ref,
  });

  if (Array.isArray(data) || data.type !== "file") {
    throw new Error(`Path '${path}' is not a file`);
  }

  const content = Buffer.from((data as any).content, "base64").toString("utf8");

  return {
    path: data.path,
    content,
    sha: data.sha,
    size: data.size,
  };
}

export async function createBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
  branchName: string,
  fromBranch: string,
): Promise<string> {
  // Get the SHA of the source branch
  const { data: ref } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${fromBranch}`,
  });

  // Create the new branch
  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: ref.object.sha,
  });

  log.info({ owner, repo, branchName, fromBranch }, "Branch created");
  return branchName;
}

export async function pushFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  files: PushFile[],
  commitMessage: string,
): Promise<string> {
  // Get the current commit SHA for the branch
  const { data: refData } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  const baseSha = refData.object.sha;

  // Get the tree SHA of the base commit
  const { data: baseCommit } = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: baseSha,
  });

  // Create blobs for each file
  const treeItems = await Promise.all(
    files.map(async (file) => {
      const { data: blob } = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: Buffer.from(file.content).toString("base64"),
        encoding: "base64",
      });
      return {
        path: file.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.sha,
      };
    }),
  );

  // Create a new tree
  const { data: newTree } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseCommit.tree.sha,
    tree: treeItems,
  });

  // Create a new commit
  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: commitMessage,
    tree: newTree.sha,
    parents: [baseSha],
  });

  // Update the branch reference
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: newCommit.sha,
  });

  log.info({ owner, repo, branch, fileCount: files.length, sha: newCommit.sha }, "Files pushed");
  return newCommit.sha;
}

export async function openPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string,
): Promise<PullRequestResult> {
  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    head,
    base,
    title,
    body,
  });

  log.info({ owner, repo, prNumber: pr.number, head, base }, "Pull request opened");

  return {
    number: pr.number,
    title: pr.title,
    htmlUrl: pr.html_url,
  };
}
