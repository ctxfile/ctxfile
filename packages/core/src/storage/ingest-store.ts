import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { IngestArtifact, IngestDoor, IngestedSession, IngestInput, ThreadSummary } from "../ingest.js";
import { ingestSessionId } from "../ingest.js";
import { redactContent } from "../redact.js";
import type { LocalBlobSource, SyncEntry } from "../sync/client.js";
import { parseSyncPayload, type SessionSyncPayload, type SyncPayload, type ThreadSyncPayload } from "../sync/payload.js";

/**
 * Persistence for agent-reported session digests (`ingest_context` and
 * `save_session`) and for threads, the durable identities that outlive any
 * one provider's chat history. Provenance columns are first-class:
 * reported_by, door, harness, timestamps, revision count, and a capped
 * history of superseded summaries. This is the same machinery the Sync relay
 * and the Team tier's shared writable context replicate later.
 */

const HISTORY_CAP = 5;

export interface IngestResult {
  id: number;
  sessionId: string;
  revision: number;
  action: "created" | "updated";
  threadId: number | null;
  threadTitle: string | null;
}

function redact(text: string): string {
  return redactContent(text).text;
}

function redactList(items: string[]): string[] {
  return items.map(redact);
}

interface Row {
  id: number;
  root: string;
  harness: string;
  harness_version: string | null;
  session_id: string;
  door: string;
  capture_trigger: string;
  deleted: number;
  started_at: string | null;
  ended_at: string | null;
  summary: string;
  key_decisions: string;
  files_touched: string;
  open_items: string;
  thread_id: number | null;
  thread_title: string | null;
  continues_from: string | null;
  handoff: number;
  state: string | null;
  gotchas: string;
  artifacts: string;
  suggested_first_prompt: string | null;
  transcript: string | null;
  ingested_at: number;
  updated_at: number;
  revision: number;
}

interface ThreadRow {
  id: number;
  root: string;
  title: string;
  status: string;
  tags: string;
  private: number;
  created_at: number;
  last_active: number;
  session_count: number;
  last_harness: string | null;
}

function parseList(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function parseArtifacts(json: string): IngestArtifact[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is IngestArtifact =>
        typeof v === "object" &&
        v !== null &&
        typeof (v as IngestArtifact).ref === "string" &&
        typeof (v as IngestArtifact).role === "string"
    );
  } catch {
    return [];
  }
}

function rowToSession(row: Row): IngestedSession {
  return {
    id: row.id,
    root: row.root,
    harness: row.harness,
    harnessVersion: row.harness_version,
    sessionId: row.session_id,
    reportedBy: "agent",
    door: row.door === "save_session" ? "save_session" : "ingest_context",
    trigger: row.capture_trigger === "auto" ? "auto" : "manual",
    startedAt: row.started_at,
    endedAt: row.ended_at,
    summary: row.summary,
    keyDecisions: parseList(row.key_decisions),
    filesTouched: parseList(row.files_touched),
    openItems: parseList(row.open_items),
    threadId: row.thread_id,
    threadTitle: row.thread_title,
    continuesFrom: row.continues_from,
    handoff: row.handoff === 1,
    state: row.state,
    gotchas: parseList(row.gotchas),
    artifacts: parseArtifacts(row.artifacts),
    suggestedFirstPrompt: row.suggested_first_prompt,
    transcript: row.transcript,
    ingestedAt: new Date(row.ingested_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    revision: row.revision,
  };
}

function rowToThread(row: ThreadRow): ThreadSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    tags: parseList(row.tags),
    private: row.private === 1,
    createdAt: new Date(row.created_at).toISOString(),
    lastActiveAt: new Date(row.last_active).toISOString(),
    sessionCount: row.session_count,
    lastHarness: row.last_harness,
  };
}

const SESSION_SELECT = `
  SELECT s.*, t.title AS thread_title
  FROM ingest_sessions s
  LEFT JOIN threads t ON t.id = s.thread_id
`;

const THREAD_SELECT = `
  SELECT t.*,
    (SELECT COUNT(*) FROM ingest_sessions s WHERE s.thread_id = t.id AND s.deleted = 0) AS session_count,
    (SELECT s.harness FROM ingest_sessions s WHERE s.thread_id = t.id AND s.deleted = 0
       ORDER BY s.updated_at DESC, s.id DESC LIMIT 1) AS last_harness
  FROM threads t
`;

const textEncoder = new TextEncoder();

export class IngestStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ingest_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        root TEXT NOT NULL,
        harness TEXT NOT NULL,
        session_id TEXT NOT NULL,
        reported_by TEXT NOT NULL DEFAULT 'agent',
        harness_version TEXT,
        started_at TEXT,
        ended_at TEXT,
        summary TEXT NOT NULL,
        key_decisions TEXT NOT NULL DEFAULT '[]',
        files_touched TEXT NOT NULL DEFAULT '[]',
        open_items TEXT NOT NULL DEFAULT '[]',
        ingested_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        history TEXT NOT NULL DEFAULT '[]',
        UNIQUE (root, harness, session_id)
      );
      CREATE INDEX IF NOT EXISTS idx_ingest_root_updated
        ON ingest_sessions (root, updated_at DESC);
    `);
    this.migrate();
  }

  /** Idempotent v2 migration: column-presence checks, never version guesses,
      so a v1 database upgrades in place and a v2 one is untouched. */
  private migrate(): void {
    const columns = new Set(
      (this.db.prepare("PRAGMA table_info(ingest_sessions)").all() as { name: string }[]).map((c) => c.name)
    );
    const addColumn = (name: string, ddl: string): void => {
      if (!columns.has(name)) this.db.exec(`ALTER TABLE ingest_sessions ADD COLUMN ${ddl}`);
    };
    addColumn("thread_id", "thread_id INTEGER");
    addColumn("continues_from", "continues_from TEXT");
    addColumn("handoff", "handoff INTEGER NOT NULL DEFAULT 0");
    addColumn("state", "state TEXT");
    addColumn("gotchas", "gotchas TEXT NOT NULL DEFAULT '[]'");
    addColumn("artifacts", "artifacts TEXT NOT NULL DEFAULT '[]'");
    addColumn("suggested_first_prompt", "suggested_first_prompt TEXT");
    addColumn("door", "door TEXT NOT NULL DEFAULT 'ingest_context'");
    // Sync (LWW + tombstones): deletions are markers, so they propagate.
    addColumn("deleted", "deleted INTEGER NOT NULL DEFAULT 0");
    // RESERVED (Enterprise PRD §9.1): org attribution for federation. Inert
    // until org identity ships; reserving it now keeps that migration a no-op.
    addColumn("org_id", "org_id TEXT");
    // Behavior layer: auto vs manual checkpoint provenance.
    addColumn("capture_trigger", "capture_trigger TEXT NOT NULL DEFAULT 'manual'");
    // Opt-in full-conversation capture; excluded from every digest render.
    addColumn("transcript", "transcript TEXT");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        root TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        tags TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        last_active INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        org_id TEXT,
        private INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_threads_root_title ON threads (root, lower(title));
      CREATE INDEX IF NOT EXISTS idx_threads_root_active ON threads (root, last_active DESC);
    `);
    const threadColumns = new Set(
      (this.db.prepare("PRAGMA table_info(threads)").all() as { name: string }[]).map((c) => c.name)
    );
    if (!threadColumns.has("deleted")) this.db.exec("ALTER TABLE threads ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0");
    if (!threadColumns.has("org_id")) this.db.exec("ALTER TABLE threads ADD COLUMN org_id TEXT");
    if (!threadColumns.has("private")) this.db.exec("ALTER TABLE threads ADD COLUMN private INTEGER NOT NULL DEFAULT 0");
    this.db.exec("PRAGMA user_version = 4;");
  }

  /** Case-insensitive find-or-create; titles are redacted like all content.
      Re-using a tombstoned (deleted) title resurrects that row — clearing
      `deleted` — rather than bumping its clock while it stays deleted (which
      would attach a session to an invisible thread and re-push a tombstone with
      a newer clock). A unique (root, lower(title)) index makes one row per
      title the only possibility, so resurrection is the correct move. */
  ensureThread(root: string, title: string, now = Date.now()): { id: number; title: string; created: boolean } {
    const cleanTitle = redact(title.trim());
    const existing = this.db
      .prepare("SELECT id, title, deleted FROM threads WHERE root = ? AND lower(title) = lower(?)")
      .get(root, cleanTitle) as { id: number; title: string; deleted: number } | undefined;
    if (existing) {
      this.db
        .prepare("UPDATE threads SET last_active = MAX(last_active, ?), deleted = 0 WHERE id = ?")
        .run(now, existing.id);
      // A resurrected thread counts as "created": it is reappearing.
      return { id: existing.id, title: existing.title, created: existing.deleted === 1 };
    }
    const info = this.db
      .prepare("INSERT INTO threads (root, title, created_at, last_active) VALUES (?, ?, ?, ?)")
      .run(root, cleanTitle, now, now);
    return { id: Number(info.lastInsertRowid), title: cleanTitle, created: true };
  }

  /** The thread of a prior session, so `continues_from` carries lineage even
      when the reporting agent never names the thread. */
  private threadOfSession(root: string, sessionId: string): number | null {
    const row = this.db
      .prepare(
        "SELECT thread_id FROM ingest_sessions WHERE root = ? AND session_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1"
      )
      .get(root, sessionId) as { thread_id: number | null } | undefined;
    return row?.thread_id ?? null;
  }

  private threadTitle(threadId: number | null): string | null {
    if (threadId === null) return null;
    const row = this.db.prepare("SELECT title FROM threads WHERE id = ?").get(threadId) as
      | { title: string }
      | undefined;
    return row?.title ?? null;
  }

  /** Upsert on (root, harness, session_id): re-ingest updates with history. */
  ingest(root: string, input: IngestInput, now = Date.now(), door: IngestDoor = "ingest_context"): IngestResult {
    const sessionId = ingestSessionId(input);
    // Everything ingested is redacted at write, like every other connector.
    const session = input.session;
    const summary = redact(session.summary);
    const keyDecisions = JSON.stringify(redactList(session.key_decisions));
    const filesTouched = JSON.stringify(redactList(session.files_touched));
    const openItems = JSON.stringify(redactList(session.open_items));
    const state = session.state ? redact(session.state) : null;
    const gotchas = JSON.stringify(redactList(session.gotchas ?? []));
    const artifacts = JSON.stringify(
      (session.artifacts ?? []).map((a) => ({ ref: redact(a.ref), role: redact(a.role) }))
    );
    const suggestedFirstPrompt = session.suggested_first_prompt ? redact(session.suggested_first_prompt) : null;
    // COALESCE on update: a revision that omits the transcript (e.g. a
    // retro-threading re-save) must not destroy a previously stored one.
    const transcript = session.transcript ? redact(session.transcript) : null;
    const startedAt = session.started_at ?? null;
    const endedAt = session.ended_at ?? null;
    const continuesFrom = session.continues_from ?? null;
    const handoff = session.handoff === true ? 1 : 0;
    const trigger = session.trigger === "auto" ? "auto" : "manual";
    const harnessVersion = input.source.harness_version ?? null;

    const existing = this.db
      .prepare(
        "SELECT id, revision, summary, updated_at, history, thread_id FROM ingest_sessions WHERE root = ? AND harness = ? AND session_id = ?"
      )
      .get(root, input.source.harness, sessionId) as
      | { id: number; revision: number; summary: string; updated_at: number; history: string; thread_id: number | null }
      | undefined;

    // Thread attachment: explicit title wins, lineage inherits, updates keep
    // their existing thread rather than detaching on a titleless re-ingest.
    let threadId: number | null = existing?.thread_id ?? null;
    if (session.thread) {
      threadId = this.ensureThread(root, session.thread, now).id;
    } else if (threadId === null && continuesFrom) {
      threadId = this.threadOfSession(root, continuesFrom);
    }
    if (threadId !== null) {
      this.db.prepare("UPDATE threads SET last_active = MAX(last_active, ?) WHERE id = ?").run(now, threadId);
    }

    if (existing) {
      const history = parseHistory(existing.history);
      history.unshift({ summary: existing.summary, updatedAt: new Date(existing.updated_at).toISOString() });
      this.db
        .prepare(
          `UPDATE ingest_sessions SET harness_version = ?, started_at = ?, ended_at = ?, summary = ?,
             key_decisions = ?, files_touched = ?, open_items = ?, thread_id = ?, continues_from = ?,
             handoff = ?, state = ?, gotchas = ?, artifacts = ?, suggested_first_prompt = ?, door = ?,
             capture_trigger = ?, transcript = COALESCE(?, transcript),
             updated_at = ?, revision = revision + 1, history = ?, deleted = 0
           WHERE id = ?`
        )
        .run(
          harnessVersion,
          startedAt,
          endedAt,
          summary,
          keyDecisions,
          filesTouched,
          openItems,
          threadId,
          continuesFrom,
          handoff,
          state,
          gotchas,
          artifacts,
          suggestedFirstPrompt,
          door,
          trigger,
          transcript,
          now,
          JSON.stringify(history.slice(0, HISTORY_CAP)),
          existing.id
        );
      return {
        id: existing.id,
        sessionId,
        revision: existing.revision + 1,
        action: "updated",
        threadId,
        threadTitle: this.threadTitle(threadId),
      };
    }

    const info = this.db
      .prepare(
        `INSERT INTO ingest_sessions
           (root, harness, session_id, harness_version, started_at, ended_at,
            summary, key_decisions, files_touched, open_items, thread_id, continues_from,
            handoff, state, gotchas, artifacts, suggested_first_prompt, door, capture_trigger, transcript, ingested_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        root,
        input.source.harness,
        sessionId,
        harnessVersion,
        startedAt,
        endedAt,
        summary,
        keyDecisions,
        filesTouched,
        openItems,
        threadId,
        continuesFrom,
        handoff,
        state,
        gotchas,
        artifacts,
        suggestedFirstPrompt,
        door,
        trigger,
        transcript,
        now,
        now
      );
    return {
      id: Number(info.lastInsertRowid),
      sessionId,
      revision: 1,
      action: "created",
      threadId,
      threadTitle: this.threadTitle(threadId),
    };
  }

  /** Newest-first records for this project. */
  list(root: string, limit = 50): IngestedSession[] {
    const rows = this.db
      .prepare(`${SESSION_SELECT} WHERE s.root = ? AND s.deleted = 0 ORDER BY s.updated_at DESC, s.id DESC LIMIT ?`)
      .all(root, limit) as Row[];
    return rows.map(rowToSession);
  }

  /** All threads for this project, most recently active first. */
  listThreads(root: string): ThreadSummary[] {
    const rows = this.db
      .prepare(`${THREAD_SELECT} WHERE t.root = ? AND t.deleted = 0 ORDER BY t.last_active DESC, t.id DESC`)
      .all(root) as ThreadRow[];
    return rows.map(rowToThread);
  }

  /** A thread's sessions in chronological (oldest-first) order. */
  threadSessions(root: string, threadId: number): IngestedSession[] {
    const rows = this.db
      .prepare(
        `${SESSION_SELECT} WHERE s.root = ? AND s.thread_id = ? AND s.deleted = 0 ORDER BY s.updated_at ASC, s.id ASC`
      )
      .all(root, threadId) as Row[];
    return rows.map(rowToSession);
  }

  /** The newest auto checkpoint on a thread, for the behavior-layer debounce
      (§4.2: reject unchanged checkpoints inside the window). */
  latestAutoForThread(root: string, threadTitle: string): IngestedSession | null {
    const rows = this.db
      .prepare(
        `${SESSION_SELECT}
         WHERE s.root = ? AND s.deleted = 0 AND s.capture_trigger = 'auto' AND t.title IS NOT NULL AND lower(t.title) = lower(?)
         ORDER BY s.updated_at DESC, s.id DESC LIMIT 1`
      )
      .all(root, threadTitle) as Row[];
    const row = rows[0];
    return row ? rowToSession(row) : null;
  }

  /** Marks a thread private (excluded from auto-capture) or public again. */
  setThreadPrivate(root: string, threadId: number, isPrivate: boolean, now = Date.now()): boolean {
    // Always advance last_active by at least one tick so the change carries a
    // newer clock and syncs (thread sync blobs are versioned by last_active
    // under LWW). MAX(last_active + 1, now) also moves forward when the stored
    // clock is already ahead of this device (skew after syncing from another).
    return (
      this.db
        .prepare("UPDATE threads SET private = ?, last_active = MAX(last_active + 1, ?) WHERE root = ? AND id = ? AND deleted = 0")
        .run(isPrivate ? 1 : 0, now, root, threadId).changes > 0
    );
  }

  /** Whether the (case-insensitive) titled thread is private; false when the
      thread does not exist yet. */
  threadIsPrivate(root: string, title: string): boolean {
    const row = this.db
      .prepare("SELECT private FROM threads WHERE root = ? AND lower(title) = lower(?) AND deleted = 0")
      .get(root, title) as { private: number } | undefined;
    return row?.private === 1;
  }

  /** Deletes one record by numeric id (as shown by `ctxfile ingest list`).
      A tombstone, not a hard delete, so the deletion syncs like any write. */
  remove(root: string, id: number, now = Date.now()): boolean {
    const info = this.db
      .prepare("UPDATE ingest_sessions SET deleted = 1, updated_at = ? WHERE root = ? AND id = ? AND deleted = 0")
      .run(now, root, id);
    return info.changes > 0;
  }

  // -------------------------------------------------------------------------
  // Sync (M2): this store as a LocalBlobSource. Export serializes sessions and
  // threads (tombstones included) with their own updated-at clocks as the LWW
  // version; import applies anything strictly newer, verbatim, so two stores
  // that sync through the same vault converge regardless of order.
  // -------------------------------------------------------------------------

  /** Everything syncable for this root, tombstones included. */
  exportSyncEntries(root: string): SyncEntry[] {
    const entries: SyncEntry[] = [];
    const sessionRows = this.db.prepare(`${SESSION_SELECT} WHERE s.root = ?`).all(root) as Row[];
    for (const row of sessionRows) {
      const payload: SessionSyncPayload = {
        kind: "session",
        harness: row.harness,
        harness_version: row.harness_version,
        session_id: row.session_id,
        door: row.door,
        started_at: row.started_at,
        ended_at: row.ended_at,
        summary: row.summary,
        key_decisions: parseList(row.key_decisions),
        files_touched: parseList(row.files_touched),
        open_items: parseList(row.open_items),
        thread_title: row.thread_title,
        continues_from: row.continues_from,
        handoff: row.handoff === 1,
        state: row.state,
        gotchas: parseList(row.gotchas),
        artifacts: parseArtifacts(row.artifacts),
        suggested_first_prompt: row.suggested_first_prompt,
        transcript: row.transcript,
        trigger: row.capture_trigger === "auto" ? "auto" : "manual",
        ingested_at: row.ingested_at,
        updated_at: row.updated_at,
        revision: row.revision,
        deleted: row.deleted === 1,
      };
      entries.push({
        naturalId: `session:${row.harness}:${row.session_id}`,
        version: row.updated_at,
        deleted: row.deleted === 1,
        payload: textEncoder.encode(JSON.stringify(payload)),
      });
    }
    const threadRows = this.db.prepare("SELECT * FROM threads WHERE root = ?").all(root) as {
      title: string;
      status: string;
      tags: string;
      created_at: number;
      last_active: number;
      deleted: number;
      private: number;
    }[];
    for (const row of threadRows) {
      const payload: ThreadSyncPayload = {
        kind: "thread",
        title: row.title,
        status: row.status,
        tags: parseList(row.tags),
        created_at: row.created_at,
        last_active: row.last_active,
        deleted: row.deleted === 1,
        private: row.private === 1,
      };
      entries.push({
        naturalId: `thread:${row.title.toLowerCase()}`,
        version: row.last_active,
        deleted: row.deleted === 1,
        payload: textEncoder.encode(JSON.stringify(payload)),
      });
    }
    return entries;
  }

  /** Applies decrypted sync entries with per-record LWW; returns how many
      changed local state. Content was redacted before it was first stored,
      and blobs are AEAD-authenticated, so imports apply verbatim. */
  importSyncEntries(root: string, entries: SyncEntry[]): number {
    const payloads = entries
      .map((entry) => parseSyncPayload(entry.payload))
      .filter((p): p is SyncPayload => p !== null);
    let applied = 0;
    // Threads first: a session's ensureThread would otherwise create a bare
    // thread whose last_active ties the real thread payload out of applying,
    // silently dropping its status and tags.
    for (const payload of payloads) {
      if (payload.kind === "thread") applied += this.applyThreadPayload(root, payload);
    }
    for (const payload of payloads) {
      if (payload.kind === "session") applied += this.applySessionPayload(root, payload);
    }
    return applied;
  }

  /** This store, adapted to the SyncClient contract for one root. */
  syncSource(root: string): LocalBlobSource {
    return {
      snapshot: async () => this.exportSyncEntries(root),
      apply: async (entries) => this.importSyncEntries(root, entries),
    };
  }

  private applyThreadPayload(root: string, payload: ThreadSyncPayload): number {
    const existing = this.db
      .prepare("SELECT id, last_active FROM threads WHERE root = ? AND lower(title) = lower(?)")
      .get(root, payload.title) as { id: number; last_active: number } | undefined;
    const isPrivate = payload.private ? 1 : 0;
    if (!existing) {
      this.db
        .prepare("INSERT INTO threads (root, title, status, tags, created_at, last_active, deleted, private) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(root, payload.title, payload.status, JSON.stringify(payload.tags), payload.created_at, payload.last_active, payload.deleted ? 1 : 0, isPrivate);
      return 1;
    }
    if (payload.last_active <= existing.last_active) return 0;
    this.db
      .prepare("UPDATE threads SET status = ?, tags = ?, last_active = ?, deleted = ?, private = ? WHERE id = ?")
      .run(payload.status, JSON.stringify(payload.tags), payload.last_active, payload.deleted ? 1 : 0, isPrivate, existing.id);
    return 1;
  }

  private applySessionPayload(root: string, payload: SessionSyncPayload): number {
    const existing = this.db
      .prepare("SELECT id, updated_at FROM ingest_sessions WHERE root = ? AND harness = ? AND session_id = ?")
      .get(root, payload.harness, payload.session_id) as { id: number; updated_at: number } | undefined;
    if (existing && payload.updated_at <= existing.updated_at) return 0;
    const threadId = payload.thread_title
      ? this.ensureThread(root, payload.thread_title, payload.updated_at).id
      : null;
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO ingest_sessions
             (root, harness, session_id, harness_version, started_at, ended_at,
              summary, key_decisions, files_touched, open_items, thread_id, continues_from,
              handoff, state, gotchas, artifacts, suggested_first_prompt, door, capture_trigger,
              transcript, ingested_at, updated_at, revision, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          root,
          payload.harness,
          payload.session_id,
          payload.harness_version,
          payload.started_at,
          payload.ended_at,
          payload.summary,
          JSON.stringify(payload.key_decisions),
          JSON.stringify(payload.files_touched),
          JSON.stringify(payload.open_items),
          threadId,
          payload.continues_from,
          payload.handoff ? 1 : 0,
          payload.state,
          JSON.stringify(payload.gotchas),
          JSON.stringify(payload.artifacts),
          payload.suggested_first_prompt,
          payload.door,
          payload.trigger === "auto" ? "auto" : "manual",
          payload.transcript ?? null,
          payload.ingested_at,
          payload.updated_at,
          payload.revision,
          payload.deleted ? 1 : 0
        );
      return 1;
    }
    this.db
      .prepare(
        `UPDATE ingest_sessions SET harness_version = ?, started_at = ?, ended_at = ?, summary = ?,
           key_decisions = ?, files_touched = ?, open_items = ?, thread_id = ?, continues_from = ?,
           handoff = ?, state = ?, gotchas = ?, artifacts = ?, suggested_first_prompt = ?, door = ?,
           capture_trigger = ?, transcript = COALESCE(?, transcript), updated_at = ?, revision = ?, deleted = ?
         WHERE id = ?`
      )
      .run(
        payload.harness_version,
        payload.started_at,
        payload.ended_at,
        payload.summary,
        JSON.stringify(payload.key_decisions),
        JSON.stringify(payload.files_touched),
        JSON.stringify(payload.open_items),
        threadId,
        payload.continues_from,
        payload.handoff ? 1 : 0,
        payload.state,
        JSON.stringify(payload.gotchas),
        JSON.stringify(payload.artifacts),
        payload.suggested_first_prompt,
        payload.door,
        payload.trigger === "auto" ? "auto" : "manual",
        payload.transcript ?? null,
        payload.updated_at,
        payload.revision,
        payload.deleted ? 1 : 0,
        existing.id
      );
    return 1;
  }

  close(): void {
    this.db.close();
  }
}

function parseHistory(json: string): { summary: string; updatedAt: string }[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed)
      ? (parsed as { summary: string; updatedAt: string }[]).filter(
          (h) => typeof h?.summary === "string" && typeof h?.updatedAt === "string"
        )
      : [];
  } catch {
    return [];
  }
}
