import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, ServerGoneError } from "./api";
import { captureToken, resetTokenForTests } from "./token";

function setToken(value: string): void {
  captureToken({ hash: `#token=${value}`, pathname: "/", search: "" }, { replaceState: vi.fn() });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  setToken("test-token");
});

afterEach(() => {
  resetTokenForTests();
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("sends the Authorization bearer header on every request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { entries: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await api.memory();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/internal/memory");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-token");
  });

  it("throws ApiError carrying the feature field on a pro 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(403, { error: "pro feature not available", feature: "memory", licensed: false })
      )
    );

    const err = await api.memory().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiError = err as ApiError;
    expect(apiError.status).toBe(403);
    expect(apiError.feature).toBe("memory");
    expect(apiError.message).toBe("pro feature not available");
  });

  it("throws ServerGoneError when fetch rejects at the network level", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(api.state()).rejects.toBeInstanceOf(ServerGoneError);
  });

  it("posts the license key as JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { stored: true, detail: "ok", restartRequired: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.activateLicense("KEY-123");

    expect(result.restartRequired).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ key: "KEY-123" }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("URL-encodes memory ids in the forget path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { forgotten: true }));
    vi.stubGlobal("fetch", fetchMock);

    await api.forget("id with/slash");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("/api/internal/memory/id%20with%2Fslash");
  });

  it("carries schema issues on a 400 memory import", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(400, { error: "bad export", issues: [{ path: "scope", message: "must be global" }, { junk: true }] })
      )
    );
    const err = (await api.importMemory("{}").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.issues).toEqual([{ path: "scope", message: "must be global" }]);
  });

  it("hits the task routes with the right methods and JSON bodies", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    const hash = "a".repeat(64);
    await api.tasks("open");
    await api.tasks("all");
    await api.approveTask("t_0123456789abcdef0123", ["read:thread", "send:message"], hash);
    await api.rejectTask("t_0123456789abcdef0123", "  not now ");
    await api.cancelTask("t_0123456789abcdef0123");
    await api.cancelTask("t_0123456789abcdef0123", "   ");
    await api.decideEffect("t_0123456789abcdef0123", "approve", hash, "ignored on approve");
    await api.decideEffect("t_0123456789abcdef0123", "deny", hash, "wrong recipient");
    await api.freezeThread("Q4 leads", true);
    await api.setTasksOff(true);
    await api.handoffStats();
    await api.connectedClients();
    const calls = (fetchMock.mock.calls as [string, RequestInit][]).map(([url, init]) => ({
      call: `${init.method ?? "GET"} ${url}`,
      body: typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
      json: (init.headers as Record<string, string>)["Content-Type"] === "application/json",
      auth: (init.headers as Record<string, string>)["Authorization"],
    }));
    expect(calls.map((c) => [c.call, c.body])).toEqual([
      ["GET /api/internal/tasks?state=open", undefined],
      ["GET /api/internal/tasks?state=all", undefined],
      ["POST /api/internal/tasks/t_0123456789abcdef0123/approve", { granted: ["read:thread", "send:message"], content_hash: hash }],
      ["POST /api/internal/tasks/t_0123456789abcdef0123/reject", { reason: "not now" }],
      ["POST /api/internal/tasks/t_0123456789abcdef0123/cancel", {}],
      ["POST /api/internal/tasks/t_0123456789abcdef0123/cancel", {}],
      ["POST /api/internal/tasks/t_0123456789abcdef0123/effect", { decision: "approve", effect_hash: hash }],
      ["POST /api/internal/tasks/t_0123456789abcdef0123/effect", { decision: "deny", effect_hash: hash, reason: "wrong recipient" }],
      ["POST /api/internal/tasks/freeze", { thread: "Q4 leads", frozen: true }],
      ["POST /api/internal/tasks/switch", { off: true }],
      ["GET /api/internal/handoff-stats", undefined],
      ["GET /api/internal/clients", undefined],
    ]);
    expect(calls.filter((c) => c.call.startsWith("POST")).every((c) => c.json)).toBe(true);
    expect(calls.every((c) => c.auth === "Bearer test-token")).toBe(true);
  });

  it("URL-encodes task ids in task paths", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { task: {} }));
    vi.stubGlobal("fetch", fetchMock);
    await api.rejectTask("../state?x");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("/api/internal/tasks/..%2Fstate%3Fx/reject");
  });

  it("carries the server's message and status on a 409 task decision", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(409, { error: "task t_x is canceled", code: "invalid_state" })));
    const err = (await api.approveTask("t_x", [], "a".repeat(64)).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.message).toBe("task t_x is canceled");
  });

  it("hits the imported memory routes with the right methods", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    await api.memories();
    await api.memoryPrompt("project", "paste");
    await api.approveMemory(7);
    await api.approveAllMemories();
    await api.rejectMemory(7);
    const calls = (fetchMock.mock.calls as [string, RequestInit][]).map(([url, init]) => `${init.method ?? "GET"} ${url}`);
    expect(calls).toEqual([
      "GET /api/internal/memories",
      "GET /api/internal/memories/prompt?scope=project&mode=paste",
      "POST /api/internal/memories/7/approve",
      "POST /api/internal/memories/approve-all",
      "DELETE /api/internal/memories/7",
    ]);
  });
});
