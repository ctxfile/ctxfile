import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import type { SessionDigest } from "../src/engine/types.js";
import {
  formatIngestErrors,
  inferHarnessFromClientName,
  ingestInputSchema,
  ingestSessionId,
  ingestToSessionDigest,
  mergeIngestedSessions,
  resolveThread,
  scoreThreadMatch,
  type IngestInput,
  type ThreadSummary,
} from "../src/ingest.js";
import { createServer } from "../src/server.js";
import { IngestStore } from "../src/storage/ingest-store.js";

function validInput(overrides: Partial<IngestInput["session"]> = {}, harness = "codex"): IngestInput {
  return {
    ctxfile_ingest_schema: "1",
    source: { harness },
    session: {
      summary: "Implemented the retry queue and wired backoff.",
      key_decisions: ["exponential backoff, max 5 tries"],
      files_touched: ["src/queue.ts"],
      open_items: ["metrics for dropped jobs"],
      ...overrides,
    },
  } as IngestInput;
}

describe("ingest schema", () => {
  it("accepts a well-formed payload, defaulting the list fields", () => {
    const parsed = ingestInputSchema.safeParse({
      ctxfile_ingest_schema: "1",
      source: { harness: "custom:my-agent" },
      session: { summary: "did things" },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.session.key_decisions).toEqual([]);
      expect(parsed.data.session.files_touched).toEqual([]);
    }
  });

  it.each([
    [{ ...validInput(), ctxfile_ingest_schema: "3" }, "ctxfile_ingest_schema"],
    [{ ...validInput(), source: { harness: "ChatGPT Desktop" } }, "harness"],
    [validInput({ summary: "" }), "summary"],
    [validInput({ started_at: "yesterday-ish" }), "ISO 8601"],
    [{ ...validInput(), session: { ...validInput().session, extra_field: 1 } }, "extra_field"],
  ])("rejects invalid payloads with actionable errors", (payload, expectedFragment) => {
    const parsed = ingestInputSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const message = formatIngestErrors(parsed.error);
      expect(message).toContain("Fix these and call the tool again");
      expect(message.toLowerCase()).toContain(String(expectedFragment).toLowerCase().split(" ")[0]);
      expect(message).toContain("ctxfile.dev/docs/ingest");
    }
  });

  it("derives a stable content-hash id when the harness has none", () => {
    const a = ingestSessionId(validInput());
    const b = ingestSessionId(validInput());
    const c = ingestSessionId(validInput({ summary: "different summary" }));
    expect(a).toBe(b);
    expect(a).toMatch(/^sha-[0-9a-f]{16}$/);
    expect(c).not.toBe(a);
    expect(ingestSessionId(validInput({ session_id: "native-42" }))).toBe("native-42");
  });

  it("accepts schema v2 with thread, lineage, and a complete handoff package", () => {
    const parsed = ingestInputSchema.safeParse({
      ctxfile_ingest_schema: "2",
      source: { harness: "chatgpt" },
      session: {
        session_id: "gpt-7",
        summary: "Drafted the Q3 campaign brief.",
        thread: "Q3 campaign",
        continues_from: "gpt-6",
        handoff: true,
        state: "Brief drafted; social copy not started.",
        key_decisions: ["launch Sep 3 because the venue is free"],
        open_items: ["draft social copy"],
        gotchas: ["legal must approve the tagline first"],
        artifacts: [{ ref: "brief.md", role: "the campaign brief being drafted" }],
        suggested_first_prompt: "Continue the Q3 campaign: draft the social copy per the brief.",
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.session.thread).toBe("Q3 campaign");
      expect(parsed.data.session.handoff).toBe(true);
    }
  });

  it("rejects an incomplete handoff naming every missing section", () => {
    const parsed = ingestInputSchema.safeParse({
      ctxfile_ingest_schema: "2",
      source: { harness: "claude" },
      session: { summary: "handing this off", handoff: true },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const message = formatIngestErrors(parsed.error);
      for (const section of ["state", "key_decisions", "open_items", "gotchas", "artifacts", "suggested_first_prompt"]) {
        expect(message).toContain(section);
      }
      expect(message).toContain("required for a handoff");
    }
  });
});

describe("thread resolution", () => {
  const thread = (id: number, title: string, lastActiveAt: string, tags: string[] = []): ThreadSummary => ({
    id,
    title,
    status: "active",
    tags,
    private: false,
    createdAt: lastActiveAt,
    lastActiveAt,
    sessionCount: 1,
    lastHarness: null,
  });

  it("scores exact, containment, tag, and token-overlap matches in that order", () => {
    expect(scoreThreadMatch("Q3 Campaign", thread(1, "q3 campaign", ""))).toBe(1);
    expect(scoreThreadMatch("q3", thread(1, "Q3 campaign", ""))).toBeCloseTo(0.85);
    expect(scoreThreadMatch("marketing", thread(1, "Q3 campaign", "", ["marketing"]))).toBeCloseTo(0.8);
    expect(scoreThreadMatch("campaign planning", thread(1, "Q3 campaign", ""))).toBeGreaterThan(0.45);
    expect(scoreThreadMatch("billing bug", thread(1, "Q3 campaign", ""))).toBe(0);
  });

  it("resolves a named thread and reports unnamed defaults as assumed", () => {
    const threads = [thread(1, "Q3 campaign", "2026-07-10T10:00:00.000Z"), thread(2, "Billing bug", "2026-07-10T12:00:00.000Z")];
    const named = resolveThread("q3", threads);
    expect(named).toMatchObject({ kind: "resolved", assumed: false });
    if (named.kind === "resolved") expect(named.thread.title).toBe("Q3 campaign");
    const unnamed = resolveThread(undefined, threads);
    expect(unnamed).toMatchObject({ kind: "resolved", assumed: true });
    if (unnamed.kind === "resolved") expect(unnamed.thread.title).toBe("Billing bug");
  });

  it("returns a shortlist for genuine ambiguity and none for no match", () => {
    const threads = [thread(1, "release page copy", "2026-07-01T00:00:00.000Z"), thread(2, "release page QA", "2026-07-02T00:00:00.000Z")];
    const ambiguous = resolveThread("release page", threads);
    expect(ambiguous.kind).toBe("ambiguous");
    if (ambiguous.kind === "ambiguous") expect(ambiguous.candidates).toHaveLength(2);
    expect(resolveThread("payments outage", threads)).toEqual({ kind: "none" });
    expect(resolveThread("anything", [])).toEqual({ kind: "none" });
  });
});

describe("harness inference from client names", () => {
  it("maps known client surfaces and falls back to custom:<name>", () => {
    expect(inferHarnessFromClientName("Cursor")).toBe("cursor");
    expect(inferHarnessFromClientName("Claude Desktop")).toBe("claude");
    expect(inferHarnessFromClientName("claude-code")).toBe("claude-code");
    expect(inferHarnessFromClientName("ChatGPT Connector")).toBe("chatgpt");
    expect(inferHarnessFromClientName("My Fancy Agent v2")).toBe("custom:my-fancy-agent-v2");
    expect(inferHarnessFromClientName(undefined)).toBe("custom:unknown-client");
    expect(inferHarnessFromClientName("!!!")).toBe("custom:unknown-client");
  });
});

describe("IngestStore", () => {
  let dir: string;
  let store: IngestStore;
  const root = "/proj/demo";

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cb-ingest-"));
    store = new IngestStore(path.join(dir, "ingest.db"));
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates, then updates with history and a bumped revision on re-ingest", () => {
    const first = store.ingest(root, validInput({ session_id: "s1" }), 1_000);
    expect(first).toMatchObject({ action: "created", revision: 1, sessionId: "s1" });

    const second = store.ingest(root, validInput({ session_id: "s1", summary: "Now with metrics." }), 2_000);
    expect(second).toMatchObject({ action: "updated", revision: 2, id: first.id });

    const records = store.list(root);
    expect(records).toHaveLength(1);
    expect(records[0]?.summary).toBe("Now with metrics.");
    expect(records[0]?.revision).toBe(2);
    expect(records[0]?.reportedBy).toBe("agent");
  });

  it("redacts secrets at write time", () => {
    store.ingest(root, validInput({ summary: "used sk-ABCDEFGHIJKLMNOP1234 to call the API" }));
    const record = store.list(root)[0];
    expect(record?.summary).toContain("[REDACTED:api-key]");
    expect(record?.summary).not.toContain("sk-ABCDEFGHIJKLMNOP1234");
  });

  it("scopes records per root and removes by id", () => {
    const mine = store.ingest(root, validInput({ session_id: "mine" }));
    store.ingest("/other/project", validInput({ session_id: "theirs" }));
    expect(store.list(root)).toHaveLength(1);
    expect(store.remove(root, mine.id)).toBe(true);
    expect(store.remove(root, mine.id)).toBe(false);
    expect(store.list(root)).toEqual([]);
    expect(store.list("/other/project")).toHaveLength(1);
  });

  it("attaches threads by title (case-insensitive), inherits via continues_from, keeps thread on re-ingest", () => {
    const first = store.ingest(root, validInput({ session_id: "a1", thread: "Instrument UI" }), 1_000);
    expect(first.threadTitle).toBe("Instrument UI");
    expect(first.threadId).not.toBeNull();

    // Lineage: a continuation names no thread but inherits the predecessor's.
    const second = store.ingest(root, validInput({ session_id: "a2", continues_from: "a1" }, "claude"), 2_000);
    expect(second.threadId).toBe(first.threadId);

    // A titleless re-ingest must not detach the session from its thread.
    const update = store.ingest(root, validInput({ session_id: "a1", summary: "Now with retries." }), 3_000);
    expect(update.threadId).toBe(first.threadId);

    // Same title, different case: same thread.
    const third = store.ingest(root, validInput({ session_id: "a3", thread: "instrument ui" }), 4_000);
    expect(third.threadId).toBe(first.threadId);

    const threads = store.listThreads(root);
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ title: "Instrument UI", sessionCount: 3, lastHarness: "codex" });
    expect(threads[0]?.lastActiveAt).toBe(new Date(4_000).toISOString());

    const sessions = store.threadSessions(root, first.threadId as number);
    expect(sessions.map((s) => s.sessionId)).toEqual(["a2", "a1", "a3"]);
  });

  it("stores the handoff package fields, redacted, with the door recorded", () => {
    const input = ingestInputSchema.parse({
      ctxfile_ingest_schema: "2",
      source: { harness: "chatgpt" },
      session: {
        session_id: "h1",
        summary: "Handing the campaign to the design agent.",
        thread: "Handoff demo",
        handoff: true,
        state: "Brief done; assets not started.",
        key_decisions: ["orange accent because the venue lighting is warm"],
        open_items: ["produce the hero asset"],
        gotchas: ["the API key sk-ABCDEFGHIJKLMNOP1234 is rate limited"],
        artifacts: [{ ref: "brief.md", role: "campaign brief" }],
        suggested_first_prompt: "Read the brief, then produce the hero asset.",
      },
    });
    store.ingest(root, input, 5_000, "save_session");
    const record = store.list(root)[0];
    expect(record).toMatchObject({ handoff: true, door: "save_session", threadTitle: "Handoff demo" });
    expect(record?.artifacts).toEqual([{ ref: "brief.md", role: "campaign brief" }]);
    expect(record?.gotchas[0]).toContain("[REDACTED:api-key]");
    expect(record?.suggestedFirstPrompt).toContain("hero asset");
    const digest = ingestToSessionDigest(record as NonNullable<typeof record>);
    expect(digest.digest).toContain("HANDOFF PACKAGE");
    expect(digest.digest).toContain("via save_session");
    expect(digest.digest).toContain("Thread: Handoff demo");
    expect(digest.digest).toContain("Suggested first prompt:");
  });
});

describe("merge into sessions", () => {
  const parserSession: SessionDigest = {
    source: "claude-code",
    sessionId: "shared-id",
    startedAt: null,
    lastActiveAt: null,
    turnCount: 12,
    digest: "parser digest",
  };

  function record(sessionId: string) {
    const store = new IngestStore(path.join(mkdtempSync(path.join(os.tmpdir(), "cb-mrg-")), "i.db"));
    store.ingest("/r", validInput({ session_id: sessionId }));
    const [r] = store.list("/r");
    store.close();
    return r!;
  }

  it("labels agent-reported sessions and lets the parser win on id collisions", () => {
    const merged = mergeIngestedSessions([parserSession], [record("shared-id"), record("unique-id")]);
    expect(merged).toHaveLength(2);
    expect(merged?.[0]).toBe(parserSession);
    const ingested = merged?.[1];
    expect(ingested?.sessionId).toBe("unique-id");
    expect(ingested?.source).toBe("codex");
    expect(ingested?.digest).toContain("agent-reported via ingest_context");
    expect(ingested?.digest).toContain("Key decisions:");
  });

  it("returns parser sessions untouched when nothing was ingested", () => {
    expect(mergeIngestedSessions([parserSession], [])).toEqual([parserSession]);
    expect(mergeIngestedSessions(undefined, [])).toBeUndefined();
  });

  it("renders a full digest from an ingest record", () => {
    const digest = ingestToSessionDigest(record("x"));
    expect(digest.turnCount).toBe(0);
    expect(digest.digest).toContain("retry queue");
    expect(digest.digest).toContain("Files touched: src/queue.ts");
    expect(digest.digest).toContain("Open items:");
  });
});

describe("ingest_context MCP tool", () => {
  let dir: string;
  let client: Client;
  let store: IngestStore;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cb-ingest-srv-"));
    writeFileSync(path.join(dir, "README.md"), "# Fixture");
    execFileSync("git", ["init", "-b", "main"], { cwd: dir, stdio: "pipe" });

    const config = loadConfig({ root: dir, env: {} });
    store = new IngestStore(path.join(dir, "ingest.db"));
    const server = createServer(config, { cache: null, ingest: store });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(clientTransport);
  });

  afterAll(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("is listed alongside get_context", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("ingest_context");
  });

  it("stores a valid digest and reports the identity back", async () => {
    const result = await client.callTool({
      name: "ingest_context",
      arguments: {
        ctxfile_ingest_schema: "1",
        source: { harness: "opencode" },
        session: { session_id: "oc-1", summary: "Refactored the config loader." },
      },
    });
    expect(result.isError ?? false).toBe(false);
    const body = JSON.parse((result.content as { text: string }[])[0]!.text) as Record<string, unknown>;
    expect(body).toMatchObject({ stored: true, session_id: "oc-1", revision: 1, action: "created" });
    expect(store.list(dir)).toHaveLength(1);
  });

  it("returns an actionable error for a bad harness name", async () => {
    const result = await client.callTool({
      name: "ingest_context",
      arguments: {
        ctxfile_ingest_schema: "1",
        source: { harness: "Not A Harness" },
        session: { summary: "x" },
      },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as { text: string }[])[0]!.text;
    expect(text).toContain("source.harness");
    expect(text).toContain("custom:<name>");
  });

  it("save_session stores with the client-inferred harness and starts a thread", async () => {
    const result = await client.callTool({
      name: "save_session",
      arguments: {
        summary: "Wired the HTTP door and the session map.",
        thread: "HTTP door",
        key_decisions: ["per-session McpServer over a shared runtime"],
        open_items: ["document the serve command"],
      },
    });
    expect(result.isError ?? false).toBe(false);
    expect(result.structuredContent).toMatchObject({ stored: true, thread: "HTTP door", action: "created" });
    const record = store.list(dir)[0];
    expect(record?.harness).toBe("custom:test-client");
    expect(record?.door).toBe("save_session");
    expect(record?.threadTitle).toBe("HTTP door");
  });

  it("save_session rejects an incomplete handoff with the actionable format", async () => {
    const result = await client.callTool({
      name: "save_session",
      arguments: { summary: "handing off now", handoff: true },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as { text: string }[])[0]!.text;
    expect(text).toContain("save_session rejected the payload");
    expect(text).toContain("suggested_first_prompt");
    expect(text).toContain("gotchas");
  });

  it("continue_thread resumes a fuzzy-named thread with provenance labels", async () => {
    const result = await client.callTool({ name: "continue_thread", arguments: { thread: "http" } });
    expect(result.isError ?? false).toBe(false);
    const text = (result.content as { text: string }[])[0]!.text;
    expect(text).toContain('Resuming "HTTP door"');
    expect(text).toContain("agent-reported via save_session");
    expect(text).toContain("Open items (latest):");
    expect(text).toContain("untrusted");
    expect(result.structuredContent).toMatchObject({ status: "resumed", assumed: false });
  });

  it("continue_thread with no name assumes the most recent thread and says so", async () => {
    const result = await client.callTool({ name: "continue_thread", arguments: {} });
    expect(result.isError ?? false).toBe(false);
    const text = (result.content as { text: string }[])[0]!.text;
    expect(text).toContain("assumed: most recently active");
    expect(result.structuredContent).toMatchObject({ status: "resumed", assumed: true });
  });

  it("continue_thread returns a shortlist when several threads match", async () => {
    await client.callTool({
      name: "ingest_context",
      arguments: {
        ctxfile_ingest_schema: "2",
        source: { harness: "claude" },
        session: { session_id: "d1", summary: "Wrote the HTTP docs page.", thread: "HTTP docs" },
      },
    });
    const result = await client.callTool({ name: "continue_thread", arguments: { thread: "http" } });
    expect(result.isError ?? false).toBe(false);
    expect((result.structuredContent as { status: string }).status).toBe("ambiguous");
    const text = (result.content as { text: string }[])[0]!.text;
    expect(text).toContain("Ask the user which one");
    expect(text).toContain("HTTP door");
    expect(text).toContain("HTTP docs");
  });

  it("list_threads lists titles with counts and a resume hint", async () => {
    const result = await client.callTool({ name: "list_threads", arguments: {} });
    expect(result.isError ?? false).toBe(false);
    const text = (result.content as { text: string }[])[0]!.text;
    expect(text).toContain('"HTTP door"');
    expect(text).toContain('"HTTP docs"');
    expect(text).toContain("continue_thread");
    const structured = result.structuredContent as { threads: { title: string }[] };
    expect(structured.threads.length).toBeGreaterThanOrEqual(2);
  });
});
