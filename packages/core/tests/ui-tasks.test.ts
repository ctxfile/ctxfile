import { request as httpRequest, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadOrCreateApprovalKey, verifyEffectDecision, verifyTaskApproval } from "../src/approval-keys.js";
import { loadConfig, type ResolvedConfig } from "../src/config.js";
import { filterScope } from "../src/engine/build.js";
import type { SnapshotService } from "../src/engine/service.js";
import type { ContextObject } from "../src/engine/types.js";
import { IngestStore } from "../src/storage/ingest-store.js";
import { readTasksSwitch } from "../src/storage/task-store.js";
import { postTaskSchema, updateTaskSchema, type TaskActor, type TaskRecord } from "../src/tasks.js";
import { generateToken } from "../src/ui/security.js";
import { createUiServer, listenOnAvailablePort, type TaskListResponse } from "../src/ui/server.js";
import { isTrifecta, type TaskView } from "../src/ui/task-view.js";

const GROK: TaskActor = { kind: "agent", harness: "grok", door: "post_task", client: "connectors-manager", token: null };
const USER: TaskActor = { kind: "human", harness: null, door: "cli", client: null, token: null };
const T0 = Date.parse("2026-10-18T10:00:00Z");
const NOW = T0 + 60_000;

function stubService(root: string): SnapshotService {
  const ctx: ContextObject = {
    meta: { name: "ctxfile", version: "t", generatedAt: "", root, tokenBudget: 1, tokensUsed: 0, connectors: [] },
    plan: null,
    keyFiles: [],
    gitState: null,
    notionPages: [],
    sessionSummary: null,
  };
  return {
    getContext: async (scope = "full") => filterScope(ctx, scope),
    getCached: (scope = "full") => filterScope(ctx, scope),
    rebuild: async () => ctx,
    latestCached: () => ctx,
    recentSnapshots: () => [],
  };
}

function postInput(overrides: Record<string, unknown> = {}) {
  return postTaskSchema.parse({
    thread: "Q4 leads",
    title: "Email the 12 leads",
    instructions: "Draft a short intro email to each lead in leads.csv, then send them.",
    assignee: "chatgpt",
    capabilities: ["read:thread", "draft:content", "send:message"],
    ...overrides,
  });
}

let dir: string;
let config: ResolvedConfig;
let store: IngestStore;
let server: Server | null;
let port: number;
let token: string;

async function start(withStore = true): Promise<void> {
  token = generateToken();
  server = createUiServer({
    config,
    service: stubService(config.root),
    pro: null,
    proActive: false,
    token,
    ingest: withStore ? store : null,
    now: () => NOW,
  });
  port = await listenOnAvailablePort(server, 0);
}

async function stop(): Promise<void> {
  const current = server;
  server = null;
  if (current) await new Promise((resolve) => current.close(resolve));
}

const api = (p: string, init: RequestInit = {}) =>
  fetch(`http://127.0.0.1:${port}${p}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

const postJson = (p: string, body: unknown) => api(p, { method: "POST", body: JSON.stringify(body) });

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

function postTask(overrides: Record<string, unknown> = {}, actor: TaskActor = GROK): TaskRecord {
  const result = store.tasks.post(config.root, postInput(overrides), actor, { now: T0 });
  if (!result.ok) throw new Error(result.error);
  return result.task;
}

/** Claims the task as chatgpt and asks for one exact effect. */
function awaitEffect(task: TaskRecord, details = "To: ada@example.com\nSubject: Hi\n\nHello <b>Ada</b>"): TaskRecord {
  const ctx = { now: T0 + 1_000, harness: "chatgpt", sessionId: null, proposals: "ask" as const };
  const claimed = store.tasks.agentAction(config.root, updateTaskSchema.parse({ task_id: task.task_id, action: "claim" }), ctx);
  if (!claimed.ok) throw new Error(claimed.error);
  const asked = store.tasks.agentAction(
    config.root,
    updateTaskSchema.parse({
      task_id: task.task_id,
      action: "request_approval",
      effect: { capability: "send:message", summary: "Send the intro email to Ada", details },
    }),
    { ...ctx, now: T0 + 2_000 }
  );
  if (!asked.ok) throw new Error(asked.error);
  return asked.task;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "cb-ui-tasks-"));
  config = { ...loadConfig({ root: dir, env: {} }), cacheDir: path.join(dir, "cache") };
  store = new IngestStore(path.join(dir, "ingest.db"));
  server = null;
});

afterEach(async () => {
  await stop();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("ui task routes: access", () => {
  it("requires the bearer token on reads and writes", async () => {
    await start();
    const task = postTask();
    expect((await fetch(`http://127.0.0.1:${port}/api/internal/tasks`)).status).toBe(401);
    const write = await fetch(`http://127.0.0.1:${port}/api/internal/tasks/${task.task_id}/approve`, {
      method: "POST",
      headers: { Authorization: "Bearer wrong", "Content-Type": "application/json" },
      body: "{}",
    });
    expect(write.status).toBe(401);
    expect(store.tasks.get(config.root, task.task_id, NOW)?.approval).toBeNull();
    expect((await fetch(`http://127.0.0.1:${port}/api/internal/handoff-stats`)).status).toBe(401);
  });

  it("still enforces the Host check (DNS rebinding) on task routes", async () => {
    await start();
    const task = postTask();
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path: `/api/internal/tasks/${task.task_id}/approve`,
          headers: { Host: "evil.example", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        },
        (res) => resolve(res.statusCode ?? 0)
      );
      req.on("error", reject);
      req.end("{}");
    });
    expect(status).toBe(403);
    expect(store.tasks.get(config.root, task.task_id, NOW)?.approval).toBeNull();
  });

  it("answers 503 with a clear error on every task route when the store is off", async () => {
    await start(false);
    const checks: [string, RequestInit][] = [
      ["/api/internal/tasks", {}],
      ["/api/internal/tasks/t_0123456789abcdef0123/approve", { method: "POST", body: "{}" }],
      ["/api/internal/tasks/switch", { method: "POST", body: JSON.stringify({ off: true }) }],
      ["/api/internal/tasks/freeze", { method: "POST", body: JSON.stringify({ thread: "x", frozen: true }) }],
      ["/api/internal/handoff-stats", {}],
    ];
    for (const [p, init] of checks) {
      const res = await api(p, init);
      expect(res.status).toBe(503);
      expect((await readJson<{ error: string }>(res)).error).toMatch(/unavailable in this run \(the local store is off\)/);
    }
    expect(readTasksSwitch(config.cacheDir).off).toBe(false);
  });

  it("validates task ids and 404s unknown routes", async () => {
    await start();
    expect((await postJson("/api/internal/tasks/not-a-task/approve", {})).status).toBe(400);
    expect((await postJson("/api/internal/tasks/t_ABCDEF/approve", {})).status).toBe(400);
    expect((await postJson("/api/internal/tasks/t_0123456789abcdef0123/approve", {})).status).toBe(404);
    expect((await postJson("/api/internal/tasks/t_0123456789abcdef0123/delete", {})).status).toBe(404);
    expect((await api("/api/internal/tasks/t_0123456789abcdef0123/approve")).status).toBe(404); // GET
    expect((await api("/api/internal/tasks?state=bogus")).status).toBe(400);
  });

  it("refuses bodies that are not JSON objects, and bodies over 64 KB", async () => {
    await start();
    const task = postTask();
    const notJson = await api(`/api/internal/tasks/${task.task_id}/reject`, { method: "POST", body: "nope" });
    expect(notJson.status).toBe(400);
    expect((await postJson(`/api/internal/tasks/${task.task_id}/reject`, ["array"])).status).toBe(400);
    // The server stops reading at 64 KB; depending on the platform the client
    // sees the 400 or a reset socket. Either way nothing changes.
    const huge = await postJson(`/api/internal/tasks/${task.task_id}/reject`, { reason: "x".repeat(70 * 1024) }).then(
      (res) => res.status,
      () => "reset"
    );
    expect([400, "reset"]).toContain(huge);
    expect(store.tasks.get(config.root, task.task_id, NOW)?.state).toBe("proposed");
  });
});

describe("ui task routes: listing", () => {
  it("lists open tasks with what a person needs to decide, and all on request", async () => {
    const proposal = postTask();
    const mine = postTask({ title: "Summarize the thread", capabilities: ["read:thread"], assignee: "any" }, USER);
    const done = postTask({ title: "Old one", capabilities: ["read:files"] });
    store.tasks.humanAction(config.root, done.task_id, { kind: "cancel" }, { now: T0 + 10, via: "cli" });
    await start();

    const open = await readJson<TaskListResponse>(await api("/api/internal/tasks"));
    expect(open.off).toBe(false);
    expect(open.proposals).toBe("ask");
    expect(open.counts).toEqual({ open: 2, proposals: 1, awaitingApproval: 0, waiting: 1, finished: 1 });
    expect(open.tasks.map((t) => t.task_id).sort()).toEqual([proposal.task_id, mine.task_id].sort());

    const view = open.tasks.find((t) => t.task_id === proposal.task_id) as TaskView;
    expect(view).toMatchObject({
      title: "Email the 12 leads",
      instructions: "Draft a short intro email to each lead in leads.csv, then send them.",
      thread: "Q4 leads",
      assignee: "chatgpt",
      from: "grok",
      origin: "agent",
      state: "proposed",
      a2a_state: "submitted",
      open: true,
      approved: false,
      waiting_on_you: true,
      trifecta: true,
      side_effects: ["send:message"],
      approval: null,
      pending_effect: null,
      thread_frozen: false,
    });
    expect(view.provenance).toContain("NOT approved by the user");
    expect(view.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(view.expires_at).toBe(new Date(proposal.expires_at).toISOString());

    const human = open.tasks.find((t) => t.task_id === mine.task_id) as TaskView;
    expect(human).toMatchObject({ from: "user", approved: true, waiting_on_you: false, trifecta: false });

    const all = await readJson<TaskListResponse>(await api("/api/internal/tasks?state=all"));
    expect(all.tasks).toHaveLength(3);
    expect(all.tasks.find((t) => t.task_id === done.task_id)).toMatchObject({ state: "canceled", open: false, reason: "canceled by the user" });
  });

  it("strips control and bidi characters from agent text in the view", async () => {
    postTask({ title: "Pay‮yas‬ now", instructions: "line one\u001b[31m\nline two" });
    await start();
    const [view] = (await readJson<TaskListResponse>(await api("/api/internal/tasks"))).tasks;
    expect(view?.title).toBe("Payyas now");
    expect(view?.instructions).toBe("line one[31m\nline two");
  });

  it("flags the trifecta only for agent tasks that read private data and can send or publish", () => {
    expect(isTrifecta({ origin: "agent", capabilities: ["read:files", "publish:external"] })).toBe(true);
    expect(isTrifecta({ origin: "agent", capabilities: ["read:thread", "draft:content"] })).toBe(false);
    expect(isTrifecta({ origin: "agent", capabilities: ["send:message", "draft:content"] })).toBe(false);
    expect(isTrifecta({ origin: "human", capabilities: ["read:thread", "send:message"] })).toBe(false);
  });
});

describe("ui task routes: approve", () => {
  it("approves with the CLI's default grant and signs with this device's key", async () => {
    const task = postTask();
    await start();
    const res = await postJson(`/api/internal/tasks/${task.task_id}/approve`, { content_hash: (await firstView()).content_hash });
    expect(res.status).toBe(200);
    const { task: view } = await readJson<{ task: TaskView }>(res);
    expect(view).toMatchObject({ state: "pending", approved: true, waiting_on_you: false });
    expect(view.approval).toMatchObject({ by: "dashboard", granted: ["read:thread", "draft:content"], signed: true, current: true });

    const stored = store.tasks.get(config.root, task.task_id, NOW) as TaskRecord;
    const key = loadOrCreateApprovalKey(config.cacheDir);
    expect(stored.approval?.key_id).toBe(key.keyId);
    expect(stored.approval?.granted).toEqual(["read:thread", "draft:content"]);
    expect(verifyTaskApproval(stored, new Set([key.keyId]))).toBe(true);
    expect(stored.history.at(-1)).toMatchObject({ action: "approve", actor: "human:dashboard" });
  });

  it("grants a side effect only when it is listed explicitly", async () => {
    const task = postTask();
    await start();
    const res = await postJson(`/api/internal/tasks/${task.task_id}/approve`, { granted: ["read:thread", "send:message"] });
    expect(res.status).toBe(200);
    expect((await readJson<{ task: TaskView }>(res)).task.approval?.granted).toEqual(["read:thread", "send:message"]);
  });

  it("validates granted against the capability list, and the model refuses unrequested ones", async () => {
    const task = postTask();
    await start();
    const unknown = await postJson(`/api/internal/tasks/${task.task_id}/approve`, { granted: ["root:everything"] });
    expect(unknown.status).toBe(400);
    expect((await readJson<{ error: string }>(unknown)).error).toContain("unknown capability");
    expect((await postJson(`/api/internal/tasks/${task.task_id}/approve`, { granted: "read:thread" })).status).toBe(400);
    const unrequested = await postJson(`/api/internal/tasks/${task.task_id}/approve`, { granted: ["spend:money"] });
    expect(unrequested.status).toBe(400);
    expect((await readJson<{ error: string }>(unrequested)).error).toBe("cannot grant spend:money: the task did not request it");
    expect(store.tasks.get(config.root, task.task_id, NOW)?.approval).toBeNull();
  });

  it("refuses an approval for content the person did not see", async () => {
    const task = postTask();
    await start();
    const res = await postJson(`/api/internal/tasks/${task.task_id}/approve`, { content_hash: "0".repeat(64) });
    expect(res.status).toBe(409);
    expect((await postJson(`/api/internal/tasks/${task.task_id}/approve`, { content_hash: "short" })).status).toBe(400);
    expect(store.tasks.get(config.root, task.task_id, NOW)?.approval).toBeNull();
  });

  it("answers 409 for a task that is already finished", async () => {
    const task = postTask();
    store.tasks.humanAction(config.root, task.task_id, { kind: "reject" }, { now: T0 + 5, via: "cli" });
    await start();
    const res = await postJson(`/api/internal/tasks/${task.task_id}/approve`, {});
    expect(res.status).toBe(409);
    expect(await readJson<{ code: string }>(res)).toMatchObject({ code: "invalid_state" });
  });
});

async function firstView(): Promise<TaskView> {
  const list = await readJson<TaskListResponse>(await api("/api/internal/tasks"));
  return list.tasks[0] as TaskView;
}

describe("ui task routes: reject and cancel", () => {
  it("rejects with the person's reason and cancels with the default", async () => {
    const a = postTask();
    const b = postTask({ title: "Second" });
    await start();
    const rejected = await readJson<{ task: TaskView }>(await postJson(`/api/internal/tasks/${a.task_id}/reject`, { reason: "  not now  " }));
    expect(rejected.task).toMatchObject({ state: "rejected", reason: "not now", open: false });
    const canceled = await readJson<{ task: TaskView }>(await postJson(`/api/internal/tasks/${b.task_id}/cancel`, {}));
    expect(canceled.task).toMatchObject({ state: "canceled", reason: "canceled by the user" });
    expect((await postJson(`/api/internal/tasks/${b.task_id}/cancel`, { reason: 42 })).status).toBe(400);
  });
});

describe("ui task routes: effects", () => {
  it("shows the exact effect, approves it once, and signs the decision", async () => {
    const task = awaitEffect(postTask());
    await start();
    const view = await firstView();
    expect(view).toMatchObject({ state: "awaiting_approval", waiting_on_you: true });
    expect(view.pending_effect).toMatchObject({
      capability: "send:message",
      summary: "Send the intro email to Ada",
      details: "To: ada@example.com\nSubject: Hi\n\nHello <b>Ada</b>",
    });
    const res = await postJson(`/api/internal/tasks/${task.task_id}/effect`, {
      decision: "approve",
      effect_hash: view.pending_effect?.effect_hash,
    });
    expect(res.status).toBe(200);
    const after = (await readJson<{ task: TaskView }>(res)).task;
    expect(after).toMatchObject({ state: "claimed", pending_effect: null });
    expect(after.effect_decisions).toEqual([
      expect.objectContaining({ capability: "send:message", decision: "approved", by: "dashboard" }),
    ]);
    const stored = store.tasks.get(config.root, task.task_id, NOW) as TaskRecord;
    const key = loadOrCreateApprovalKey(config.cacheDir);
    expect(verifyEffectDecision(task.task_id, stored.effect_decisions[0]!, new Set([key.keyId]))).toBe(true);
  });

  it("denies with a reason, and refuses stale or invalid decisions", async () => {
    const task = awaitEffect(postTask());
    await start();
    expect((await postJson(`/api/internal/tasks/${task.task_id}/effect`, { decision: "maybe" })).status).toBe(400);
    expect((await postJson(`/api/internal/tasks/${task.task_id}/effect`, {})).status).toBe(400);
    const stale = await postJson(`/api/internal/tasks/${task.task_id}/effect`, { decision: "approve", effect_hash: "a".repeat(64) });
    expect(stale.status).toBe(409);
    expect(store.tasks.get(config.root, task.task_id, NOW)?.state).toBe("awaiting_approval");

    const denied = await readJson<{ task: TaskView }>(
      await postJson(`/api/internal/tasks/${task.task_id}/effect`, { decision: "deny", reason: "wrong recipient" })
    );
    expect(denied.task).toMatchObject({ state: "claimed", reason: "wrong recipient" });
    expect(denied.task.effect_decisions[0]).toMatchObject({ decision: "denied" });
    // Nothing is waiting any more.
    expect((await postJson(`/api/internal/tasks/${task.task_id}/effect`, { decision: "approve" })).status).toBe(409);
  });
});

describe("ui task routes: freeze and switch", () => {
  it("freezes a thread (canceling its open tasks and blocking posts) and unfreezes it", async () => {
    const a = postTask();
    postTask({ title: "Other thread", thread: "Billing" });
    await start();
    const frozen = await postJson("/api/internal/tasks/freeze", { thread: "q4 LEADS", frozen: true });
    expect(frozen.status).toBe(200);
    expect(await readJson(frozen)).toEqual({ thread: "q4 LEADS", frozen: true, canceled: 1 });
    expect(store.tasks.get(config.root, a.task_id, NOW)).toMatchObject({ state: "canceled", reason: "thread frozen by the user" });
    expect(store.tasks.post(config.root, postInput(), GROK, { now: NOW }).ok).toBe(false);

    const list = await readJson<TaskListResponse>(await api("/api/internal/tasks?state=all"));
    expect(list.frozen_threads).toEqual(["Q4 leads"]);
    expect(list.tasks.find((t) => t.task_id === a.task_id)?.thread_frozen).toBe(true);

    expect(await readJson(await postJson("/api/internal/tasks/freeze", { thread: "Q4 leads", frozen: false }))).toEqual({
      thread: "Q4 leads",
      frozen: false,
      canceled: 0,
    });
    expect(store.tasks.isFrozen(config.root, "Q4 leads")).toBe(false);
  });

  it("validates freeze bodies and 404s an unknown thread", async () => {
    await start();
    expect((await postJson("/api/internal/tasks/freeze", { thread: "Nope", frozen: true })).status).toBe(404);
    expect((await postJson("/api/internal/tasks/freeze", { thread: "", frozen: true })).status).toBe(400);
    expect((await postJson("/api/internal/tasks/freeze", { thread: "Q4 leads", frozen: "yes" })).status).toBe(400);
  });

  it("turns every task tool off and back on through the global switch", async () => {
    await start();
    expect(await readJson(await postJson("/api/internal/tasks/switch", { off: true }))).toEqual({ off: true });
    expect(readTasksSwitch(config.cacheDir)).toEqual({ off: true, at: new Date(NOW).toISOString() });
    expect((await readJson<TaskListResponse>(await api("/api/internal/tasks"))).off).toBe(true);
    expect(await readJson(await postJson("/api/internal/tasks/switch", { off: false }))).toEqual({ off: false });
    expect(readTasksSwitch(config.cacheDir).off).toBe(false);
    expect((await postJson("/api/internal/tasks/switch", { off: "no" })).status).toBe(400);
  });
});

describe("ui handoff stats", () => {
  it("serves the four Phase 0 gate counters", async () => {
    await start();
    const res = await api("/api/internal/handoff-stats");
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      cross_vendor_threads_30d: 0,
      handoffs_saved_30d: 0,
      handoffs_resumed_cross_vendor_30d: 0,
      resumes_with_prompt_30d: 0,
    });
  });
});
