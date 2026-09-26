import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ImportedMemory as ImportedMemoryRecord } from "../lib/types";
import { captureToken, resetTokenForTests } from "../lib/token";
import { ImportedMemory, summarizeImport } from "./ImportedMemory";
import { Memory } from "./Memory";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function rec(id: number, fields: Partial<ImportedMemoryRecord>): ImportedMemoryRecord {
  return {
    id,
    scope: "global",
    memoryId: `mem-${id}`,
    category: "fact",
    text: `fact ${id}`,
    verbatim: false,
    origin: "inferred",
    date: null,
    project: null,
    status: "active",
    sources: ["chatgpt"],
    seenCount: 1,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...fields,
  };
}

const ENTRIES: ImportedMemoryRecord[] = [
  rec(1, { category: "career", text: "Runs ctxfile", date: "2026-01-10", origin: "stored" }),
  rec(2, { category: "instruction", text: "Be critical of my ideas", verbatim: true, origin: "stored" }),
  rec(3, { category: "preference", text: "Concise answers", sources: ["grok", "claude"] }),
  rec(4, { scope: "project", category: "gotcha", text: "Rebuild better-sqlite3 on Node 26" }),
  rec(5, { category: "instruction", text: "Never add attribution lines", status: "pending", verbatim: true }),
];

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function installFetch(overrides: Record<string, Handler> = {}) {
  const calls: { url: string; method: string; body?: string }[] = [];
  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ url: input, method, body: typeof init.body === "string" ? init.body : undefined });
    const key = `${method} ${input.split("?")[0]}`;
    const handler = overrides[key];
    if (handler) return handler(input, init);
    if (key === "GET /api/internal/memories") return jsonResponse(200, { available: true, entries: ENTRIES, pending: 1 });
    if (key === "GET /api/internal/memories/prompt") {
      const mode = new URL(input, "http://x").searchParams.get("mode");
      return jsonResponse(200, { prompt: mode === "paste" ? "PASTE PROMPT: output one json block" : "MCP PROMPT: call ingest_memory" });
    }
    if (key === "POST /api/internal/memories/5/approve") return jsonResponse(200, { approved: true });
    if (key === "POST /api/internal/memories/approve-all") return jsonResponse(200, { approved: 1 });
    if (key.startsWith("DELETE /api/internal/memories/")) return jsonResponse(200, { rejected: true });
    return jsonResponse(404, { error: "not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

beforeEach(() => {
  captureToken({ hash: "#token=t", pathname: "/", search: "" }, { replaceState: vi.fn() });
});

afterEach(() => {
  resetTokenForTests();
  vi.unstubAllGlobals();
});

describe("ImportedMemory", () => {
  it("groups active global entries by category in behavior-first order and shows provenance", async () => {
    installFetch();
    render(<ImportedMemory onServerGone={vi.fn()} />);
    const instructions = await screen.findByRole("region", { name: "Instructions" });
    expect(within(instructions).getByText("Be critical of my ideas")).toBeInTheDocument();
    expect(within(instructions).getByText("verbatim")).toBeInTheDocument();
    expect(within(instructions).queryByText("Never add attribution lines")).not.toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent?.replace(/\d+$/, ""));
    expect(headings).toEqual(["Instructions", "Preferences", "Career"]);
    expect(screen.getByText("2026-01-10")).toBeInTheDocument();
    expect(screen.getByText(/grok, claude/)).toBeInTheDocument();
    expect(screen.queryByText("Rebuild better-sqlite3 on Node 26")).not.toBeInTheDocument();
  });

  it("switches to the project scope", async () => {
    installFetch();
    render(<ImportedMemory onServerGone={vi.fn()} />);
    await screen.findByText("Be critical of my ideas");
    fireEvent.click(screen.getByRole("tab", { name: /project/i }));
    expect(screen.getByText("Rebuild better-sqlite3 on Node 26")).toBeInTheDocument();
    expect(screen.queryByText("Be critical of my ideas")).not.toBeInTheDocument();
  });

  it("approves a pending entry through the API and reloads", async () => {
    const calls = installFetch();
    render(<ImportedMemory onServerGone={vi.fn()} />);
    await screen.findByText("Be critical of my ideas");
    fireEvent.click(screen.getByRole("tab", { name: /pending/i }));
    expect(screen.getByText("Never add attribution lines")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve instruction: Never add attribution lines" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/internal/memories/5/approve")).toBe(true));
    await waitFor(() => expect(calls.filter((c) => c.url === "/api/internal/memories").length).toBe(2));
  });

  it("approves all pending entries from the header", async () => {
    const calls = installFetch();
    render(<ImportedMemory onServerGone={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /approve all \(1\)/i }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/internal/memories/approve-all")).toBe(true));
  });

  it("rejects only after confirming in the sheet, and cancel does nothing", async () => {
    const calls = installFetch();
    render(<ImportedMemory onServerGone={vi.fn()} />);
    await screen.findByText("Concise answers");
    fireEvent.click(screen.getByRole("button", { name: "Reject preference: Concise answers" }));
    const dialog = screen.getByRole("dialog", { name: "Reject this memory?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Reject preference: Concise answers" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^reject$/i }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/internal/memories/3")).toBe(true));
  });

  it("shows a friendly error when the server is gone and reports it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const onServerGone = vi.fn();
    render(<ImportedMemory onServerGone={onServerGone} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The ctxfile server stopped responding.");
    expect(onServerGone).toHaveBeenCalled();
  });

  it("never shows raw server errors for unexpected failures", async () => {
    installFetch({ "GET /api/internal/memories": () => jsonResponse(500, { error: "SqliteError: database is locked at /Users/x" }) });
    render(<ImportedMemory onServerGone={vi.fn()} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong. Please try again.");
    expect(alert).not.toHaveTextContent("SqliteError");
  });

  it("shows the empty state for an unavailable store", async () => {
    installFetch({ "GET /api/internal/memories": () => jsonResponse(200, { available: false, entries: [], pending: 0 }) });
    render(<ImportedMemory onServerGone={vi.fn()} />);
    expect(await screen.findByText("Memory store is off")).toBeInTheDocument();
  });
});

describe("Import memory sheet", () => {
  it("fetches the prompt for the chosen mode and scope", async () => {
    const calls = installFetch();
    render(<ImportedMemory onServerGone={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /import memory/i }));
    expect(await screen.findByText(/PASTE PROMPT/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Connected" }));
    expect(await screen.findByText(/MCP PROMPT/)).toBeInTheDocument();
    expect(screen.queryByLabelText("The assistant's reply")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "This project" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/internal/memories/prompt?scope=project&mode=mcp")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("imports a pasted reply, closes, and reloads the list", async () => {
    const calls = installFetch({
      "POST /api/internal/memories/import": () =>
        jsonResponse(200, { created: 2, merged: 1, pending: 1, skippedRejected: 0, complete: true, scope: "global" }),
    });
    render(<ImportedMemory onServerGone={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /import memory/i }));
    const importButton = screen.getByRole("button", { name: /^import$/i });
    expect(importButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("The assistant's reply"), { target: { value: "```json\n{}\n```" } });
    fireEvent.click(importButton);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const post = calls.find((c) => c.method === "POST" && c.url === "/api/internal/memories/import");
    expect(post?.body).toBe(JSON.stringify({ text: "```json\n{}\n```" }));
    await waitFor(() => expect(calls.filter((c) => c.url === "/api/internal/memories").length).toBe(2));
    // Pending entries arrived, so the view lands on the approval queue.
    expect(screen.getByRole("tab", { name: /pending/i })).toHaveAttribute("aria-selected", "true");
  });

  it("renders the friendly error and each schema issue on a 400", async () => {
    installFetch({
      "POST /api/internal/memories/import": () =>
        jsonResponse(400, {
          error: "The export does not match the memory schema.",
          issues: [{ path: "entries.0.category", message: "must be one of instruction, preference" }],
        }),
    });
    render(<ImportedMemory onServerGone={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /import memory/i }));
    fireEvent.change(screen.getByLabelText("The assistant's reply"), { target: { value: "{}" } });
    fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The export does not match the memory schema.");
    const issues = within(dialog).getByRole("list", { name: "Problems with the export" });
    expect(issues).toHaveTextContent("entries.0.category: must be one of instruction, preference");
  });
});

describe("Memory view", () => {
  it("keeps imported memory free while the Pro section stays locked", async () => {
    installFetch();
    render(<Memory features={{ sessions: false, memory: false, consult: false, voice: false }} onServerGone={vi.fn()} />);
    expect(await screen.findByText("Be critical of my ideas")).toBeInTheDocument();
    expect(screen.getByText("Agent memory · Pro")).toBeInTheDocument();
  });
});

describe("summarizeImport", () => {
  it("lists only the non-zero parts and flags incomplete exports", () => {
    expect(summarizeImport({ created: 3, merged: 0, pending: 0, skippedRejected: 0, complete: true, scope: "global" })).toBe(
      "Imported global memory: 3 new"
    );
    expect(summarizeImport({ created: 1, merged: 2, pending: 1, skippedRejected: 1, complete: false, scope: "project" })).toBe(
      "Imported project memory: 1 new · 2 merged · 1 await approval · 1 skipped (rejected before). More remain: import the next batch."
    );
  });
});
