import { getToken } from "./token";
import type {
  ContextObject,
  ContextScope,
  DashboardState,
  LicenseActivation,
  LicenseState,
  MemoryEntry,
  SnapshotJob,
} from "./types";

/** Non-2xx response from the API; carries feature name on pro 403s. */
export class ApiError extends Error {
  readonly status: number;
  readonly feature?: string;

  constructor(status: number, message: string, feature?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (feature !== undefined) this.feature = feature;
  }
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
    let body: { error?: unknown; feature?: unknown } = {};
    try {
      body = (await res.json()) as { error?: unknown; feature?: unknown };
    } catch {
      // non-JSON error body; fall through to the generic message
    }
    throw new ApiError(
      res.status,
      typeof body.error === "string" ? body.error : `request failed (${res.status})`,
      typeof body.feature === "string" ? body.feature : undefined
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

  forget: (id: string): Promise<{ forgotten: boolean }> =>
    request(`/api/internal/memory/${encodeURIComponent(id)}`, { method: "DELETE" }),

  license: (): Promise<LicenseState> => request("/api/internal/license"),

  activateLicense: (key: string): Promise<LicenseActivation> =>
    request("/api/internal/license", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    }),
};
