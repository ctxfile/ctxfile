import { getToken } from "./token";
import type {
  ApiIssue,
  ContextObject,
  ContextScope,
  DashboardState,
  ImportedMemoryList,
  LicenseActivation,
  LicenseState,
  MemoryEntry,
  MemoryImportSummary,
  MemoryPromptMode,
  MemoryScope,
  PlaybookEntry,
  SnapshotJob,
} from "./types";

/** Non-2xx response from the API; carries feature name on pro 403s. */
export class ApiError extends Error {
  readonly status: number;
  readonly feature?: string;
  /** Field-level problems on a 400 (e.g. a memory import that fails the schema). */
  readonly issues: ApiIssue[];

  constructor(status: number, message: string, feature?: string, issues: ApiIssue[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (feature !== undefined) this.feature = feature;
    this.issues = issues;
  }
}

function parseIssues(value: unknown): ApiIssue[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is ApiIssue =>
      typeof v === "object" && v !== null && typeof (v as ApiIssue).path === "string" && typeof (v as ApiIssue).message === "string"
  );
}

/** Network-level failure: the local server is gone (or was never reachable). */
export class ServerGoneError extends Error {
  constructor() {
    super("ctxfile server unreachable");
    this.name = "ServerGoneError";
  }
}

export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return { Authorization: `Bearer ${getToken() ?? ""}`, ...extra };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: authHeaders(init?.headers as Record<string, string> | undefined),
    });
  } catch {
    throw new ServerGoneError();
  }
  if (!res.ok) {
    let body: { error?: unknown; feature?: unknown; issues?: unknown } = {};
    try {
      body = (await res.json()) as { error?: unknown; feature?: unknown; issues?: unknown };
    } catch {
      // non-JSON error body; fall through to the generic message
    }
    throw new ApiError(
      res.status,
      typeof body.error === "string" ? body.error : `request failed (${res.status})`,
      typeof body.feature === "string" ? body.feature : undefined,
      parseIssues(body.issues)
    );
  }
  return (await res.json()) as T;
}

export const api = {
  state: (): Promise<DashboardState> => request("/api/internal/state"),

  context: (scope: ContextScope): Promise<ContextObject> =>
    request(`/api/internal/context?scope=${scope}`),

  snapshot: (): Promise<SnapshotJob> => request("/api/internal/snapshot", { method: "POST" }),

  memory: (): Promise<{ entries: MemoryEntry[] }> => request("/api/internal/memory"),
  playbooks: (): Promise<{ entries: PlaybookEntry[] }> => request("/api/internal/playbooks"),
  rmPlaybook: (id: string): Promise<{ removed: boolean }> =>
    request(`/api/internal/playbooks/${encodeURIComponent(id)}`, { method: "DELETE" }),

  forget: (id: string): Promise<{ forgotten: boolean }> =>
    request(`/api/internal/memory/${encodeURIComponent(id)}`, { method: "DELETE" }),

  memories: (): Promise<ImportedMemoryList> => request("/api/internal/memories"),

  memoryPrompt: (scope: MemoryScope, mode: MemoryPromptMode): Promise<{ prompt: string }> =>
    request(`/api/internal/memories/prompt?scope=${scope}&mode=${mode}`),

  importMemory: (text: string): Promise<MemoryImportSummary> =>
    request("/api/internal/memories/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }),

  approveMemory: (id: number): Promise<{ approved: boolean }> =>
    request(`/api/internal/memories/${id}/approve`, { method: "POST" }),

  approveAllMemories: (): Promise<{ approved: number }> =>
    request("/api/internal/memories/approve-all", { method: "POST" }),

  rejectMemory: (id: number): Promise<{ rejected: boolean }> =>
    request(`/api/internal/memories/${id}`, { method: "DELETE" }),

  license: (): Promise<LicenseState> => request("/api/internal/license"),

  activateLicense: (key: string): Promise<LicenseActivation> =>
    request("/api/internal/license", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    }),
};
