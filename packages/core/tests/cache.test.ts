import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SnapshotCache } from "../src/storage/cache.js";
import type { ContextObject } from "../src/engine/types.js";

function makeContext(root: string, plan: string | null = null): ContextObject {
  return {
    meta: {
      name: "ctxfile",
      version: "0.1.0",
      generatedAt: new Date().toISOString(),
      root,
      tokenBudget: 50_000,
      tokensUsed: 42,
      connectors: [],
    },
    plan,
    keyFiles: [],
    gitState: null,
    notionPages: [],
    sessionSummary: null,
  };
}

describe("SnapshotCache", () => {
  let dir: string;
  let dbPath: string;
  let cache: SnapshotCache;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cb-cache-"));
    dbPath = path.join(dir, "nested", "cache.db");
    cache = new SnapshotCache(dbPath);
  });

  afterEach(() => {
    cache.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips a snapshot", () => {
    const ctx = makeContext("/project/a", "the plan");
    cache.save("/project/a", ctx);
    const loaded = cache.latest("/project/a", 60_000);
    expect(loaded).toEqual(ctx);
  });

  it("returns null when no snapshot exists", () => {
    expect(cache.latest("/project/none", 60_000)).toBeNull();
  });

  it("returns null for stale snapshots", async () => {
    cache.save("/project/a", makeContext("/project/a"));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(cache.latest("/project/a", 10)).toBeNull();
  });

  it("isolates snapshots per root", () => {
    cache.save("/project/a", makeContext("/project/a", "plan A"));
    cache.save("/project/b", makeContext("/project/b", "plan B"));
    expect(cache.latest("/project/a", 60_000)?.plan).toBe("plan A");
    expect(cache.latest("/project/b", 60_000)?.plan).toBe("plan B");
  });

  it("returns the most recent snapshot for a root", () => {
    cache.save("/project/a", makeContext("/project/a", "old"));
    cache.save("/project/a", makeContext("/project/a", "new"));
    expect(cache.latest("/project/a", 60_000)?.plan).toBe("new");
  });

  it("migrates a pre-agent_id database in place", async () => {
    const legacyPath = path.join(dir, "legacy.db");
    const { default: Database } = await import("better-sqlite3");
    const legacy = new Database(legacyPath);
    legacy.exec(
      "CREATE TABLE snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, root TEXT NOT NULL, created_at INTEGER NOT NULL, json TEXT NOT NULL)"
    );
    legacy
      .prepare("INSERT INTO snapshots (root, created_at, json) VALUES (?, ?, ?)")
      .run("/project/a", Date.now(), JSON.stringify(makeContext("/project/a", "legacy plan")));
    legacy.close();

    const migrated = new SnapshotCache(legacyPath);
    expect(migrated.latest("/project/a", 60_000)?.plan).toBe("legacy plan");
    migrated.save("/project/a", makeContext("/project/a", "post-migration"), "", "researcher");
    expect(migrated.latest("/project/a", 60_000, "", "researcher")?.plan).toBe("post-migration");
    migrated.close();
  });

  it("namespaces snapshots per agent id", () => {
    cache.save("/project/a", makeContext("/project/a", "default agent"));
    cache.save("/project/a", makeContext("/project/a", "researcher memory"), "", "researcher");
    expect(cache.latest("/project/a", 60_000)?.plan).toBe("default agent");
    expect(cache.latest("/project/a", 60_000, "", "researcher")?.plan).toBe("researcher memory");
    expect(cache.latest("/project/a", 60_000, "", "writer")).toBeNull();
  });

  it("misses the cache when the config fingerprint changes", () => {
    cache.save("/project/a", makeContext("/project/a", "budget 50k"), "fp-v1");
    expect(cache.latest("/project/a", 60_000, "fp-v1")?.plan).toBe("budget 50k");
    // A config change → different fingerprint → cache miss.
    expect(cache.latest("/project/a", 60_000, "fp-v2")).toBeNull();
  });

  it("treats a corrupt row as a cache miss instead of throwing", async () => {
    const corruptPath = path.join(dir, "corrupt.db");
    const c = new SnapshotCache(corruptPath);
    c.save("/project/a", makeContext("/project/a"));
    c.close();
    const { default: Database } = await import("better-sqlite3");
    const raw = new Database(corruptPath);
    raw.prepare("UPDATE snapshots SET json = ?").run("{not valid json");
    raw.close();
    const reopened = new SnapshotCache(corruptPath);
    expect(reopened.latest("/project/a", 60_000)).toBeNull();
    reopened.close();
  });

  it("recent() returns newest-first summaries and skips corrupt rows", async () => {
    const corruptPath = path.join(dir, "corrupt-recent.db");
    const c = new SnapshotCache(corruptPath);
    const root = "/proj";
    c.save(root, makeContext(root, "one"));
    c.save(root, makeContext(root, "two"));
    c.save("/other", makeContext("/other"));
    c.close();

    // Corrupt the oldest row for root "/proj" by updating it to invalid JSON
    const { default: Database } = await import("better-sqlite3");
    const raw = new Database(corruptPath);
    raw
      .prepare(
        "UPDATE snapshots SET json = ? WHERE root = ? ORDER BY created_at ASC LIMIT 1"
      )
      .run("{not valid json", root);
    raw.close();

    // Reopen and verify recent() skips the corrupt row
    const reopened = new SnapshotCache(corruptPath);
    const rows = reopened.recent(root, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokensUsed).toBe(42);
    expect(reopened.recent(root, 1)).toHaveLength(1);
    expect(reopened.recent("/nowhere")).toEqual([]);
    reopened.close();
  });
});
