/** Mirrors the /api/internal contract in packages/core/src/ui/server.ts. */

export interface ConnectorStatus {
  name: string;
  status: "ok" | "skipped" | "error";
  error?: string;
  durationMs: number;
}

export interface ProFeatures {
  sessions: boolean;
  memory: boolean;
  consult: boolean;
  voice: boolean;
}

export interface LicenseInfo {
  tier: string | null;
  expiresAt: string | null;
  customerId?: string | null;
}

export interface LicenseState {
  installed: boolean;
  active: boolean;
  status: string | null;
  features: ProFeatures;
  licenseInfo: LicenseInfo | null;
}

export interface DashboardConfig {
  tokenBudget: number;
  maxFileTokens: number;
  cacheMaxAgeMs: number;
  include: string[];
  exclude: string[];
  notion: { configured: boolean; pageCount: number };
  ollama: { summarize: boolean; model: string | null; baseUrl: string };
  consult: { providers: { type: string; model: string | null }[] };
  voice: { configured: boolean };
  telemetry: { enabled: boolean };
}

export interface LatestSnapshot {
  generatedAt: string;
  tokensUsed: number;
  tokenBudget: number;
  connectors: ConnectorStatus[];
}

export interface RecentSnapshot {
  createdAt: number;
  tokensUsed: number;
}

export interface DashboardState {
  version: string;
  root: string;
  license: LicenseState;
  config: DashboardConfig;
  latest: LatestSnapshot | null;
  recent: RecentSnapshot[];
}

export type ContextScope = "full" | "plan" | "files" | "git";

export const CONTEXT_SCOPES: readonly ContextScope[] = ["full", "plan", "files", "git"];

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
  /** Originating tool ("claude-code", "cursor", "codex", "opencode", ...). */
  source: string;
  sessionId: string;
  startedAt: string | null;
  lastActiveAt: string | null;
  turnCount: number;
  digest: string;
}

export interface VaultNoteLink {
  title: string;
  firstLine: string;
}

export interface VaultNote {
  source: string;
  vault: string;
  path: string;
  title: string;
  tags: string[];
  modifiedAt: string;
  pinned: boolean;
  tokens: number;
  truncated: boolean;
  redactions: number;
  content: string;
  links: VaultNoteLink[];
}

export interface ContextMeta {
  name: string;
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
  sessions?: SessionDigest[];
  notes?: VaultNote[];
  sessionSummary: string | null;
}

export interface PlaybookEntry {
  id: string;
  title: string;
  prompt: string;
  provenance: string;
  createdAt: string;
}

export interface MemoryEntry {
  id: string;
  agentId: string;
  content: string;
  createdAt: string;
  provenance: string;
}

export interface SnapshotJob {
  jobId: number;
  alreadyRunning: boolean;
}

export interface LicenseActivation {
  stored: boolean;
  detail: string;
  restartRequired: boolean;
}

/** Live snapshot progress events broadcast on /api/internal/events. */
export type BuildEvent =
  | { type: "connector:start"; name: string }
  | { type: "connector:done"; connector: ConnectorStatus }
  | { type: "tokens"; tokensUsed: number; tokenBudget: number }
  | { type: "done"; generatedAt: string }
  | { type: "error"; message: string };

/* ---------- imported memory (free, core) ---------- */

export type MemoryScope = "global" | "project";

export type MemoryCategory =
  | "instruction"
  | "preference"
  | "convention"
  | "decision"
  | "gotcha"
  | "fact"
  | "project"
  | "career"
  | "identity";

/** Render order: what steers behavior first, biography last (mirrors core). */
export const MEMORY_CATEGORY_ORDER: readonly MemoryCategory[] = [
  "instruction",
  "preference",
  "convention",
  "decision",
  "gotcha",
  "fact",
  "project",
  "career",
  "identity",
];

export interface ImportedMemory {
  id: number;
  scope: MemoryScope;
  memoryId: string;
  category: MemoryCategory;
  text: string;
  verbatim: boolean;
  origin: "stored" | "inferred";
  date: string | null;
  project: string | null;
  status: "pending" | "active";
  sources: string[];
  seenCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImportedMemoryList {
  available: boolean;
  entries: ImportedMemory[];
  pending: number;
}

export interface MemoryImportSummary {
  created: number;
  merged: number;
  pending: number;
  skippedRejected: number;
  complete: boolean;
  scope: MemoryScope;
}

export type MemoryPromptMode = "mcp" | "paste";

/** One schema problem returned by a 400 import. */
export interface ApiIssue {
  path: string;
  message: string;
}
