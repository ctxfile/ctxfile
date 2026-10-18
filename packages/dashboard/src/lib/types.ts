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

/* ---------- cross-agent tasks (free, core) ---------- */

export type TaskState =
  | "proposed"
  | "pending"
  | "claimed"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "rejected"
  | "canceled";

export type TaskCapability =
  | "read:thread"
  | "read:files"
  | "draft:content"
  | "write:code"
  | "send:message"
  | "publish:external"
  | "spend:money";

/** Mirrors SIDE_EFFECT_CAPABILITIES in core: each use asks per effect. */
export const SIDE_EFFECT_CAPABILITIES: readonly TaskCapability[] = ["write:code", "send:message", "publish:external", "spend:money"];

export interface TaskArtifact {
  ref: string;
  role: string;
}

export interface TaskApprovalView {
  by: "dashboard" | "cli";
  at: string;
  granted: TaskCapability[];
  expires_at: string;
  signed: boolean;
  key_id: string | null;
  /** Still matches the task's content and has not expired. */
  current: boolean;
}

export interface TaskEffectView {
  capability: TaskCapability;
  summary: string;
  details: string;
  requested_at: string;
  effect_hash: string;
}

export interface TaskDecisionView {
  capability: TaskCapability;
  summary: string;
  decision: "approved" | "denied";
  by: "dashboard" | "cli";
  at: string;
}

/** One task as GET /api/internal/tasks serves it (see core ui/task-view.ts).
    Every string an agent wrote is data: render it as plain text only. */
export interface TaskView {
  task_id: string;
  thread: string;
  title: string;
  instructions: string;
  input_artifacts: TaskArtifact[];
  assignee: string;
  capabilities: TaskCapability[];
  side_effects: TaskCapability[];
  state: TaskState;
  a2a_state: string;
  open: boolean;
  origin: "agent" | "human";
  from: string;
  posted_by: { kind: "agent" | "human"; harness: string | null; door: string; client: string | null; token: string | null };
  provenance: string;
  approved: boolean;
  waiting_on_you: boolean;
  trifecta: boolean;
  content_hash: string;
  approval: TaskApprovalView | null;
  pending_effect: TaskEffectView | null;
  effect_decisions: TaskDecisionView[];
  lease: { harness: string; expires_at: string } | null;
  result: { summary: string; artifacts: TaskArtifact[]; at: string } | null;
  reason: string | null;
  thread_frozen: boolean;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface TaskCounts {
  open: number;
  proposals: number;
  awaitingApproval: number;
  waiting: number;
  finished: number;
}

export interface TaskList {
  tasks: TaskView[];
  off: boolean;
  proposals: "ask" | "require_approval";
  counts: TaskCounts;
  frozen_threads: string[];
}

export type TaskListState = "open" | "all";

/** Phase 0 gate metrics: is work actually crossing tools? */
export interface HandoffStats {
  cross_vendor_threads_30d: number;
  handoffs_saved_30d: number;
  handoffs_resumed_cross_vendor_30d: number;
  resumes_with_prompt_30d: number;
}
