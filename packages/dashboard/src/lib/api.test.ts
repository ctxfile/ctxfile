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
});
