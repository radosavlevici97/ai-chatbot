import type Anthropic from "@anthropic-ai/sdk";

export const devbotTools: Anthropic.Tool[] = [
  {
    name: "read_file",
    description: "Read a file from the GitHub repository",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path relative to repo root" },
      },
      required: ["path"],
    },
  },
  {
    name: "list_files",
    description: "List files and directories at a path in the repo",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Directory path relative to repo root (empty string for root)" },
      },
      required: ["path"],
    },
  },
  {
    name: "create_branch",
    description: "Create a new git branch for the fix",
    input_schema: {
      type: "object" as const,
      properties: {
        branchName: { type: "string", description: "Name for the new branch (e.g., fix/issue-description)" },
      },
      required: ["branchName"],
    },
  },
  {
    name: "write_fix",
    description: "Write file changes and commit them to the working branch",
    input_schema: {
      type: "object" as const,
      properties: {
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              content: { type: "string" },
            },
            required: ["path", "content"],
          },
          description: "Files to create or update",
        },
        commitMessage: { type: "string", description: "Git commit message" },
      },
      required: ["files", "commitMessage"],
    },
  },
  {
    name: "deploy",
    description: "Deploy the working branch to a Firebase preview environment",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "open_pr",
    description: "Open a GitHub pull request for the fix",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "PR title" },
        body: { type: "string", description: "PR description" },
      },
      required: ["title", "body"],
    },
  },
];
