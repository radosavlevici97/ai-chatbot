# Phase S6 — DevBot Mode (AI Developer Assistant)

## Overview

Add a **DevBot mode** to the existing ai-chatbot. When a user switches to DevBot mode, the chatbot becomes an AI-powered developer assistant: the user selects a configured project, describes a bug, and the bot handles the full fix cycle — reading the codebase, creating a branch, writing the fix, pushing to GitHub, deploying a preview, and opening a PR — all through the existing chat interface.

This is **not** a separate app. It extends the current ai-chatbot with a new conversation mode that uses Claude (via the Anthropic API) with tool calling for GitHub and Firebase operations.

---

## Tech Additions (on top of existing stack)

| Layer | Addition | Why |
|-------|----------|-----|
| Backend | `@anthropic-ai/sdk` | Claude API with native tool calling |
| Backend | `octokit` | GitHub REST API (repos, branches, commits, PRs) |
| Backend | `firebase-admin` + Firebase CLI (child_process) | Preview channel deploys |
| Shared | New schemas + types for devbot | Zod schemas for projects, tool calls, actions |
| Frontend | DevBot UI components | Project selector, action cards, approval flow |

---

## Architecture: How It Fits

### Conversation Model

Reuse the existing `conversations` table. Add a new field:

```
mode: "chat" | "devbot"   (default: "chat")
```

When `mode = "devbot"`, the conversation also stores a `projectId` (referencing a configured project). Add a nullable `projectId` column to the `conversations` table, and a nullable `workingBranch` column (set once the bot creates a branch during the session).

### LLM Provider

Add a new `ClaudeDevBotProvider` to the existing LLM provider abstraction (`backend/src/services/llm/`). This provider:
- Uses the Anthropic SDK (`@anthropic-ai/sdk`)
- Sends the devbot system prompt (see below)
- Declares tools via the Anthropic tools API
- Returns a stream that emits the same `StreamChunk` events the frontend already understands, **plus** a new event type:

```typescript
// Add to shared/src/types/chat.ts StreamChunk union:
| { event: "tool_call"; toolName: string; status: "running" | "completed" | "failed"; summary: string }
| { event: "approval_request"; fixDescription: string; files: { path: string; diff: string }[] }
```

### Tool Execution Loop

The backend intercepts Claude's tool_use responses, executes the real action (GitHub API, Firebase CLI), feeds the tool result back into the conversation, and continues streaming. This is a **multi-turn tool loop** within a single `/api/v1/conversations/:id/messages` request — the SSE stream stays open until Claude produces a final text response.

---

## Git Integration — Dynamic Repo Connection

### No Static Config File

There is **no** `projects.config.json`. Instead, repos are connected dynamically:

1. User pastes a GitHub repo URL (e.g., `https://github.com/AcmeCorp/mars-slot`) or types `owner/repo`
2. Backend validates the URL, calls the GitHub API with the stored token to confirm access
3. Backend fetches repo metadata (name, default branch, description, language)
4. Repo is saved to a `repos` database table (per-user) so it appears in the user's repo list next time
5. User can start a devbot conversation against that repo immediately

### GitHub Token

The user provides their **GitHub Personal Access Token** once, in the app settings. It's stored encrypted in the database (per-user). This single token gates everything — if the token has access to a repo, the user can connect it. No server-side config needed.

For V1 (single user), the token can also be set via `GITHUB_TOKEN` env var as a fallback.

### What Happens When You Paste a Repo

```
User pastes: https://github.com/AcmeCorp/mars-slot

Backend:
  1. Parse → owner: "AcmeCorp", repo: "mars-slot"
  2. GET /repos/AcmeCorp/mars-slot (Octokit, using user's token)
  3. If 200 → repo is accessible, save to DB
  4. If 404/403 → "Can't access this repo. Check your token has the 'repo' scope."
  5. Return repo metadata to frontend
```

---

## Backend Changes

### 1. Database: `repos` Table (New)

```sql
CREATE TABLE repos (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id),
  githubOwner TEXT NOT NULL,
  githubRepo TEXT NOT NULL,
  defaultBranch TEXT NOT NULL DEFAULT 'main',
  description TEXT,
  language TEXT,
  avatarUrl TEXT,
  firebaseProjectId TEXT,          -- optional, user can link later
  addedAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(userId, githubOwner, githubRepo)
);
```

### 2. Database: `github_tokens` Table (New)

```sql
CREATE TABLE github_tokens (
  userId TEXT PRIMARY KEY REFERENCES users(id),
  encryptedToken TEXT NOT NULL,
  tokenScope TEXT,                  -- cached scope string from GitHub
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Token is encrypted at rest using a server-side `ENCRYPTION_KEY` env var (AES-256-GCM).

### 3. New Environment Variables

Add to `backend/src/env.ts`:

```
ANTHROPIC_API_KEY=         # Required for devbot mode
GITHUB_TOKEN=              # Fallback for V1 single-user (optional if user sets token in UI)
ENCRYPTION_KEY=            # 32-byte hex key for encrypting GitHub tokens at rest
FIREBASE_SERVICE_ACCOUNT=  # Firebase service account JSON (optional)
```

These are **optional** — the app still works in normal chat mode without them. DevBot routes return 503 if `ANTHROPIC_API_KEY` is missing.

### 4. New Routes (`backend/src/routes/devbot.routes.ts`)

All routes require existing JWT auth middleware.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/v1/devbot/settings` | GET | Get user's devbot settings (has token? etc.) |
| `/api/v1/devbot/settings/token` | PUT | Save/update GitHub PAT (encrypted) |
| `/api/v1/devbot/settings/token` | DELETE | Remove stored GitHub token |
| `/api/v1/devbot/repos` | GET | List user's connected repos |
| `/api/v1/devbot/repos` | POST | Connect a new repo (paste URL or owner/repo) |
| `/api/v1/devbot/repos/:repoId` | DELETE | Remove a repo from user's list |
| `/api/v1/devbot/repos/:repoId` | PUT | Update repo settings (e.g., link Firebase project) |
| `/api/v1/devbot/repos/:repoId/validate` | GET | Re-validate token still has access |

The tool execution endpoints (branch, push, deploy, PR) are **not** separate REST routes — they're internal service functions called by the tool executor within the Claude conversation loop. No need to expose them as API.

### 4. New Services

#### `backend/src/services/devbot/github.service.ts`

Uses Octokit REST client. Functions:

- `listFiles(owner, repo, path, ref)` — List directory contents
- `readFile(owner, repo, path, ref)` — Read file content (auto base64-decode)
- `createBranch(owner, repo, branchName, fromBranch)` — Create branch from ref
- `pushFiles(owner, repo, branch, files[], commitMessage)` — Create/update files via commits API (handles base64 encoding)
- `openPullRequest(owner, repo, head, base, title, body)` — Create PR

#### `backend/src/services/devbot/firebase.service.ts`

Uses Firebase CLI via `child_process.exec` or the Firebase Hosting REST API.

- `deployPreview(projectId, branch)` — Deploy to a preview channel named after the branch
- `getDeployStatus(projectId, branch)` — Return status + preview URL

#### `backend/src/services/devbot/tool-executor.ts`

Maps Claude tool calls to real actions:

```typescript
const DEVBOT_TOOLS = {
  read_file: { execute: (args) => githubService.readFile(...) },
  list_files: { execute: (args) => githubService.listFiles(...) },
  create_branch: { execute: (args) => githubService.createBranch(...) },
  write_fix: { execute: (args) => githubService.pushFiles(...) },
  deploy: { execute: (args) => firebaseService.deployPreview(...) },
  open_pr: { execute: (args) => githubService.openPullRequest(...) },
};
```

Each tool execution:
1. Emits a `tool_call` SSE event with `status: "running"` and a human-readable summary (e.g., "Reading src/game/engine.ts...")
2. Executes the real action
3. Emits a `tool_call` SSE event with `status: "completed"` or `status: "failed"`
4. Feeds the result back to Claude as a `tool_result` message
5. Continues the conversation loop

#### `backend/src/services/devbot/claude-devbot.provider.ts`

New LLM provider for devbot mode. Key differences from the regular chat providers:

- Uses `@anthropic-ai/sdk` with `model: "claude-sonnet-4-20250514"`
- Declares tools in the Anthropic tools format
- Implements a **tool loop**: when Claude returns `tool_use` blocks, execute them and continue
- Streams text blocks as `token` events (same as existing providers)
- Streams tool usage as `tool_call` events (new)
- When Claude's response includes a fix proposal (detected by a specific tool call or content pattern), emits an `approval_request` event and **pauses** — waits for the next user message (approve/reject) before continuing

### 5. Claude System Prompt (DevBot Mode)

Stored in `backend/src/services/devbot/system-prompt.ts`:

```
You are an expert software engineer bot embedded in a mobile dev tool.
You help fix bugs in game projects built with Node.js and TypeScript.

You have access to these tools:
- read_file: Read any file from the GitHub repo
- list_files: List files in a directory of the repo
- create_branch: Create a new git branch
- write_fix: Write changed files and commit them to the branch
- deploy: Deploy the current branch to a Firebase preview environment
- open_pr: Open a pull request

When a user describes a bug:
1. Ask clarifying questions if needed.
2. Use list_files and read_file to explore the relevant codebase.
3. Identify the root cause.
4. Propose the fix and wait for approval.
5. After approval, call create_branch, then write_fix.
6. Offer to deploy. If yes, call deploy and return the preview URL.
7. After testing, offer to open a pull request.

Always explain what you are doing and why. Be concise — the user is on a phone.
```

### 6. Tool Definitions (Anthropic Format)

```typescript
const devbotTools: Tool[] = [
  {
    name: "read_file",
    description: "Read a file from the GitHub repository",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to repo root" }
      },
      required: ["path"]
    }
  },
  {
    name: "list_files",
    description: "List files and directories at a path in the repo",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path relative to repo root (empty string for root)" }
      },
      required: ["path"]
    }
  },
  {
    name: "create_branch",
    description: "Create a new git branch for the fix",
    input_schema: {
      type: "object",
      properties: {
        branchName: { type: "string", description: "Name for the new branch (e.g., fix/issue-description)" }
      },
      required: ["branchName"]
    }
  },
  {
    name: "write_fix",
    description: "Write file changes and commit them to the working branch",
    input_schema: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              content: { type: "string" }
            },
            required: ["path", "content"]
          },
          description: "Files to create or update"
        },
        commitMessage: { type: "string", description: "Git commit message" }
      },
      required: ["files", "commitMessage"]
    }
  },
  {
    name: "deploy",
    description: "Deploy the working branch to a Firebase preview environment",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "open_pr",
    description: "Open a GitHub pull request for the fix",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "PR title" },
        body: { type: "string", description: "PR description" }
      },
      required: ["title", "body"]
    }
  }
];
```

### 7. Chat Route Changes

Modify the existing `POST /api/v1/conversations/:id/messages` handler:

- If `conversation.mode === "devbot"`, use the `ClaudeDevBotProvider` instead of the regular LLM provider
- Pass the project config + working branch into the provider
- The tool execution loop runs inside the same SSE stream
- Conversation history is still stored in the `messages` table (tool calls stored as assistant messages with a `toolCalls` JSON field)

### 8. Database Migration

Add to `conversations` table:
```sql
ALTER TABLE conversations ADD COLUMN mode TEXT NOT NULL DEFAULT 'chat';
ALTER TABLE conversations ADD COLUMN repoId TEXT REFERENCES repos(id);
ALTER TABLE conversations ADD COLUMN workingBranch TEXT;
```

Add new tables:
```sql
-- User's connected repos (dynamic, not config file)
CREATE TABLE repos (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id),
  githubOwner TEXT NOT NULL,
  githubRepo TEXT NOT NULL,
  defaultBranch TEXT NOT NULL DEFAULT 'main',
  description TEXT,
  language TEXT,
  avatarUrl TEXT,
  firebaseProjectId TEXT,
  addedAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(userId, githubOwner, githubRepo)
);

-- Encrypted GitHub PATs (one per user)
CREATE TABLE github_tokens (
  userId TEXT PRIMARY KEY REFERENCES users(id),
  encryptedToken TEXT NOT NULL,
  githubUsername TEXT,
  avatarUrl TEXT,
  tokenScope TEXT,
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## Shared Package Changes

### New Schemas (`packages/shared/src/schemas/devbot.ts`)

```typescript
import { z } from "zod";

export const ConnectRepoInput = z.object({
  // Accepts "https://github.com/owner/repo", "github.com/owner/repo", or "owner/repo"
  repoUrl: z.string().min(1).max(500),
});

export const SaveTokenInput = z.object({
  token: z.string().min(1).regex(/^gh[ps]_/, "Must be a GitHub PAT (ghp_ or ghs_ prefix)"),
});

export const RepoSchema = z.object({
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

export const UpdateRepoInput = z.object({
  firebaseProjectId: z.string().optional(),
});

export const CreateDevBotConversationInput = z.object({
  repoId: z.string(),
  title: z.string().optional(),
});
```

### New Types (`packages/shared/src/types/devbot.ts`)

```typescript
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
  githubUsername: string | null;  // from token validation
  avatarUrl: string | null;
}

export interface ToolCallEvent {
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
```

---

## Frontend Changes — UI Screens & Flow

### Screen 1: Sidebar — DevBot Entry Point

The existing sidebar gets a new section at the top:

```
┌─────────────────────────────┐
│  [+ New Chat]               │  ← existing
│  [< > DevBot]               │  ← NEW: icon + label, navigates to /devbot
│─────────────────────────────│
│  Today                      │
│    Fix auth bug (mars-slot) │  ← devbot convos show repo name + code icon
│    Chat about recipes       │  ← normal convos look the same as today
│  Yesterday                  │
│    ...                      │
└─────────────────────────────┘
```

DevBot conversations in the sidebar show a small code icon (e.g., `<>`) and the repo name after the title to distinguish them from normal chats.

### Screen 2: DevBot Home (`/devbot`)

This is the **repo selector + setup** screen. Two states:

#### State A: No GitHub Token Yet (First-Time Setup)

```
┌─────────────────────────────────┐
│  ← Back           DevBot        │
│                                 │
│  ┌─────────────────────────┐    │
│  │  🔑 Connect GitHub      │    │
│  │                         │    │
│  │  Paste your GitHub      │    │
│  │  Personal Access Token  │    │
│  │  to get started.        │    │
│  │                         │    │
│  │  ┌───────────────────┐  │    │
│  │  │ ghp_xxxxxxxxxxxx  │  │    │
│  │  └───────────────────┘  │    │
│  │                         │    │
│  │  Needs `repo` scope.    │    │
│  │  [How to create one →]  │    │
│  │                         │    │
│  │  [Save Token]           │    │
│  └─────────────────────────┘    │
│                                 │
└─────────────────────────────────┘
```

- Single input field for the PAT
- "How to create one" links to GitHub's token creation page
- On save: backend validates the token against GitHub API, stores encrypted
- If invalid: inline error "Token is invalid or expired"
- If no `repo` scope: "Token needs the 'repo' scope to access repositories"

#### State B: Token Set — Repo List + Add Repo

```
┌───────────────────────────────────┐
│  ← Back              DevBot      │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ 🔗 Paste a repo URL...     │  │
│  └─────────────────────────────┘  │
│                                   │
│  Your Repos                       │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ 🎮 Mars: Ore of Ancients   │  │
│  │ AcmeCorp/mars-slot · main  │  │
│  │ TypeScript · ⭐ 12          │  │
│  └─────────────────────────────┘  │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ 🎯 Example Game             │  │
│  │ AcmeCorp/example-game · main│  │
│  │ JavaScript · ⭐ 3            │  │
│  └─────────────────────────────┘  │
│                                   │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐  │
│  │  ⚙️ Token Settings          │  │
│  │  Change or remove token     │  │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘  │
└───────────────────────────────────┘
```

**Paste bar at top:**
- User pastes `https://github.com/AcmeCorp/mars-slot` or `AcmeCorp/mars-slot`
- Backend parses, validates access, fetches metadata
- If OK: repo appears in the list instantly (optimistic + confirmed)
- If not accessible: toast error "Can't access this repo. Check your token permissions."

**Repo cards:**
- Show: repo name (friendly name derived from repo), `owner/repo`, default branch, language, star count
- Tap a card → creates a new devbot conversation for that repo → navigates to `/c/{id}`
- Swipe left to remove from list (with confirmation)

**Token settings:**
- Change token, remove token
- Shows token status: "Connected as @username" with avatar

### Screen 3: DevBot Chat (`/c/{id}` with mode=devbot)

Same chat screen as normal mode, but with devbot-specific elements:

#### Chat Header

```
┌───────────────────────────────────┐
│  ←  mars-slot  ·  main            │
│      AcmeCorp/mars-slot           │
└───────────────────────────────────┘
```

Once a branch is created, header updates:

```
┌───────────────────────────────────┐
│  ←  mars-slot  · fix/auth-bug     │
│      AcmeCorp/mars-slot           │
└───────────────────────────────────┘
```

The branch name shown as a colored chip/badge.

#### Tool Call Indicators (Inline in Chat)

When the bot reads files, creates branches, etc., these appear as compact inline cards between messages:

```
┌───────────────────────────────────┐
│  📂 Reading src/auth/login.ts...  │  ← spinner while running
└───────────────────────────────────┘

   ↓ collapses when done to:

┌───────────────────────────────────┐
│  ✓ Read 3 files                   │  ← subtle, collapsed
└───────────────────────────────────┘
```

Multiple tool calls in sequence stack:

```
┌───────────────────────────────────┐
│  ✓ Listed files in src/           │
│  ✓ Read src/auth/login.ts         │
│  ✓ Read src/auth/session.ts       │
│  ⏳ Reading src/utils/crypto.ts... │
└───────────────────────────────────┘
```

#### Approval Card (Fix Proposal)

When Claude proposes a fix, a **non-dismissible card** appears:

```
┌───────────────────────────────────────┐
│  🔧 Proposed Fix                      │
│                                       │
│  The bug is in `validateSession()`.   │
│  The token expiry check uses `<`      │
│  instead of `<=`, causing sessions    │
│  to expire 1 second early.            │
│                                       │
│  ┌─ src/auth/session.ts ───────────┐  │
│  │  - if (now < expiry) {          │  │
│  │  + if (now <= expiry) {         │  │
│  └─────────────────────────────────┘  │
│                                       │
│  [  ✅ Approve  ]  [  ❌ Reject  ]    │
└───────────────────────────────────────┘
```

- Diffs shown with red/green highlighting (like GitHub)
- Multiple files: each in its own collapsible section
- On mobile: diffs are horizontally scrollable
- **Approve** → sends "Approved" as user message, bot continues to create branch + push
- **Reject** → opens a small text input for rejection reason, sends as user message

#### Deploy Success Card

```
┌───────────────────────────────────┐
│  🚀 Preview Deployed              │
│                                   │
│  Branch: fix/auth-bug             │
│  Status: ✅ Live                   │
│                                   │
│  [ 🔗 Open Preview ]              │
│  mars-slot--fix-auth-bug.web.app  │
└───────────────────────────────────┘
```

- Tapping "Open Preview" opens the URL in a new tab
- While deploying: shows spinner + "Deploying to Firebase..."

#### PR Created Card

```
┌───────────────────────────────────┐
│  📋 Pull Request Opened           │
│                                   │
│  #42 Fix session expiry check     │
│  fix/auth-bug → main              │
│                                   │
│  [ 🔗 View on GitHub ]            │
└───────────────────────────────────┘
```

#### Full Conversation Example

Here's what a typical session looks like:

```
┌───────────────────────────────────┐
│  ←  mars-slot  ·  main            │
│─────────────────────────────────── │
│                                   │
│  👤 Users are getting logged      │
│     out after exactly 59 seconds  │
│     instead of 60                 │
│                                   │
│  🤖 Let me look into the auth    │
│     code to find the session      │
│     handling logic.               │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ ✓ Listed files in src/auth/ │  │
│  │ ✓ Read src/auth/session.ts  │  │
│  └─────────────────────────────┘  │
│                                   │
│  🤖 Found it. Line 42 in         │
│     session.ts uses strict `<`    │
│     instead of `<=` for expiry.   │
│                                   │
│  ┌─ 🔧 Proposed Fix ──────────┐  │
│  │ - if (now < expiry) {       │  │
│  │ + if (now <= expiry) {      │  │
│  │                             │  │
│  │ [✅ Approve] [❌ Reject]    │  │
│  └─────────────────────────────┘  │
│                                   │
│              ← user taps Approve  │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ ✓ Created branch            │  │
│  │   fix/session-expiry        │  │
│  │ ✓ Pushed 1 file             │  │
│  └─────────────────────────────┘  │
│                                   │
│  🤖 Fix pushed. Want me to       │
│     deploy a preview?             │
│                                   │
│  👤 yes                           │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ ⏳ Deploying to Firebase... │  │
│  └─────────────────────────────┘  │
│                                   │
│  ┌─ 🚀 Preview Deployed ──────┐  │
│  │ ✅ Live                      │  │
│  │ [🔗 Open Preview]           │  │
│  └─────────────────────────────┘  │
│                                   │
│  🤖 Preview is live. Test it     │
│     and let me know if the fix   │
│     works. Want me to open a PR? │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ Type a message...     [Send]│  │
│  └─────────────────────────────┘  │
└───────────────────────────────────┘
```

### New Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| `DevBotHome` | `components/devbot/devbot-home.tsx` | Repo list + paste bar + token setup |
| `RepoCard` | `components/devbot/repo-card.tsx` | Single repo card (name, owner, branch, lang) |
| `PasteRepoBar` | `components/devbot/paste-repo-bar.tsx` | Input that accepts URLs or owner/repo |
| `TokenSetup` | `components/devbot/token-setup.tsx` | PAT input + validation + status |
| `ToolCallStack` | `components/devbot/tool-call-stack.tsx` | Stacked tool call indicators |
| `ApprovalCard` | `components/devbot/approval-card.tsx` | Fix proposal with diffs + approve/reject |
| `DeployCard` | `components/devbot/deploy-card.tsx` | Deploy status + preview URL |
| `PRCard` | `components/devbot/pr-card.tsx` | PR created card with link |
| `DiffView` | `components/devbot/diff-view.tsx` | Syntax-highlighted unified diff |

### New Store: DevBot Store (`frontend/src/stores/devbot-store.ts`)

```typescript
interface DevBotState {
  selectedRepo: Repo | null;
  workingBranch: string | null;
  pendingApproval: ApprovalRequest | null;
  toolCallStack: ToolCallEvent[];
  hasToken: boolean;

  setSelectedRepo(repo: Repo | null): void;
  setWorkingBranch(branch: string | null): void;
  setPendingApproval(approval: ApprovalRequest | null): void;
  pushToolCall(event: ToolCallEvent): void;
  updateToolCall(toolName: string, status: ToolCallEvent["status"]): void;
  clearToolCalls(): void;
  setHasToken(has: boolean): void;
}
```

### SSE Client Update

Update `frontend/src/lib/sse-client.ts` to handle new events:

```typescript
// Add to streamChat callbacks:
onToolCall?: (event: ToolCallEvent) => void;
onApprovalRequest?: (approval: ApprovalRequest) => void;
```

### Sidebar Update

Add a "DevBot" entry in the sidebar:
- `< > DevBot` button at top, navigates to `/devbot`
- DevBot conversations in the list show a code icon + repo name
- Filter toggle: "All / Chats / DevBot" (optional, can be V2)

---

## Mobile-First UI Considerations

- All tap targets: min 44px height
- Approval card diffs: horizontally scrollable with `-webkit-overflow-scrolling: touch`
- Tool call stack: compact single-line items, max 4 visible (rest collapsed behind "Show N more")
- Repo cards: full-width, large touch targets, swipe to delete
- Paste bar: prominent, always visible at top of repo list
- Chat input: pinned to bottom (already handled by existing ChatView)
- Preview URL: large "Open Preview" button, not just a text link

---

## Implementation Order

1. **Shared types + schemas** — Add devbot types, Zod schemas, new StreamChunk events
2. **Database migration** — Add `repos`, `github_tokens` tables + conversation columns
3. **Backend: token + repo management** — Save/validate GitHub PAT, connect repos via Octokit
4. **Backend: GitHub service** — listFiles, readFile, createBranch, pushFiles, openPR
5. **Backend: Firebase service** — Preview channel deploy + status
6. **Backend: tool executor** — Map Claude tool calls → service functions
7. **Backend: Claude DevBot provider** — Anthropic SDK, tool loop, streaming
8. **Backend: devbot routes** — Settings, repos, wire into existing chat route
9. **Frontend: DevBot store** — Zustand store for devbot state
10. **Frontend: Token setup + Repo list** — `/devbot` page with paste bar
11. **Frontend: Chat devbot components** — ToolCallStack, ApprovalCard, DeployCard, PRCard, DiffView
12. **Frontend: SSE client update** — Handle tool_call + approval_request events
13. **Frontend: ChatView integration** — Conditional devbot UI in existing chat
14. **Frontend: Sidebar update** — DevBot entry + conversation badges

---

## What This Does NOT Change

- Normal chat mode works exactly as before
- Existing LLM providers (Gemini, OpenRouter) are untouched
- RAG/document features are unaffected
- Auth flow is unchanged
- Database schema is backwards-compatible (new columns have defaults)
- No static config files — everything is dynamic and user-driven

---

## Environment Variables Summary

Add to `.env.example`:

```
# DevBot Mode (optional — app works without these in normal chat mode)
ANTHROPIC_API_KEY=           # Anthropic API key for Claude
ENCRYPTION_KEY=              # 32-byte hex key for encrypting GitHub tokens at rest
GITHUB_TOKEN=                # Optional fallback GitHub PAT (V1 single-user shortcut)
FIREBASE_SERVICE_ACCOUNT=    # Firebase service account JSON string or file path (optional)
```
