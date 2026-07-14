import type { IngestArtifact, IngestedSession, ThreadSummary } from "../ingest.js";

/**
 * The plaintext shapes that travel inside encrypted sync blobs, shared by the
 * local store (export/import) and the relay (which reconstructs a vault view
 * from decrypted payloads to serve the five MCP tools in Standard mode).
 * Every payload carries its own natural identity, so applies are
 * order-independent and never depend on relay-visible ids.
 */

export interface SessionSyncPayload {
  kind: "session";
  harness: string;
  harness_version: string | null;
  session_id: string;
  door: string;
  started_at: string | null;
  ended_at: string | null;
  summary: string;
  key_decisions: string[];
  files_touched: string[];
  open_items: string[];
  thread_title: string | null;
  continues_from: string | null;
  handoff: boolean;
  state: string | null;
  gotchas: string[];
  artifacts: IngestArtifact[];
  suggested_first_prompt: string | null;
  /** Opt-in full conversation text; absent in pre-transcript payloads. */
  transcript?: string | null;
  /** Behavior-layer provenance; absent in pre-v1 payloads means manual. */
  trigger?: "auto" | "manual";
  ingested_at: number;
  updated_at: number;
  revision: number;
  deleted: boolean;
}

export interface ThreadSyncPayload {
  kind: "thread";
  title: string;
  status: string;
  tags: string[];
  created_at: number;
  last_active: number;
  deleted: boolean;
  /** Local auto-capture exclusion, synced so it holds across devices. Absent
      in pre-v1 payloads means public. */
  private?: boolean;
}

export type SyncPayload = SessionSyncPayload | ThreadSyncPayload;

const textDecoder = new TextDecoder();

export function parseSyncPayload(payload: Uint8Array): SyncPayload | null {
  try {
    const parsed: unknown = JSON.parse(textDecoder.decode(payload));
    if (typeof parsed !== "object" || parsed === null) return null;
    const kind = (parsed as { kind?: unknown }).kind;
    return kind === "session" || kind === "thread" ? (parsed as SyncPayload) : null;
  } catch {
    return null;
  }
}

export function sessionPayloadToIngestedSession(payload: SessionSyncPayload, id: number, root = "vault"): IngestedSession {
  return {
    id,
    root,
    harness: payload.harness,
    harnessVersion: payload.harness_version,
    sessionId: payload.session_id,
    reportedBy: "agent",
    door: payload.door === "save_session" ? "save_session" : "ingest_context",
    trigger: payload.trigger === "auto" ? "auto" : "manual",
    startedAt: payload.started_at,
    endedAt: payload.ended_at,
    summary: payload.summary,
    keyDecisions: payload.key_decisions,
    filesTouched: payload.files_touched,
    openItems: payload.open_items,
    threadId: null,
    threadTitle: payload.thread_title,
    continuesFrom: payload.continues_from,
    handoff: payload.handoff,
    state: payload.state,
    gotchas: payload.gotchas,
    artifacts: payload.artifacts,
    suggestedFirstPrompt: payload.suggested_first_prompt,
    transcript: payload.transcript ?? null,
    ingestedAt: new Date(payload.ingested_at).toISOString(),
    updatedAt: new Date(payload.updated_at).toISOString(),
    revision: payload.revision,
  };
}

export interface VaultView {
  threads: ThreadSummary[];
  /** Live sessions, chronological (oldest first), threadTitle populated. */
  sessions: IngestedSession[];
}

/** Rebuilds the queryable view a local IngestStore would give, from nothing
    but decrypted payloads. Tombstoned records are dropped; a session whose
    thread payload never arrived still yields a thread summary. */
export function buildVaultView(payloads: SyncPayload[]): VaultView {
  const sessionPayloads = payloads
    .filter((p): p is SessionSyncPayload => p.kind === "session" && !p.deleted)
    .sort((a, b) => a.updated_at - b.updated_at || a.session_id.localeCompare(b.session_id));
  const sessions = sessionPayloads.map((p, index) => sessionPayloadToIngestedSession(p, index + 1));

  const threadMeta = new Map<string, ThreadSyncPayload>();
  for (const p of payloads) {
    if (p.kind === "thread" && !p.deleted) threadMeta.set(p.title.toLowerCase(), p);
  }
  const byTitle = new Map<string, { title: string; sessions: IngestedSession[] }>();
  for (const session of sessions) {
    if (!session.threadTitle) continue;
    const key = session.threadTitle.toLowerCase();
    const entry = byTitle.get(key) ?? { title: session.threadTitle, sessions: [] };
    entry.sessions.push(session);
    byTitle.set(key, entry);
  }
  for (const [key, meta] of threadMeta) {
    if (!byTitle.has(key)) byTitle.set(key, { title: meta.title, sessions: [] });
  }

  let nextId = 1;
  const threads: ThreadSummary[] = [...byTitle.entries()].map(([key, entry]) => {
    const meta = threadMeta.get(key);
    const newest = entry.sessions[entry.sessions.length - 1];
    const lastActive = Math.max(
      meta?.last_active ?? 0,
      newest ? Date.parse(newest.updatedAt) : 0
    );
    return {
      id: nextId++,
      title: meta?.title ?? entry.title,
      status: meta?.status ?? "active",
      tags: meta?.tags ?? [],
      private: meta?.private ?? false,
      createdAt: new Date(meta?.created_at ?? lastActive).toISOString(),
      lastActiveAt: new Date(lastActive).toISOString(),
      sessionCount: entry.sessions.length,
      lastHarness: newest?.harness ?? null,
    };
  });
  threads.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
  return { threads, sessions };
}
