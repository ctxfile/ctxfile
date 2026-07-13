import { request as httpRequest } from "node:http";
import type { Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, type ResolvedConfig } from "../src/config.js";
import type { SnapshotService } from "../src/engine/service.js";
import { filterScope } from "../src/engine/build.js";
import type { ContextObject } from "../src/engine/types.js";
import type { ProLicenseInfo, ProMemoryEntry, ProModule } from "../src/plugin.js";
import { generateToken } from "../src/ui/security.js";
import { createUiServer, listenOnAvailablePort } from "../src/ui/server.js";

function makeContext(root: string): ContextObject {
  return {
    meta: {
      name: "ctxfile",
      version: "0.0.0-test",
      generatedAt: new Date().toISOString(),
      root,
      tokenBudget: 50_000,
      tokensUsed: 42,
      connectors: [{ name: "stub", status: "ok", durationMs: 1 }],
    },
    plan: "P",
    keyFiles: [],
    gitState: null,
    notionPages: [],
    sessionSummary: null,
  };
}

/** Node's fetch typings return Promise<unknown> for res.json(); tests assert known shapes. */
async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

function stubService(ctx: ContextObject): SnapshotService {
  return {
    getContext: async (scope = "full") => filterScope(ctx, scope),
    getCached: (scope = "full") => filterScope(ctx, scope),
    rebuild: async (onEvent) => {
      onEvent?.({ type: "connector:start", name: "stub" });
      onEvent?.({ type: "connector:done", connector: { name: "stub", status: "ok", durationMs: 1 } });
      onEvent?.({ type: "tokens", tokensUsed: 42, tokenBudget: 50_000 });
      onEvent?.({ type: "done", generatedAt: ctx.meta.generatedAt });
      return ctx;
    },
    latestCached: () => ctx,
    recentSnapshots: () => [{ createdAt: Date.now(), tokensUsed: 42 }],
  };
}

let dir: string;
let home: string;
let config: ResolvedConfig;
let server: Server;
let port: number;
let token: string;

async function start(pro: ProModule | null = null, proActive = false): Promise<void> {
  token = generateToken();
  server = createUiServer({ config, service: stubService(makeContext(config.root)), pro, proActive, token, homedir: home });
  port = await listenOnAvailablePort(server, 0); // 0 → OS-assigned ephemeral port
}

const api = (p: string, init: RequestInit = {}) =>
  fetch(`http://127.0.0.1:${port}${p}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "cb-ui-"));
  home = mkdtempSync(path.join(os.tmpdir(), "cb-ui-home-"));
  config = loadConfig({ root: dir, env: { NOTION_TOKEN: "secret-notion-token-value" } });
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe("ui server", () => {
  it("rejects missing, empty, and wrong bearer tokens with 401", async () => {
    await start();
    for (const headers of [{}, { Authorization: "Bearer " }, { Authorization: "Bearer wrong" }]) {
      const res = await fetch(`http://127.0.0.1:${port}/api/internal/state`, { headers });
      expect(res.status).toBe(401);
      expect((await readJson<{ error: string }>(res)).error).toBe("unauthorized");
    }
  });

  it("rejects non-local Host headers with 403 (DNS rebinding)", async () => {
    await start();
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        { host: "127.0.0.1", port, path: "/api/internal/state", headers: { Host: "evil.example", Authorization: `Bearer ${token}` } },
        (res) => resolve(res.statusCode ?? 0)
      );
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(403);
  });

  it("GET /state returns masked config — never the notion token value", async () => {
    await start();
    const res = await api("/api/internal/state");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain("secret-notion-token-value");
    const state = JSON.parse(body);
    expect(state.root).toBe(config.root);
    expect(state.config.notion.configured).toBe(true);
    expect(state.license.features).toEqual({ sessions: false, memory: false, consult: false, voice: false });
    expect(state.license.licenseInfo).toBeNull();
    expect(state.latest.tokensUsed).toBe(42);
  });

  it("GET /context respects scope and rejects bad scope", async () => {
    await start();
    const plan = await readJson<ContextObject>(await api("/api/internal/context?scope=plan"));
    expect(plan.plan).toBe("P");
    expect(plan.keyFiles).toEqual([]);
    expect((await api("/api/internal/context?scope=bogus")).status).toBe(400);
  });

  it("license GET reflects pro absence; POST stores a valid key and rejects garbage", async () => {
    await start();
    const info = await readJson<{ installed: boolean; active: boolean }>(await api("/api/internal/license"));
    expect(info).toMatchObject({ installed: false, active: false });
    const payload = Buffer.from(
      JSON.stringify({ tier: "pro", features: ["memory"], expiresAt: "2999-01-01T00:00:00.000Z" })
    ).toString("base64url");
    const good = await api("/api/internal/license", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: `${payload}.sig` }),
    });
    expect(good.status).toBe(200);
    expect((await readJson<{ restartRequired: boolean }>(good)).restartRequired).toBe(true);
    const bad = await api("/api/internal/license", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "garbage" }),
    });
    expect(bad.status).toBe(400);
  });

  it("pro endpoints 403 without pro, and delegate when pro.ui is present and licensed", async () => {
    await start();
    const locked = await api("/api/internal/memory");
    expect(locked.status).toBe(403);
    expect(await readJson<{ feature: string; licensed: boolean }>(locked)).toMatchObject({
      feature: "memory",
      licensed: false,
    });
    await new Promise((resolve) => server.close(resolve));

    const pro: ProModule = {
      name: "test-pro",
      licenseStatus: () => null,
      ui: {
        features: () => ({ sessions: true, memory: true, consult: true, voice: false }),
        licenseInfo: () => ({ tier: "pro", expiresAt: "2999-01-01T00:00:00.000Z", customerId: "cust-1" }),
        listMemory: async () => [
          { id: "m1", agentId: "default", content: "hello", createdAt: "2026-07-10T00:00:00.000Z", provenance: "test" },
        ],
        forgetMemory: async (id: string) => id === "m1",
      },
    };
    await start(pro, true);
    const entries = await readJson<{ entries: ProMemoryEntry[] }>(await api("/api/internal/memory"));
    expect(entries.entries).toHaveLength(1);
    const forgotten = await readJson<{ forgotten: boolean }>(
      await api("/api/internal/memory/m1", { method: "DELETE" })
    );
    expect(forgotten.forgotten).toBe(true);
    const state = await readJson<{
      license: { features: { memory: boolean }; licenseInfo: ProLicenseInfo | null };
    }>(await api("/api/internal/state"));
    expect(state.license.features.memory).toBe(true);
    expect(state.license.licenseInfo).toEqual({
      tier: "pro",
      expiresAt: "2999-01-01T00:00:00.000Z",
      customerId: "cust-1",
    });
    const licenseRoute = await readJson<{ licenseInfo: ProLicenseInfo | null }>(
      await api("/api/internal/license")
    );
    expect(licenseRoute.licenseInfo).toEqual({
      tier: "pro",
      expiresAt: "2999-01-01T00:00:00.000Z",
      customerId: "cust-1",
    });

    const badPath = await api("/api/internal/memory/%zz", { method: "DELETE" });
    expect(badPath.status).toBe(400);
    expect((await readJson<{ error: string }>(badPath)).error).toBe("bad path");

    // ids are opaque and never contain "/" — reject even when %2F-encoded
    const slashId = await api("/api/internal/memory/a%2Fb", { method: "DELETE" });
    expect(slashId.status).toBe(400);
    expect((await readJson<{ error: string }>(slashId)).error).toBe("bad path");
  });
});

describe("snapshot + SSE", () => {
  // reuse dir/home/config/server/port/token/start/api from the enclosing file scope

  async function readSseUntilDone(response: Response): Promise<string[]> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const eventNames: string[] = [];
    while (!eventNames.includes("done") && !eventNames.includes("error")) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (const match of buffer.matchAll(/^event: (.+)$/gm)) eventNames.push(match[1] ?? "");
      buffer = buffer.slice(buffer.lastIndexOf("\n\n") + 2);
    }
    await reader.cancel();
    return eventNames;
  }

  it("streams connector events through /events when /snapshot is posted", async () => {
    await start();
    const sse = await api("/api/internal/events");
    expect(sse.status).toBe(200);
    expect(sse.headers.get("content-type")).toContain("text/event-stream");
    const post = await api("/api/internal/snapshot", { method: "POST" });
    expect(post.status).toBe(202);
    expect((await readJson<{ jobId: number }>(post)).jobId).toBeGreaterThan(0);
    const events = await readSseUntilDone(sse);
    expect(events).toContain("connector:start");
    expect(events).toContain("connector:done");
    expect(events).toContain("tokens");
    expect(events.at(-1)).toBe("done");
  });

  it("requires auth on the SSE endpoint", async () => {
    await start();
    const res = await fetch(`http://127.0.0.1:${port}/api/internal/events`);
    expect(res.status).toBe(401);
  });

  it("emits an error event when the build rejects", async () => {
    await start();
    // swap in a failing service
    await new Promise((resolve) => server.close(resolve));
    token = generateToken();
    const failing: SnapshotService = {
      getContext: async () => makeContext(config.root),
      rebuild: async () => {
        throw new Error("disk on fire");
      },
      getCached: () => null,
      latestCached: () => null,
      recentSnapshots: () => [],
    };
    server = createUiServer({ config, service: failing, pro: null, proActive: false, token, homedir: home });
    port = await listenOnAvailablePort(server, 0);
    const sse = await api("/api/internal/events");
    await api("/api/internal/snapshot", { method: "POST" });
    const events = await readSseUntilDone(sse);
    expect(events.at(-1)).toBe("error");
  });

  it("returns the same jobId with alreadyRunning=true for a concurrent POST", async () => {
    await new Promise((resolve) => server.close(resolve));
    token = generateToken();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const ctx = makeContext(config.root);
    const slow: SnapshotService = {
      getContext: async () => ctx,
      rebuild: async () => {
        await gate;
        return ctx;
      },
      getCached: () => null,
      latestCached: () => ctx,
      recentSnapshots: () => [],
    };
    server = createUiServer({ config, service: slow, pro: null, proActive: false, token, homedir: home });
    port = await listenOnAvailablePort(server, 0);
    const first = await readJson<{ jobId: number; alreadyRunning: boolean }>(
      await api("/api/internal/snapshot", { method: "POST" })
    );
    const second = await readJson<{ jobId: number; alreadyRunning: boolean }>(
      await api("/api/internal/snapshot", { method: "POST" })
    );
    expect(first.alreadyRunning).toBe(false);
    expect(second).toEqual({ jobId: first.jobId, alreadyRunning: true });
    release();
  });

  it("cold GET /context joins the in-flight rebuild instead of starting a second one", async () => {
    await new Promise((resolve) => server.close(resolve));
    token = generateToken();
    let rebuilds = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let signalStarted!: () => void;
    const rebuildStarted = new Promise<void>((r) => {
      signalStarted = r;
    });
    const ctx = makeContext(config.root);
    const counting: SnapshotService = {
      getContext: async () => ctx,
      rebuild: async () => {
        rebuilds += 1;
        signalStarted();
        await gate;
        return ctx;
      },
      getCached: () => null, // cold cache: /context must rebuild
      latestCached: () => null,
      recentSnapshots: () => [],
    };
    server = createUiServer({ config, service: counting, pro: null, proActive: false, token, homedir: home });
    port = await listenOnAvailablePort(server, 0);

    const contextPromise = api("/api/internal/context?scope=plan");
    await rebuildStarted; // /context has started the shared rebuild
    const post = await readJson<{ alreadyRunning: boolean }>(
      await api("/api/internal/snapshot", { method: "POST" })
    );
    expect(post.alreadyRunning).toBe(true);
    release();
    const contextRes = await contextPromise;
    expect(contextRes.status).toBe(200);
    const body = await readJson<ContextObject>(contextRes);
    expect(body.plan).toBe("P"); // scope filter applied to the freshly rebuilt context
    expect(body.keyFiles).toEqual([]);
    expect(rebuilds).toBe(1);
  });
});
