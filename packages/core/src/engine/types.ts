export interface ConnectorStatus {
  name: string;
  status: "ok" | "skipped" | "error";
  error?: string;
  durationMs: number;
}

export interface KeyFile {
  path: string;
  tokens: number;
  truncated: boolean;
  redactions: number;
  content: string;
}

export interface GitCommit {
  hash: string;
  date: string;
  message: string;
  author: string;
}

export interface GitState {
  branch: string;
  staged: string[];
  modified: string[];
  untracked: string[];
  ahead: number;
  behind: number;
  commits: GitCommit[];
  diffSummary: string;
}

export interface NotionPage {
  id: string;
  title: string;
  lastEditedTime: string;
  content: string;
}

export interface SessionDigest {
  /** Originating tool, e.g. "claude-code", "cursor", "codex", "opencode",
      "gemini-cli", "aider", "openclaw". Open set: new session connectors
      add sources without a core type change. */
  source: string;
  sessionId: string;
  startedAt: string | null;
  lastActiveAt: string | null;
  turnCount: number;
  /** Redacted, token-capped rolling summary of the conversation's text turns. */
  digest: string;
}

export interface VaultNoteLink {
  title: string;
  firstLine: string;
}

export interface VaultNote {
  /** Provenance (PRD §2.2.5). Literal today; widens when other vault formats land. */
  source: "obsidian";
  vault: string;
  /** Vault-relative path. */
  path: string;
  title: string;
  /** Case-folded frontmatter tags. */
  tags: string[];
  /** ISO 8601, from file mtime. */
  modifiedAt: string;
  pinned: boolean;
  tokens: number;
  truncated: boolean;
  redactions: number;
  content: string;
  /** One-hop wikilink stubs. */
  links: VaultNoteLink[];
}

export interface ContextMeta {
  name: "ctxfile";
  version: string;
  generatedAt: string;
  root: string;
  tokenBudget: number;
  tokensUsed: number;
  connectors: ConnectorStatus[];
}

export interface ContextObject {
  meta: ContextMeta;
  plan: string | null;
  keyFiles: KeyFile[];
  gitState: GitState | null;
  notionPages: NotionPage[];
  /** Recent agent-session digests (populated by Pro session connectors). */
  sessions?: SessionDigest[];
  /** Vault notes surfaced by note connectors (e.g. the Obsidian vault connector). */
  notes?: VaultNote[];
  sessionSummary: string | null;
}

export type ContextScope = "full" | "plan" | "files" | "git";

export const CONTEXT_SCOPES: readonly ContextScope[] = ["full", "plan", "files", "git"];

/** Progress events emitted while a snapshot builds (consumed by the local UI's SSE stream). */
export type BuildEvent =
  | { type: "connector:start"; name: string }
  | { type: "connector:done"; connector: ConnectorStatus }
  | { type: "tokens"; tokensUsed: number; tokenBudget: number }
  | { type: "done"; generatedAt: string };
