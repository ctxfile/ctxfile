import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ContextObject } from "../engine/types.js";

export class SnapshotCache {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    // agent_id namespaces entries per AI-employee identity (Pro roadmap);
    // v1 has a single implicit agent, "default".
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        root TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT 'default',
        created_at INTEGER NOT NULL,
        json TEXT NOT NULL
      );
    `);
    // Migrate pre-agent_id / pre-config_fp databases (CREATE IF NOT EXISTS keeps old shapes).
    const columns = this.db.prepare("PRAGMA table_info(snapshots)").all() as { name: string }[];
    if (!columns.some((c) => c.name === "agent_id")) {
      this.db.exec("ALTER TABLE snapshots ADD COLUMN agent_id TEXT NOT NULL DEFAULT 'default'");
    }
    if (!columns.some((c) => c.name === "config_fp")) {
      this.db.exec("ALTER TABLE snapshots ADD COLUMN config_fp TEXT NOT NULL DEFAULT ''");
    }
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS idx_snapshots_root_agent_created ON snapshots (root, agent_id, created_at DESC)"
    );
  }

  save(root: string, ctx: ContextObject, configFingerprint = "", agentId = "default"): void {
    this.db
      .prepare("INSERT INTO snapshots (root, agent_id, config_fp, created_at, json) VALUES (?, ?, ?, ?, ?)")
      .run(root, agentId, configFingerprint, Date.now(), JSON.stringify(ctx));
  }

  latest(root: string, maxAgeMs: number, configFingerprint = "", agentId = "default"): ContextObject | null {
    const row = this.db
      .prepare(
        "SELECT created_at, json FROM snapshots WHERE root = ? AND agent_id = ? AND config_fp = ? ORDER BY created_at DESC, id DESC LIMIT 1"
      )
      .get(root, agentId, configFingerprint) as { created_at: number; json: string } | undefined;
    return this.rowToContext(row, maxAgeMs);
  }

  /** Like `latest`, but matches any config_fp sharing the given prefix
      (e.g. the static-config portion of a `{ staticFingerprint, hints }`
      fingerprint) instead of requiring an exact match. Uses `substr` rather
      than `LIKE` because fingerprints are JSON and may contain `_`/`%`,
      which `LIKE` treats as wildcards. */
  latestByPrefix(root: string, maxAgeMs: number, fpPrefix: string, agentId = "default"): ContextObject | null {
    const row = this.db
      .prepare(
        "SELECT created_at, json FROM snapshots WHERE root = ? AND agent_id = ? AND substr(config_fp, 1, length(?)) = ? ORDER BY created_at DESC, id DESC LIMIT 1"
      )
      .get(root, agentId, fpPrefix, fpPrefix) as { created_at: number; json: string } | undefined;
    return this.rowToContext(row, maxAgeMs);
  }

  private rowToContext(row: { created_at: number; json: string } | undefined, maxAgeMs: number): ContextObject | null {
    if (!row) return null;
    if (Date.now() - row.created_at > maxAgeMs) return null;
    try {
      return JSON.parse(row.json) as ContextObject;
    } catch {
      // Corrupt row (partial write, disk error): treat as a cache miss rather
      // than crashing the server on the next get_context.
      return null;
    }
  }

  /** Newest-first snapshot summaries for the UI freshness timeline. Corrupt rows are skipped. */
  recent(root: string, limit = 20, agentId = "default"): { createdAt: number; tokensUsed: number }[] {
    const rows = this.db
      .prepare(
        "SELECT created_at, json FROM snapshots WHERE root = ? AND agent_id = ? ORDER BY created_at DESC, id DESC LIMIT ?"
      )
      .all(root, agentId, limit) as { created_at: number; json: string }[];
    return rows.flatMap((row) => {
      try {
        const ctx = JSON.parse(row.json) as ContextObject;
        return [{ createdAt: row.created_at, tokensUsed: ctx.meta.tokensUsed }];
      } catch {
        return [];
      }
    });
  }

  close(): void {
    this.db.close();
  }
}
