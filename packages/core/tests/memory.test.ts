import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseMemoryArgs } from "../src/cli-memory.js";
import { loadConfig } from "../src/config.js";
import { createSnapshotService } from "../src/engine/service.js";
import { filterScope } from "../src/engine/build.js";
import type { ContextObject } from "../src/engine/types.js";
import type { SnapshotService } from "../src/engine/service.js";
import {
  buildContextMemory,
  describeMemoryImport,
  extractJsonPayload,
  formatMemoryErrors,
  GLOBAL_MEMORY_ROOT,
  memoryId,
  memoryImportPrompt,
  memoryInputSchema,
  renderMemoryMarkdown,
  withMemoryDefaults,
  type MemoryInput,
  type MemoryRecord,
} from "../src/memory.js";
import { createServer } from "../src/server.js";
import { IngestStore } from "../src/storage/ingest-store.js";
import { buildVaultView, parseSyncPayload } from "../src/sync/payload.js";
import { generateToken } from "../src/ui/security.js";
import { createUiServer, listenOnAvailablePort } from "../src/ui/server.js";

function memInput(overrides: Partial<MemoryInput> = {}): MemoryInput {
  return {
    ctxfile_memory_schema: "1",
    source: { harness: "grok" },
    scope: "global",
    complete: true,
    entries: [
      { category: "instruction", text: "Never add Claude attribution to commits", verbatim: true, origin: "stored", date: "2026-01-05" },
      { category: "preference", text: "Prefers concise, critical feedback", verbatim: false, origin: "inferred", date: null },
    ],
    ...overrides,
  } as MemoryInput;
}

function record(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: 1,
    root: GLOBAL_MEMORY_ROOT,
    scope: "global",
    memoryId: "mem-1",
    category: "preference",
    text: "likes tea",
    verbatim: false,
    origin: "inferred",
    date: null,
    project: null,
    status: "active",
    sources: ["grok"],
    seenCount: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("memory schema", () => {
  it("accepts a well-formed export and applies defaults", () => {
    const parsed = memoryInputSchema.safeParse({
      ctxfile_memory_schema: "1",
      source: { harness: "chatgpt" },
      scope: "global",
      complete: true,
      entries: [{ category: "career", text: "Founder of ctxfile" }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.entries[0]).toMatchObject({ verbatim: false, origin: "inferred", date: null });
    }
  });

  it.each([
    [{ ...memInput(), ctxfile_memory_schema: "2" }, "ctxfile_memory_schema"],
    [{ ...memInput(), scope: "team" }, "scope"],
    [{ ...memInput(), entries: [] }, "at least one"],
    [{ ...memInput(), entries: [{ category: "mood", text: "x" }] }, "category"],
    [{ ...memInput(), entries: [{ category: "fact", text: "x", date: "last spring" }] }, "YYYY-MM-DD"],
    [{ ...memInput(), entries: [{ category: "fact", text: "x", date: "2026-02-31x" }] }, "YYYY-MM-DD"],
    [{ ...memInput(), entries: [{ category: "fact", text: "   " }] }, "text is required"],
    [{ ...memInput(), entries: [{ category: "fact", text: "x", extra: 1 }] }, "extra"],
    [{ ...memInput(), scope: "project", entries: [{ category: "identity", text: "Lives in Austin" }] }, "global-only"],
    [{ ...memInput(), entries: [{ category: "fact", text: "x", project: "ctxfile" }] }, 'category "project"'],
    [{ ...memInput(), part: { index: 3, total: 2 } }, "part.index"],
    [{ ...memInput(), entries: Array.from({ length: 101 }, (_, i) => ({ category: "fact", text: `f${i}` })) }, "at most 100"],
  ])("rejects invalid exports with actionable errors (%#)", (payload, fragment) => {
    const parsed = memoryInputSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(formatMemoryErrors(parsed.error)).toContain(fragment);
  });

  it("requires complete so a partial export can never pass as whole", () => {
    const { complete: _complete, ...rest } = memInput();
    expect(memoryInputSchema.safeParse(rest).success).toBe(false);
  });

  it("fills the schema version, completeness, and an inferred harness", () => {
    const filled = withMemoryDefaults({ scope: "global", entries: [] }, "Grok connectors-manager");
    expect(filled).toMatchObject({ ctxfile_memory_schema: "1", complete: true });
    expect((filled.source as { harness: string }).harness).toMatch(/^(grok|custom:)/);
    const kept = withMemoryDefaults({ source: { harness: "chatgpt" }, complete: false }, "claude-code");
    expect(kept).toMatchObject({ complete: false, source: { harness: "chatgpt" } });
  });
});

describe("memory identity", () => {
  it("is stable across case, spacing, and trailing punctuation", () => {
    expect(memoryId("global", "preference", "Likes  tea.")).toBe(memoryId("global", "preference", "likes tea"));
  });
  it("differs by scope and category", () => {
    expect(memoryId("global", "fact", "x")).not.toBe(memoryId("project", "fact", "x"));
    expect(memoryId("global", "fact", "x")).not.toBe(memoryId("global", "preference", "x"));
  });
});

describe("memory prompts", () => {
  it("builds the MCP variant around ingest_memory with the category guide", () => {
    const prompt = memoryImportPrompt({ scope: "global", mode: "mcp" });
    expect(prompt).toContain("ingest_memory");
    expect(prompt).toContain("verbatim: true");
    expect(prompt).toContain("Never guess a date");
    expect(prompt).toContain('"scope": "global"');
    expect(prompt).toContain("identity:");
  });
  it("builds the paste variant around one json block and names the project", () => {
    const prompt = memoryImportPrompt({ scope: "project", mode: "paste", projectName: "ctxfile", harness: "chatgpt" });
    expect(prompt).toContain("```json");
    expect(prompt).toContain("ctxfile memory import");
    expect(prompt).toContain('"ctxfile"');
    expect(prompt).toContain('"harness": "chatgpt"');
    expect(prompt).not.toContain("identity:");
  });
});

describe("extractJsonPayload", () => {
  it("parses raw JSON", () => {
    expect(extractJsonPayload('{"a":1}')).toEqual({ a: 1 });
  });
  it("finds a fenced json block inside a chat reply", () => {
    expect(extractJsonPayload('Here you go:\n```json\n{"a":2}\n```\nThis is the complete set.')).toEqual({ a: 2 });
  });
  it("falls back to the outermost object when prose surrounds bare JSON", () => {
    expect(extractJsonPayload('Sure! {"a":3} Done.')).toEqual({ a: 3 });
  });
  it("throws a readable error on empty or non-JSON input", () => {
    expect(() => extractJsonPayload("   ")).toThrow(/empty/);
    expect(() => extractJsonPayload("no json here")).toThrow(/could not find valid JSON/);
  });
});

describe("buildContextMemory", () => {
  it("returns undefined when there is nothing to say", () => {
    expect(buildContextMemory([], [], 0)).toBeUndefined();
  });
  it("still reports pending count with no active entries", () => {
    expect(buildContextMemory([], [], 2)).toMatchObject({ pending: 2, global: [], project: [] });
  });
  it("orders by category, excludes pending, and marks approved instructions", () => {
    const memory = buildContextMemory(
      [
        record({ id: 1, category: "career", text: "founder" }),
        record({ id: 2, category: "instruction", text: "never push", verbatim: true }),
        record({ id: 3, category: "identity", text: "secret", status: "pending" }),
      ],
      [record({ id: 4, scope: "project", category: "gotcha", text: "flaky test" })],
      1
    );
    expect(memory?.global.map((m) => m.text)).toEqual(["never push", "founder"]);
    expect(memory?.global[0]).toMatchObject({ approved: true, verbatim: true });
    expect(memory?.global[1]?.approved).toBeUndefined();
    expect(memory?.project.map((m) => m.text)).toEqual(["flaky test"]);
    expect(memory?.note).toContain("untrusted");
  });
  it("enforces the token budget, filling project first, and counts what it omitted", () => {
    const long = "x".repeat(400);
    const memory = buildContextMemory(
      [record({ id: 1, text: `g ${long}` }), record({ id: 2, text: `g2 ${long}` })],
      [record({ id: 3, scope: "project", text: `p ${long}` })],
      0,
      250
    );
    expect(memory?.project).toHaveLength(1);
    expect(memory?.global).toHaveLength(0);
    expect(memory?.omitted).toBe(2);
  });
});

describe("renderMemoryMarkdown", () => {
  it("renders category headers with dated lines, oldest first, unknown last", () => {
    const md = renderMemoryMarkdown([
      {
        title: "Global",
        records: [
          record({ id: 1, category: "instruction", text: "b rule", date: null }),
          record({ id: 2, category: "instruction", text: "a rule", date: "2026-01-02" }),
          record({ id: 3, category: "career", text: "founder", date: "2025-06-01" }),
        ],
      },
      { title: "Project: x", records: [] },
    ]);
    expect(md).toContain("## Global");
    expect(md).not.toContain("## Project: x");
    expect(md.indexOf("### Instructions")).toBeLessThan(md.indexOf("### Career"));
    expect(md.indexOf("[2026-01-02] - a rule")).toBeLessThan(md.indexOf("[unknown] - b rule"));
  });
  it("says so when there is nothing to export", () => {
    expect(renderMemoryMarkdown([{ title: "Global", records: [] }])).toContain("No approved or active memories");
  });
});

describe("describeMemoryImport", () => {
  it("asks for the next part when incomplete", () => {
    const text = describeMemoryImport({ created: 2, merged: 1, pending: 1, skippedRejected: 1 }, "global", false, { index: 1, total: 3 });
    expect(text).toContain("Stored 2 new global memories, merged 1 already known, skipped 1 the user previously rejected.");
    expect(text).toContain("awaits the user's approval");
    expect(text).toContain("part 2 of 3");
  });
  it("speaks to a human on the CLI, never with agent instructions", () => {
    const done = describeMemoryImport({ created: 1, merged: 0, pending: 0, skippedRejected: 0 }, "global", true, undefined, "human");
    expect(done).not.toContain("Tell the user");
    const partial = describeMemoryImport({ created: 1, merged: 0, pending: 0, skippedRejected: 0 }, "global", false, undefined, "human");
    expect(partial).toContain("ask it for the next batch");
  });
  it("closes out when complete", () => {
    expect(describeMemoryImport({ created: 1, merged: 0, pending: 0, skippedRejected: 0 }, "project", true, undefined)).toContain(
      "Export complete"
    );
  });
});

describe("MemoryStore", () => {
  let dir: string;
  let store: IngestStore;
  const root = "/projects/app";

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cb-mem-"));
    store = new IngestStore(path.join(dir, "ingest.db"));
  });
  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("stages instructions and identity as pending, everything else active", () => {
    const result = store.memory.import(
      root,
      memInput({ entries: [...memInput().entries, { category: "identity", text: "Based in Nairobi", verbatim: false, origin: "stored", date: null }] })
    );
    expect(result).toEqual({ created: 3, merged: 0, pending: 2, skippedRejected: 0 });
    const all = store.memory.list(root);
    expect(all.filter((m) => m.status === "pending").map((m) => m.category).sort()).toEqual(["identity", "instruction"]);
    expect(all.every((m) => m.scope === "global" && m.root === GLOBAL_MEMORY_ROOT)).toBe(true);
    expect(store.memory.pendingCount(root)).toBe(2);
  });

  it("merges duplicates across assistants instead of storing twice", () => {
    store.memory.import(root, memInput());
    const again = store.memory.import(
      root,
      memInput({
        source: { harness: "chatgpt" },
        entries: [{ category: "preference", text: "prefers concise, critical feedback.", verbatim: true, origin: "stored", date: "2026-03-01" }],
      })
    );
    expect(again).toMatchObject({ created: 0, merged: 1 });
    const pref = store.memory.list(root).find((m) => m.category === "preference");
    expect(pref).toMatchObject({ sources: ["grok", "chatgpt"], seenCount: 2, origin: "stored", verbatim: true, date: "2026-03-01" });
  });

  it("keeps a merged entry's status: an approved instruction stays approved, a pending one stays pending", () => {
    store.memory.import(root, memInput());
    const instruction = store.memory.list(root).find((m) => m.category === "instruction")!;
    expect(store.memory.approve(root, instruction.id)).toBe(true);
    store.memory.import(root, memInput({ source: { harness: "claude" } }));
    expect(store.memory.list(root).find((m) => m.id === instruction.id)?.status).toBe("active");
  });

  it("never resurrects a rejected memory on re-import", () => {
    store.memory.import(root, memInput());
    const pref = store.memory.list(root).find((m) => m.category === "preference")!;
    expect(store.memory.reject(root, pref.id)).toBe(true);
    const again = store.memory.import(root, memInput());
    expect(again.skippedRejected).toBe(1);
    expect(store.memory.list(root).some((m) => m.id === pref.id)).toBe(false);
  });

  it("separates project scopes by root while sharing global", () => {
    store.memory.import(root, memInput({ scope: "project", entries: [{ category: "gotcha", text: "tests need Node 26 rebuild", verbatim: false, origin: "inferred", date: null }] }));
    store.memory.import(root, memInput({ entries: [{ category: "career", text: "Founder", verbatim: false, origin: "stored", date: null }] }));
    expect(store.memory.list(root, { scope: "project" })).toHaveLength(1);
    expect(store.memory.list("/projects/other", { scope: "project" })).toHaveLength(0);
    expect(store.memory.list("/projects/other", { scope: "global" })).toHaveLength(1);
  });

  it("approves and rejects only what is visible from this root", () => {
    store.memory.import("/projects/other", memInput({ scope: "project", entries: [{ category: "instruction", text: "use pnpm", verbatim: true, origin: "stored", date: null }] }));
    const other = store.memory.list("/projects/other", { scope: "project" })[0]!;
    expect(store.memory.approve(root, other.id)).toBe(false);
    expect(store.memory.reject(root, other.id)).toBe(false);
    expect(store.memory.approve("/projects/other", other.id)).toBe(true);
    expect(store.memory.approve("/projects/other", other.id)).toBe(false);
  });

  it("approves every pending entry at once", () => {
    store.memory.import(root, memInput());
    expect(store.memory.approveAllPending(root)).toBe(1);
    expect(store.memory.pendingCount(root)).toBe(0);
  });

  it("redacts secrets before storing", () => {
    store.memory.import(root, memInput({ entries: [{ category: "fact", text: "token is ghp_abcdefghijklmnopqrstuvwxyz0123456789", verbatim: false, origin: "inferred", date: null }] }));
    expect(store.memory.list(root)[0]?.text).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
  });

  it("builds the context block from active entries only", () => {
    store.memory.import(root, memInput());
    const memory = store.memory.contextMemory(root);
    expect(memory?.pending).toBe(1);
    expect(memory?.global.map((m) => m.category)).toEqual(["preference"]);
  });

  it("turns session user_directives into pending project instructions", () => {
    const result = store.ingest(root, {
      ctxfile_ingest_schema: "2",
      source: { harness: "claude-code" },
      session: {
        summary: "Wired the cache",
        key_decisions: [],
        files_touched: [],
        open_items: [],
        user_directives: ["Always run lint before committing"],
      },
    });
    expect(result.directives).toMatchObject({ created: 1, pending: 1 });
    const [directive] = store.memory.list(root, { scope: "project" });
    expect(directive).toMatchObject({ category: "instruction", verbatim: true, origin: "stored", status: "pending", sources: ["claude-code"] });
  });

  it("round-trips through sync, routing global memory to the global store on any root", () => {
    store.memory.import(root, memInput());
    store.memory.import(root, memInput({ scope: "project", entries: [{ category: "decision", text: "SQLite over Postgres", verbatim: false, origin: "inferred", date: null }] }));
    const pref = store.memory.list(root).find((m) => m.category === "preference")!;
    store.memory.reject(root, pref.id);

    const entries = store.exportSyncEntries(root);
    const memoryEntries = entries.filter((e) => parseSyncPayload(e.payload)?.kind === "memory");
    expect(memoryEntries).toHaveLength(3);
    expect(memoryEntries.some((e) => e.deleted)).toBe(true);

    const otherDir = mkdtempSync(path.join(os.tmpdir(), "cb-mem-sync-"));
    const other = new IngestStore(path.join(otherDir, "ingest.db"));
    try {
      expect(other.importSyncEntries("/elsewhere/app", entries)).toBe(3);
      expect(other.memory.list("/any/project", { scope: "global" }).map((m) => m.category)).toEqual(["instruction"]);
      expect(other.memory.list("/elsewhere/app", { scope: "project" }).map((m) => m.text)).toEqual(["SQLite over Postgres"]);
      // Idempotent: the same entries again change nothing.
      expect(other.importSyncEntries("/elsewhere/app", entries)).toBe(0);
      // A rejected tombstone stays rejected on the receiving device too.
      expect(other.memory.import("/elsewhere/app", memInput()).skippedRejected).toBe(1);
    } finally {
      other.close();
      rmSync(otherDir, { recursive: true, force: true });
    }
  });

  it("feeds buildVaultView with live memories only", () => {
    store.memory.import(root, memInput());
    const pref = store.memory.list(root).find((m) => m.category === "preference")!;
    store.memory.reject(root, pref.id);
    const payloads = store
      .exportSyncEntries(root)
      .map((e) => parseSyncPayload(e.payload))
      .filter((p) => p !== null);
    const view = buildVaultView(payloads);
    expect(view.memories.map((m) => m.category)).toEqual(["instruction"]);
    expect(view.memories[0]?.scope).toBe("global");
  });
});

describe("snapshot service memory injection", () => {
  it("attaches memory on full scope at read time, and never on narrow scopes", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "cb-mem-svc-"));
    writeFileSync(path.join(dir, "README.md"), "# Fixture");
    const store = new IngestStore(path.join(dir, "ingest.db"));
    try {
      const config = loadConfig({ root: dir, env: {} });
      const service = createSnapshotService(config, { cache: null, connectors: [], summarizer: null, ingest: store });
      expect((await service.getContext("full")).memory).toBeUndefined();
      store.memory.import(config.root, memInput());
      const full = await service.getContext("full");
      expect(full.memory?.global.map((m) => m.category)).toEqual(["preference"]);
      expect(full.memory?.pending).toBe(1);
      expect((await service.getContext("plan")).memory).toBeUndefined();
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("ingest_memory tool and ctx-import-memory prompt", () => {
  let dir: string;
  let store: IngestStore;
  let client: Client;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cb-mem-srv-"));
    writeFileSync(path.join(dir, "README.md"), "# Fixture");
    const config = loadConfig({ root: dir, env: {} });
    store = new IngestStore(path.join(dir, "ingest.db"));
    const server = createServer(config, { cache: null, ingest: store });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "chatgpt", version: "0.0.0" });
    await client.connect(clientTransport);
  });
  afterEach(async () => {
    await client.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("stores a batch, infers the harness, and reports pending approvals", async () => {
    const result = await client.callTool({
      name: "ingest_memory",
      arguments: { scope: "global", entries: [{ category: "instruction", text: "No emojis", verbatim: true, origin: "stored" }] },
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ stored: true, created: 1, pending: 1, complete: true });
    expect((result.content as { text: string }[])[0]!.text).toContain("awaits the user's approval");
    expect(store.memory.list(dir)[0]?.sources).toEqual(["chatgpt"]);
  });

  it("asks for the next batch when complete is false", async () => {
    const result = await client.callTool({
      name: "ingest_memory",
      arguments: { scope: "global", complete: false, part: { index: 1, total: 2 }, entries: [{ category: "career", text: "Engineer" }] },
    });
    expect((result.content as { text: string }[])[0]!.text).toContain("part 2 of 2");
  });

  it("returns field-by-field errors the agent can fix", async () => {
    const result = await client.callTool({
      name: "ingest_memory",
      arguments: { scope: "project", entries: [{ category: "identity", text: "Lives in Austin" }] },
    });
    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0]!.text).toContain("entries.0.category");
  });

  it("serves the import prompt with the requested scope", async () => {
    const prompt = await client.getPrompt({ name: "ctx-import-memory", arguments: { scope: "project" } });
    const text = (prompt.messages[0]!.content as { text: string }).text;
    expect(text).toContain("ingest_memory");
    expect(text).toContain('"scope": "project"');
  });

  it("surfaces active memory in get_context and notes staged directives on save_session", async () => {
    await client.callTool({ name: "ingest_memory", arguments: { scope: "global", entries: [{ category: "preference", text: "Terse answers" }] } });
    const ctx = await client.callTool({ name: "get_context", arguments: {} });
    const parsed = JSON.parse((ctx.content as { text: string }[])[0]!.text) as ContextObject;
    expect(parsed.memory?.global[0]?.text).toBe("Terse answers");

    const saved = await client.callTool({
      name: "save_session",
      arguments: { summary: "did work", user_directives: ["Never force-push"] },
    });
    expect((saved.content as { text: string }[])[0]!.text).toContain("1 user directive staged");
  });
});

describe("ui memory routes", () => {
  let dir: string;
  let store: IngestStore;
  let server: Server;
  let port: number;
  let token: string;

  function stubService(ctx: ContextObject): SnapshotService {
    return {
      getContext: async (scope = "full") => filterScope(ctx, scope),
      getCached: (scope = "full") => filterScope(ctx, scope),
      rebuild: async () => ctx,
      latestCached: () => ctx,
      recentSnapshots: () => [],
    };
  }

  const api = (p: string, init: RequestInit = {}) =>
    fetch(`http://127.0.0.1:${port}${p}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });

  async function start(withStore: boolean): Promise<void> {
    const config = loadConfig({ root: dir, env: {} });
    const ctx: ContextObject = {
      meta: { name: "ctxfile", version: "t", generatedAt: "", root: dir, tokenBudget: 1, tokensUsed: 0, connectors: [] },
      plan: null,
      keyFiles: [],
      gitState: null,
      notionPages: [],
      sessionSummary: null,
    };
    token = generateToken();
    server = createUiServer({ config, service: stubService(ctx), pro: null, proActive: false, token, memory: withStore ? store.memory : null });
    port = await listenOnAvailablePort(server, 0);
  }

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cb-mem-ui-"));
    store = new IngestStore(path.join(dir, "ingest.db"));
  });
  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("requires the bearer token", async () => {
    await start(true);
    const res = await fetch(`http://127.0.0.1:${port}/api/internal/memories`);
    expect(res.status).toBe(401);
  });

  it("imports a pasted chat reply, lists, approves, and rejects", async () => {
    await start(true);
    const text = `Here is your export:\n\`\`\`json\n${JSON.stringify(memInput())}\n\`\`\`\nThis is the complete set.`;
    const imported = await api("/api/internal/memories/import", { method: "POST", body: JSON.stringify({ text }) });
    expect(imported.status).toBe(200);
    expect(await imported.json()).toMatchObject({ created: 2, pending: 1, complete: true, scope: "global" });

    const pending = (await (await api("/api/internal/memories?status=pending")).json()) as { entries: MemoryRecord[]; pending: number };
    expect(pending.pending).toBe(1);
    const id = pending.entries[0]!.id;
    expect(await (await api(`/api/internal/memories/${id}/approve`, { method: "POST" })).json()).toEqual({ approved: true });

    const all = (await (await api("/api/internal/memories?scope=global")).json()) as { entries: MemoryRecord[] };
    const pref = all.entries.find((e) => e.category === "preference")!;
    expect(await (await api(`/api/internal/memories/${pref.id}`, { method: "DELETE" })).json()).toEqual({ rejected: true });
    expect(((await (await api("/api/internal/memories")).json()) as { entries: MemoryRecord[] }).entries).toHaveLength(1);
  });

  it("approves all pending at once", async () => {
    await start(true);
    store.memory.import(dir, memInput());
    expect(await (await api("/api/internal/memories/approve-all", { method: "POST" })).json()).toEqual({ approved: 1 });
  });

  it("returns friendly errors with schema issues, never raw exceptions", async () => {
    await start(true);
    const bad = await api("/api/internal/memories/import", { method: "POST", body: JSON.stringify({ text: "not json" }) });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toContain("Paste the");
    const invalid = await api("/api/internal/memories/import", {
      method: "POST",
      body: JSON.stringify({ text: JSON.stringify({ scope: "global", entries: [{ category: "mood", text: "x" }] }) }),
    });
    const body = (await invalid.json()) as { issues: { path: string }[] };
    expect(body.issues[0]?.path).toBe("entries.0.category");
  });

  it("serves the prompt in both modes", async () => {
    await start(true);
    const mcp = (await (await api("/api/internal/memories/prompt?scope=project")).json()) as { prompt: string };
    expect(mcp.prompt).toContain("ingest_memory");
    const paste = (await (await api("/api/internal/memories/prompt?mode=paste")).json()) as { prompt: string };
    expect(paste.prompt).toContain("ctxfile memory import");
  });

  it("reports unavailable without a store, and 404s unknown memory routes", async () => {
    await start(false);
    expect(await (await api("/api/internal/memories")).json()).toEqual({ available: false, entries: [], pending: 0 });
    expect((await api("/api/internal/memories/1/approve", { method: "POST" })).status).toBe(503);
    await new Promise((resolve) => server.close(resolve));
    await start(true);
    expect((await api("/api/internal/memories/abc", { method: "DELETE" })).status).toBe(404);
  });
});

describe("memory CLI args", () => {
  it("parses flags and positionals", () => {
    expect(parseMemoryArgs(["12", "--scope", "project", "--pending", "--format", "json", "--harness", "grok"])).toMatchObject({
      positional: ["12"],
      scope: "project",
      pending: true,
      format: "json",
      harness: "grok",
    });
  });
  it.each([
    [["--scope", "team"], "--scope"],
    [["--format", "xml"], "--format"],
    [["--file"], "--file requires"],
    [["--bogus"], "unknown option"],
  ])("rejects bad flags (%#)", (argv, fragment) => {
    expect(() => parseMemoryArgs(argv)).toThrow(fragment);
  });
});
