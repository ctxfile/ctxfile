import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { createSnapshotService } from "../src/engine/service.js";
import { createRuntime } from "../src/runtime.js";
import { SnapshotCache } from "../src/storage/cache.js";
import type { Connector } from "../src/connectors/types.js";
import type { BuildEvent } from "../src/engine/types.js";

describe("SnapshotService", () => {
  let dir: string;
  let cache: SnapshotCache;

  const stub: Connector = { name: "stub", isEnabled: () => true, snapshot: async () => ({ plan: "P" }) };

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cb-svc-"));
    cache = new SnapshotCache(path.join(dir, "cache.db"));
  });

  afterEach(() => {
    cache.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("rebuild() builds, caches, and streams events; latestCached() then returns it", async () => {
    const config = loadConfig({ root: dir });
    const svc = createSnapshotService(config, { cache, connectors: [stub], summarizer: null });
    expect(svc.latestCached()).toBeNull();
    const events: BuildEvent[] = [];
    const ctx = await svc.rebuild((e) => events.push(e));
    expect(ctx.plan).toBe("P");
    expect(events.at(-1)?.type).toBe("done");
    expect(svc.latestCached()?.plan).toBe("P");
    expect(svc.recentSnapshots()).toHaveLength(1);
  });

  it("getContext() serves from cache within maxAge and filters scope", async () => {
    const config = loadConfig({ root: dir });
    const svc = createSnapshotService(config, { cache, connectors: [stub], summarizer: null });
    await svc.rebuild();
    const planOnly = await svc.getContext("plan");
    expect(planOnly.plan).toBe("P");
    expect(planOnly.keyFiles).toEqual([]);
  });

  it("getCached() is null before any build, then serves a scope-filtered fresh hit without rebuilding", async () => {
    const config = loadConfig({ root: dir });
    const svc = createSnapshotService(config, { cache, connectors: [stub], summarizer: null });
    expect(svc.getCached("plan")).toBeNull();
    await svc.rebuild();
    const planOnly = svc.getCached("plan");
    expect(planOnly?.plan).toBe("P");
    expect(planOnly?.keyFiles).toEqual([]);
  });
});

describe("createRuntime", () => {
  it("honors overrides and defaults pro to inactive", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "cb-rt-"));
    try {
      const config = loadConfig({ root: dir });
      const rt = createRuntime(config, { cache: null, connectors: [], summarizer: null });
      expect(rt.proActive).toBe(false);
      expect(rt.cache).toBeNull();
      expect(rt.connectors).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
