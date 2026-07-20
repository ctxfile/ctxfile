import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import type { Connector } from "../src/connectors/types.js";
import { createSnapshotService } from "../src/engine/service.js";
import { createRuntime } from "../src/runtime.js";
import { IngestStore } from "../src/storage/ingest-store.js";
import { SnapshotCache } from "../src/storage/cache.js";

describe("service hints", () => {
  let dir: string;
  let store: IngestStore;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cb-hints-"));
    store = new IngestStore(path.join(dir, "ingest.db"));
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function serviceWith(connector: Connector, ingest: IngestStore | null) {
    const config = loadConfig({ root: dir, env: {} });
    return createSnapshotService(config, { cache: null, connectors: [connector], summarizer: null, ingest });
  }

  function hintSpy(): { connector: Connector; seen: unknown[] } {
    const seen: unknown[] = [];
    return {
      seen,
      connector: {
        name: "spy",
        isEnabled: () => true,
        async snapshot({ hints }) {
          seen.push(hints);
          return {};
        },
      },
    };
  }

  it("passes title tokens of recent non-private threads and skips private ones", async () => {
    store.ingest(
      dir,
      {
        ctxfile_ingest_schema: "2",
        source: { harness: "claude-code" },
        session: {
          summary: "public work",
          thread: "Q3 Campaign Planning",
          key_decisions: [],
          files_touched: [],
          open_items: [],
        },
      },
      Date.now(),
      "ingest_context"
    );
    // A private thread's title tokens must never leak into hints.
    const secret = store.ingest(
      dir,
      {
        ctxfile_ingest_schema: "2",
        source: { harness: "claude-code" },
        session: {
          summary: "secret work",
          thread: "Confidential Merger Talks",
          key_decisions: [],
          files_touched: [],
          open_items: [],
        },
      },
      Date.now(),
      "ingest_context"
    );
    expect(secret.threadId).not.toBeNull();
    expect(store.setThreadPrivate(dir, secret.threadId as number, true)).toBe(true);

    const { connector, seen } = hintSpy();
    await serviceWith(connector, store).rebuild();
    expect(seen[0]).toMatchObject({ threadTitleTokens: expect.arrayContaining(["campaign", "planning"]) });
    const hints = seen[0] as { threadTitleTokens: string[] };
    expect(hints.threadTitleTokens).not.toEqual(expect.arrayContaining(["confidential", "merger"]));
  });

  it("passes undefined hints when the store is null or throws", async () => {
    const { connector, seen } = hintSpy();
    await serviceWith(connector, null).rebuild();
    const broken = { listThreads: () => { throw new Error("boom"); } } as unknown as IngestStore;
    await serviceWith(connector, broken).rebuild();
    expect(seen).toEqual([undefined, undefined]);
  });
});

describe("hints-fingerprint cache gating (Fix 1)", () => {
  function ingestThread(store: IngestStore, root: string, title: string): void {
    store.ingest(
      root,
      {
        ctxfile_ingest_schema: "2",
        source: { harness: "claude-code" },
        session: {
          summary: "work",
          thread: title,
          key_decisions: [],
          files_touched: [],
          open_items: [],
        },
      },
      Date.now(),
      "ingest_context"
    );
  }

  function setup(opts: { withVault: boolean }): {
    root: string;
    vaultDir: string;
    cache: SnapshotCache;
    ingestStore: IngestStore;
    service: ReturnType<typeof createSnapshotService>;
    calls: () => number;
    cleanup: () => void;
  } {
    const root = mkdtempSync(path.join(os.tmpdir(), "cb-hints-gate-"));
    const vaultDir = mkdtempSync(path.join(os.tmpdir(), "cb-hints-gate-vault-"));
    if (opts.withVault) {
      writeFileSync(path.join(root, ".ctxfile.json"), JSON.stringify({ vaults: [{ path: vaultDir, name: "v" }] }));
    }
    const config = loadConfig({ root, env: {} });
    const cache = new SnapshotCache(path.join(root, "cache.db"));
    const ingestStore = new IngestStore(path.join(root, "ingest.db"));
    let calls = 0;
    const connector: Connector = {
      name: "counter",
      isEnabled: () => true,
      async snapshot() {
        calls += 1;
        return {};
      },
    };
    const service = createSnapshotService(config, {
      cache,
      connectors: [connector],
      summarizer: null,
      ingest: ingestStore,
    });
    return {
      root,
      vaultDir,
      cache,
      ingestStore,
      service,
      calls: () => calls,
      cleanup: () => {
        cache.close();
        ingestStore.close();
        rmSync(root, { recursive: true, force: true });
        rmSync(vaultDir, { recursive: true, force: true });
      },
    };
  }

  it("(a) hits the cache across repeated getContext() calls when threads are unchanged", async () => {
    const t = setup({ withVault: true });
    try {
      await t.service.getContext();
      await t.service.getContext();
      expect(t.calls()).toBe(1);
    } finally {
      t.cleanup();
    }
  });

  it("(b) invalidates the cache when a new thread is ingested (vaults configured)", async () => {
    const t = setup({ withVault: true });
    try {
      await t.service.getContext();
      ingestThread(t.ingestStore, t.root, "Q3 Roadmap Review");
      await t.service.getContext();
      expect(t.calls()).toBe(2);
    } finally {
      t.cleanup();
    }
  });

  it("(c) does NOT invalidate on the same thread churn when no vaults are configured", async () => {
    const t = setup({ withVault: false });
    try {
      await t.service.getContext();
      ingestThread(t.ingestStore, t.root, "Q3 Roadmap Review");
      await t.service.getContext();
      expect(t.calls()).toBe(1);
    } finally {
      t.cleanup();
    }
  });

  it("(d) latestCached() returns the snapshot after thread churn instead of null", async () => {
    const t = setup({ withVault: true });
    try {
      await t.service.getContext();
      expect(t.service.latestCached()).not.toBeNull();
      ingestThread(t.ingestStore, t.root, "Q3 Roadmap Review");
      // Thread churn changed the hints (and thus the exact fingerprint) but
      // latestCached() must still resolve to the previously-cached snapshot
      // via prefix matching on the static-config portion.
      expect(t.service.latestCached()).not.toBeNull();
    } finally {
      t.cleanup();
    }
  });
});

describe("runtime vault registration", () => {
  it("registers one connector per configured vault", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "cb-rt-"));
    const vault = mkdtempSync(path.join(os.tmpdir(), "cb-rt-vault-"));
    writeFileSync(path.join(dir, ".ctxfile.json"), JSON.stringify({ vaults: [{ path: vault, name: "wk" }] }));
    const config = loadConfig({ root: dir, env: {} });
    const runtime = createRuntime(config, { cache: null, pro: null });
    expect(runtime.connectors.map((c) => c.name)).toContain("vault:wk");
    rmSync(dir, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  });
});
