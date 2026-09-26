import type Database from "better-sqlite3";
import {
  buildContextMemory,
  GLOBAL_MEMORY_ROOT,
  initialMemoryStatus,
  MEMORY_CATEGORIES,
  memoryId,
  type ContextMemory,
  type MemoryCategory,
  type MemoryImportResult,
  type MemoryInput,
  type MemoryOrigin,
  type MemoryRecord,
  type MemoryScope,
  type MemoryStatus,
} from "../memory.js";
import { redactContent } from "../redact.js";
import type { SyncEntry } from "../sync/client.js";
import type { MemorySyncPayload } from "../sync/payload.js";

/**
 * Persistence for imported memory, in the same SQLite file as sessions and
 * threads (the IngestStore owns the connection and hands it here). Global
 * memories live under GLOBAL_MEMORY_ROOT; project memories under their root.
 * Rejection is a tombstone so it syncs, and so a later re-import of the same
 * fact cannot quietly bring it back.
 */

export type { MemoryImportResult } from "../memory.js";

export type MemoryListScope = MemoryScope | "all";
export type MemoryListStatus = MemoryStatus | "all";

interface MemoryRow {
  id: number;
  root: string;
  memory_id: string;
  category: string;
  text: string;
  verbatim: number;
  origin: string;
  date: string | null;
  project: string | null;
  status: string;
  sources: string;
  seen_count: number;
  created_at: number;
  updated_at: number;
  deleted: number;
}

const textEncoder = new TextEncoder();

function redact(text: string): string {
  return redactContent(text).text;
}

function parseSources(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function toCategory(value: string): MemoryCategory {
  return (MEMORY_CATEGORIES as readonly string[]).includes(value) ? (value as MemoryCategory) : "fact";
}

function rowToRecord(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    root: row.root,
    scope: row.root === GLOBAL_MEMORY_ROOT ? "global" : "project",
    memoryId: row.memory_id,
    category: toCategory(row.category),
    text: row.text,
    verbatim: row.verbatim === 1,
    origin: row.origin === "stored" ? "stored" : "inferred",
    date: row.date,
    project: row.project,
    status: row.status === "pending" ? "pending" : "active",
    sources: parseSources(row.sources),
    seenCount: row.seen_count,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function scopeRoot(root: string, scope: MemoryScope): string {
  return scope === "global" ? GLOBAL_MEMORY_ROOT : root;
}

export class MemoryStore {
  constructor(private readonly db: Database.Database) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        root TEXT NOT NULL,
        memory_id TEXT NOT NULL,
        category TEXT NOT NULL,
        text TEXT NOT NULL,
        verbatim INTEGER NOT NULL DEFAULT 0,
        origin TEXT NOT NULL DEFAULT 'inferred',
        date TEXT,
        project TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        sources TEXT NOT NULL DEFAULT '[]',
        seen_count INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        UNIQUE (root, memory_id)
      );
      CREATE INDEX IF NOT EXISTS idx_memories_root_status ON memories (root, deleted, status);
    `);
  }

  /** Upserts a validated batch. Same fact again = merge (sources, seen count,
      stronger origin), never a duplicate; status is preserved on merge. */
  import(root: string, input: MemoryInput, now = Date.now()): MemoryImportResult {
    const target = scopeRoot(root, input.scope);
    const harness = input.source.harness;
    const result: MemoryImportResult = { created: 0, merged: 0, pending: 0, skippedRejected: 0 };
    const select = this.db.prepare(
      "SELECT id, verbatim, origin, date, sources, deleted FROM memories WHERE root = ? AND memory_id = ?"
    );
    const insert = this.db.prepare(
      `INSERT INTO memories (root, memory_id, category, text, verbatim, origin, date, project, status, sources, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const update = this.db.prepare(
      `UPDATE memories SET verbatim = ?, origin = ?, date = ?, sources = ?, seen_count = seen_count + 1,
         updated_at = MAX(updated_at + 1, ?) WHERE id = ?`
    );
    const apply = this.db.transaction(() => {
      for (const entry of input.entries) {
        const text = redact(entry.text);
        const project = entry.project ? redact(entry.project) : null;
        const id = memoryId(input.scope, entry.category, text);
        const existing = select.get(target, id) as
          | { id: number; verbatim: number; origin: string; date: string | null; sources: string; deleted: number }
          | undefined;
        if (existing?.deleted === 1) {
          result.skippedRejected += 1;
          continue;
        }
        if (existing) {
          const sources = parseSources(existing.sources);
          if (!sources.includes(harness)) sources.push(harness);
          const origin: MemoryOrigin = existing.origin === "stored" || entry.origin === "stored" ? "stored" : "inferred";
          update.run(
            existing.verbatim === 1 || entry.verbatim ? 1 : 0,
            origin,
            existing.date ?? entry.date,
            JSON.stringify(sources),
            now,
            existing.id
          );
          result.merged += 1;
          continue;
        }
        const status = initialMemoryStatus(entry.category);
        insert.run(
          target,
          id,
          entry.category,
          text,
          entry.verbatim ? 1 : 0,
          entry.origin,
          entry.date,
          project,
          status,
          JSON.stringify([harness]),
          now,
          now
        );
        result.created += 1;
        if (status === "pending") result.pending += 1;
      }
    });
    apply();
    return result;
  }

  /** Live (non-rejected) memories visible from this root: its project scope
      and/or the global scope. */
  list(root: string, options: { scope?: MemoryListScope; status?: MemoryListStatus } = {}): MemoryRecord[] {
    const scope = options.scope ?? "all";
    const status = options.status ?? "all";
    const roots = scope === "global" ? [GLOBAL_MEMORY_ROOT] : scope === "project" ? [root] : [GLOBAL_MEMORY_ROOT, root];
    const placeholders = roots.map(() => "?").join(", ");
    const statusClause = status === "all" ? "" : " AND status = ?";
    const params: string[] = status === "all" ? roots : [...roots, status];
    const rows = this.db
      .prepare(
        `SELECT * FROM memories WHERE root IN (${placeholders}) AND deleted = 0${statusClause} ORDER BY created_at ASC, id ASC`
      )
      .all(...params) as MemoryRow[];
    return rows.map(rowToRecord);
  }

  pendingCount(root: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM memories WHERE root IN (?, ?) AND deleted = 0 AND status = 'pending'")
      .get(GLOBAL_MEMORY_ROOT, root) as { n: number };
    return row.n;
  }

  /** Approves one pending memory visible from this root. */
  approve(root: string, id: number, now = Date.now()): boolean {
    return (
      this.db
        .prepare(
          `UPDATE memories SET status = 'active', updated_at = MAX(updated_at + 1, ?)
           WHERE id = ? AND root IN (?, ?) AND deleted = 0 AND status = 'pending'`
        )
        .run(now, id, GLOBAL_MEMORY_ROOT, root).changes > 0
    );
  }

  approveAllPending(root: string, now = Date.now()): number {
    return this.db
      .prepare(
        `UPDATE memories SET status = 'active', updated_at = MAX(updated_at + 1, ?)
         WHERE root IN (?, ?) AND deleted = 0 AND status = 'pending'`
      )
      .run(now, GLOBAL_MEMORY_ROOT, root).changes;
  }

  /** Rejects (tombstones) one memory visible from this root, pending or active. */
  reject(root: string, id: number, now = Date.now()): boolean {
    return (
      this.db
        .prepare(
          `UPDATE memories SET deleted = 1, updated_at = MAX(updated_at + 1, ?)
           WHERE id = ? AND root IN (?, ?) AND deleted = 0`
        )
        .run(now, id, GLOBAL_MEMORY_ROOT, root).changes > 0
    );
  }

  /** The `memory` block for this root's snapshots; undefined when empty. */
  contextMemory(root: string): ContextMemory | undefined {
    return buildContextMemory(
      this.list(root, { scope: "global", status: "active" }),
      this.list(root, { scope: "project", status: "active" }),
      this.pendingCount(root)
    );
  }

  // -------------------------------------------------------------------------
  // Sync: global memories ride every vault this device syncs; project
  // memories ride their own root's vault. Imports route by payload scope.
  // -------------------------------------------------------------------------

  exportSyncEntries(root: string): SyncEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM memories WHERE root IN (?, ?)")
      .all(GLOBAL_MEMORY_ROOT, root) as MemoryRow[];
    return rows.map((row) => {
      const record = rowToRecord(row);
      const payload: MemorySyncPayload = {
        kind: "memory",
        scope: record.scope,
        memory_id: row.memory_id,
        category: record.category,
        text: row.text,
        verbatim: row.verbatim === 1,
        origin: record.origin,
        date: row.date,
        project: row.project,
        status: record.status,
        sources: record.sources,
        seen_count: row.seen_count,
        created_at: row.created_at,
        updated_at: row.updated_at,
        deleted: row.deleted === 1,
      };
      return {
        naturalId: `memory:${record.scope}:${row.memory_id}`,
        version: row.updated_at,
        deleted: row.deleted === 1,
        payload: textEncoder.encode(JSON.stringify(payload)),
      };
    });
  }

  /** LWW apply of one decrypted memory payload; 1 when local state changed. */
  applySyncPayload(root: string, payload: MemorySyncPayload): number {
    const target = scopeRoot(root, payload.scope === "global" ? "global" : "project");
    const existing = this.db
      .prepare("SELECT id, updated_at FROM memories WHERE root = ? AND memory_id = ?")
      .get(target, payload.memory_id) as { id: number; updated_at: number } | undefined;
    if (existing && payload.updated_at <= existing.updated_at) return 0;
    const values = [
      toCategory(payload.category),
      payload.text,
      payload.verbatim ? 1 : 0,
      payload.origin === "stored" ? "stored" : "inferred",
      payload.date,
      payload.project,
      payload.status === "pending" ? "pending" : "active",
      JSON.stringify(payload.sources),
      payload.seen_count,
      payload.created_at,
      payload.updated_at,
      payload.deleted ? 1 : 0,
    ];
    if (existing) {
      this.db
        .prepare(
          `UPDATE memories SET category = ?, text = ?, verbatim = ?, origin = ?, date = ?, project = ?, status = ?,
             sources = ?, seen_count = ?, created_at = ?, updated_at = ?, deleted = ? WHERE id = ?`
        )
        .run(...values, existing.id);
      return 1;
    }
    this.db
      .prepare(
        `INSERT INTO memories (category, text, verbatim, origin, date, project, status, sources, seen_count,
           created_at, updated_at, deleted, root, memory_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(...values, target, payload.memory_id);
    return 1;
  }
}
