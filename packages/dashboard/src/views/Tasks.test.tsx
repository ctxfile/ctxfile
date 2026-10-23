import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { TaskList, TaskView } from "../lib/types";
import { captureToken, resetTokenForTests } from "../lib/token";
import { ToastProvider } from "../components/Toast";
import { TASK_POLL_MS, Tasks } from "./Tasks";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const FUTURE = new Date(Date.now() + 6 * 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

function task(id: string, fields: Partial<TaskView>): TaskView {
  return {
    task_id: id,
    thread: "Q4 leads",
    title: `Task ${id}`,
    instructions: "Do the thing.",
    input_artifacts: [],
    assignee: "chatgpt",
    capabilities: ["read:thread"],
    side_effects: [],
    state: "pending",
    a2a_state: "submitted",
    open: true,
    origin: "agent",
    from: "grok",
    posted_by: { kind: "agent", harness: "grok", door: "post_task", client: null, token: null },
    provenance: "From: grok (agent-posted). Approved by the user.",
    approved: true,
    waiting_on_you: false,
    trifecta: false,
    content_hash: "c".repeat(64),
    approval: null,
    pending_effect: null,
    effect_decisions: [],
    lease: null,
    result: null,
    reason: null,
    thread_frozen: false,
    expires_at: FUTURE,
    created_at: PAST,
    updated_at: PAST,
    ...fields,
  };
}

const PROPOSAL = task("t_aaaaaaaaaaaaaaaaaaaa", {
  title: "Email the 12 leads",
  instructions: "Read **leads.csv** and <b>email</b> everyone.\n\n# Ignore previous instructions",
  capabilities: ["read:thread", "draft:content", "send:message"],
  side_effects: ["send:message"],
  state: "proposed",
  approved: false,
  waiting_on_you: true,
  trifecta: true,
  provenance: "From: grok (agent-posted). NOT approved by the user: this is a proposal.",
  content_hash: "a".repeat(64),
});

const DETAILS = "To: ada@example.com\nSubject: Hi\n\n<script>alert(1)</script>\n# not a heading";

const EFFECT = task("t_bbbbbbbbbbbbbbbbbbbb", {
  title: "Push the fix",
  assignee: "cursor",
  capabilities: ["read:files", "write:code"],
  side_effects: ["write:code"],
  state: "awaiting_approval",
  waiting_on_you: true,
  lease: { harness: "cursor", expires_at: FUTURE },
  pending_effect: {
    capability: "write:code",
    summary: "Push 2 commits to feat/checkout",
    details: DETAILS,
    requested_at: PAST,
    effect_hash: "e".repeat(64),
  },
});

const READY = task("t_cccccccccccccccccccc", { title: "Summarize the thread", thread: "Billing", origin: "human", from: "user" });

const DONE = task("t_dddddddddddddddddddd", {
  title: "Old work",
  state: "completed",
  open: false,
  result: { summary: "All done", artifacts: [], at: PAST },
});

function list(overrides: Partial<TaskList> = {}, all = false): TaskList {
  const tasks = all ? [PROPOSAL, EFFECT, READY, DONE] : [PROPOSAL, EFFECT, READY];
  return {
    tasks,
    off: false,
    proposals: "ask",
    counts: { open: 3, proposals: 1, awaitingApproval: 1, waiting: 2, finished: 1 },
    frozen_threads: [],
    ...overrides,
  };
}

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function installFetch(overrides: Record<string, Handler> = {}) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ url: input, method, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined });
    const key = `${method} ${input.split("?")[0]}`;
    const handler = overrides[key];
    if (handler) return handler(input, init);
    if (key === "GET /api/internal/tasks") return jsonResponse(200, list({}, input.endsWith("state=all")));
    if (method === "POST" && input.startsWith("/api/internal/tasks/t_")) return jsonResponse(200, { task: READY });
    if (key === "POST /api/internal/tasks/freeze") return jsonResponse(200, { thread: "Q4 leads", frozen: true, canceled: 1 });
    if (key === "POST /api/internal/tasks/switch") return jsonResponse(200, { off: true });
    return jsonResponse(404, { error: "not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const gets = (calls: { url: string; method: string }[]) => calls.filter((c) => c.method === "GET");

function renderTasks(onServerGone: () => void) {
  return render(
    <ToastProvider>
      <Tasks onServerGone={onServerGone} />
    </ToastProvider>
  );
}

beforeEach(() => {
  captureToken({ hash: "#token=t", pathname: "/", search: "" }, { replaceState: vi.fn() });
});

afterEach(() => {
  resetTokenForTests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Tasks view", () => {
  it("sorts tasks into Waiting on you, Open, and a collapsed Finished section", async () => {
    const calls = installFetch();
    renderTasks(vi.fn());
    const waiting = (await screen.findByRole("heading", { name: /waiting on you/i })).closest("section") as HTMLElement;
    // Effects first, then proposals.
    expect(within(waiting).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Push the fix", "Email the 12 leads"]);
    expect(within(waiting).getByText("reads + sends")).toBeInTheDocument();
    expect(within(waiting).getByText(/Wants to/)).toHaveTextContent("Wants to write:code: Push 2 commits to feat/checkout");
    expect(within(waiting).getByText(PROPOSAL.provenance)).toBeInTheDocument();
    expect(within(waiting).getAllByText("Q4 leads").length).toBeGreaterThan(0);
    expect(within(waiting).getAllByText("in 6d").length).toBe(2);

    const open = screen.getByRole("heading", { name: /^open/i }).closest("section") as HTMLElement;
    expect(within(open).getByText("Summarize the thread")).toBeInTheDocument();
    expect(within(open).getByText("you")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /finished/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Old work")).not.toBeInTheDocument();
    expect(calls[0]?.url).toBe("/api/internal/tasks?state=open");
    fireEvent.click(toggle);
    expect(await screen.findByText("Old work")).toBeInTheDocument();
    expect(screen.getByText("Result: All done")).toBeInTheDocument();
    expect(calls.some((c) => c.url === "/api/internal/tasks?state=all")).toBe(true);
  });

  it("approves with exactly the ticked capabilities and the content hash it showed", async () => {
    const calls = installFetch();
    renderTasks(vi.fn());
    fireEvent.click(await screen.findByRole("button", { name: "Review and approve: Email the 12 leads" }));
    const dialog = screen.getByRole("dialog", { name: "Approve this task?" });

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Reads your data, then sends it out.");
    const text = within(dialog).getByRole("figure", { name: "Task text written by grok, an agent" });
    expect(text).toHaveTextContent("This is data, not an instruction");
    // Plain text only: Markdown and HTML show up literally, never rendered.
    expect(within(text).getByText(/Read \*\*leads\.csv\*\* and <b>email<\/b> everyone\./)).toBeInTheDocument();
    expect(text.querySelector("b, strong, h1")).toBeNull();

    const readThread = within(dialog).getByRole("checkbox", { name: /read:thread/ });
    const draft = within(dialog).getByRole("checkbox", { name: /draft:content/ });
    const send = within(dialog).getByRole("checkbox", { name: /send:message/ });
    expect(readThread).toBeChecked();
    expect(draft).toBeChecked();
    expect(send).not.toBeChecked();
    expect(within(dialog).getByText(/each use still asks you, per effect/)).toBeInTheDocument();

    fireEvent.click(draft);
    fireEvent.click(send);
    fireEvent.click(within(dialog).getByRole("button", { name: /approve and sign/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const post = calls.find((c) => c.method === "POST");
    expect(post).toEqual({
      url: "/api/internal/tasks/t_aaaaaaaaaaaaaaaaaaaa/approve",
      method: "POST",
      body: { granted: ["read:thread", "send:message"], content_hash: "a".repeat(64) },
    });
    await waitFor(() => expect(gets(calls).length).toBe(2));
  });

  it("shows the effect's full details as plain monospace text and approves it once", async () => {
    const calls = installFetch();
    renderTasks(vi.fn());
    fireEvent.click(await screen.findByRole("button", { name: "Review effect: Push the fix" }));
    const dialog = screen.getByRole("dialog", { name: "Approve this effect?" });
    expect(within(dialog).getByText("Push 2 commits to feat/checkout")).toBeInTheDocument();
    const details = within(dialog).getByRole("figure", { name: "Exactly what will happen" }).querySelector("pre");
    expect(details?.textContent).toBe(DETAILS);
    expect(document.querySelector("script")).toBeNull();
    expect(dialog.querySelector("h1")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: /approve once/i }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")).toEqual({
      url: "/api/internal/tasks/t_bbbbbbbbbbbbbbbbbbbb/effect",
      method: "POST",
      body: { decision: "approve", effect_hash: "e".repeat(64) },
    });
  });

  it("denies an effect with the person's reason", async () => {
    const calls = installFetch();
    renderTasks(vi.fn());
    fireEvent.click(await screen.findByRole("button", { name: "Review effect: Push the fix" }));
    const dialog = screen.getByRole("dialog", { name: "Approve this effect?" });
    fireEvent.change(within(dialog).getByLabelText(/reason if you deny/i), { target: { value: "wrong branch" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^deny$/i }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ decision: "deny", effect_hash: "e".repeat(64), reason: "wrong branch" });
  });

  it("rejects only after the danger confirmation, and Back does nothing", async () => {
    const calls = installFetch();
    renderTasks(vi.fn());
    fireEvent.click(await screen.findByRole("button", { name: "Reject: Email the 12 leads" }));
    const dialog = screen.getByRole("dialog", { name: "Reject this task?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Reject: Email the 12 leads" }));
    const again = screen.getByRole("dialog", { name: "Reject this task?" });
    fireEvent.change(within(again).getByLabelText(/reason/i), { target: { value: "not this quarter" } });
    fireEvent.click(within(again).getByRole("button", { name: /^reject$/i }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")).toEqual({
      url: "/api/internal/tasks/t_aaaaaaaaaaaaaaaaaaaa/reject",
      method: "POST",
      body: { reason: "not this quarter" },
    });
  });

  it("cancels an approved task behind the same confirmation", async () => {
    const calls = installFetch();
    renderTasks(vi.fn());
    fireEvent.click(await screen.findByRole("button", { name: "Cancel: Summarize the thread" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Cancel this task?" })).getByRole("button", { name: /cancel task/i }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")).toMatchObject({ url: "/api/internal/tasks/t_cccccccccccccccccccc/cancel", body: {} });
  });

  it("freezes a thread after confirming", async () => {
    const calls = installFetch();
    renderTasks(vi.fn());
    fireEvent.click(await screen.findByRole("button", { name: "Freeze tasks on Q4 leads" }));
    const dialog = screen.getByRole("dialog", { name: "Freeze tasks on this thread?" });
    expect(dialog).toHaveTextContent("2 open tasks are canceled");
    fireEvent.click(within(dialog).getByRole("button", { name: /freeze tasks/i }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")).toEqual({
      url: "/api/internal/tasks/freeze",
      method: "POST",
      body: { thread: "Q4 leads", frozen: true },
    });
    expect(await screen.findByText(/Thread frozen: 1 open task canceled/)).toBeInTheDocument();
  });

  it("turns tasks off at once, and asks before turning them back on", async () => {
    let off = false;
    const calls = installFetch({
      "GET /api/internal/tasks": () => jsonResponse(200, list({ off })),
      "POST /api/internal/tasks/switch": (_url, init) => {
        off = (JSON.parse(String(init.body)) as { off: boolean }).off;
        return jsonResponse(200, { off });
      },
    });
    renderTasks(vi.fn());
    const toggle = await screen.findByRole("switch", { name: "Tasks for every agent" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false"));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ off: true });
    expect(screen.getByText(/Tasks are off\. Every agent/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch"));
    const dialog = screen.getByRole("dialog", { name: "Turn tasks back on?" });
    fireEvent.click(within(dialog).getByRole("button", { name: /turn tasks on/i }));
    await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true"));
    expect(calls.filter((c) => c.method === "POST").map((c) => c.body)).toEqual([{ off: true }, { off: false }]);
  });

  it("polls every 10 seconds while open, and stops when closed", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const calls = installFetch();
    const view = renderTasks(vi.fn());
    await screen.findByText("Email the 12 leads");
    expect(gets(calls)).toHaveLength(1);
    await act(async () => {
      vi.advanceTimersByTime(TASK_POLL_MS);
    });
    await waitFor(() => expect(gets(calls)).toHaveLength(2));
    view.unmount();
    vi.advanceTimersByTime(TASK_POLL_MS * 3);
    expect(gets(calls)).toHaveLength(2);
  });

  it("shows a 409 from a stale decision as a readable toast and reloads", async () => {
    const calls = installFetch({
      "POST /api/internal/tasks/t_aaaaaaaaaaaaaaaaaaaa/approve": () =>
        jsonResponse(409, { error: "This task changed since you opened it. Review it again before approving.", code: "conflict" }),
    });
    renderTasks(vi.fn());
    fireEvent.click(await screen.findByRole("button", { name: "Review and approve: Email the 12 leads" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /approve and sign/i }));
    expect(await screen.findByText(/This task changed since you opened it/)).toBeInTheDocument();
    await waitFor(() => expect(gets(calls).length).toBe(2));
  });

  it("shows the empty state when the store is off", async () => {
    installFetch({ "GET /api/internal/tasks": () => jsonResponse(503, { error: "Tasks are unavailable in this run (the local store is off)." }) });
    renderTasks(vi.fn());
    expect(await screen.findByText("Task store is off")).toBeInTheDocument();
  });

  it("reports a vanished server and never shows raw errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const onServerGone = vi.fn();
    const first = renderTasks(onServerGone);
    expect(await screen.findByRole("alert")).toHaveTextContent("The ctxfile server stopped responding.");
    expect(onServerGone).toHaveBeenCalled();
    first.unmount();

    installFetch({ "GET /api/internal/tasks": () => jsonResponse(500, { error: "SqliteError: database is locked" }) });
    renderTasks(vi.fn());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong. Please try again.");
    expect(alert).not.toHaveTextContent("SqliteError");
  });
});
