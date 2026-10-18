import type { VaultConfig } from "./vault.js";

/**
 * Client for the relay's push targets (Sync): where the relay sends a signed
 * wake-up when a task is approved for an agent. Managed from a device with the
 * vault's device token, never from an MCP tool.
 */

export type PushTargetKind = "webhook" | "claude-code-routine";

export interface PushTarget {
  id: string;
  kind: PushTargetKind;
  name: string;
  url: string;
  assignee: string;
  created_at: number;
  last_status: string | null;
  last_attempt_at: number | null;
}

export interface AddPushTargetInput {
  kind: PushTargetKind;
  url: string;
  name?: string;
  assignee?: string;
  /** Claude Code Routine targets: the routine's API token. */
  token?: string;
}

async function call(config: VaultConfig, route: string, init: RequestInit, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(`${config.relayUrl.replace(/\/+$/, "")}${route}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${config.token}` },
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (response.status === 404 && route.startsWith("/v1/push")) {
    throw new Error("this relay does not support push yet (relay 0.5.0+)");
  }
  if (!response.ok) throw new Error(body.error ?? `relay ${route} failed: ${response.status}`);
  return body;
}

export async function addPushTarget(
  config: VaultConfig,
  input: AddPushTargetInput,
  fetchImpl: typeof fetch = fetch
): Promise<{ target: PushTarget; secret: string | null }> {
  return (await call(config, "/v1/push/targets", { method: "POST", body: JSON.stringify(input) }, fetchImpl)) as {
    target: PushTarget;
    secret: string | null;
  };
}

export async function listPushTargets(config: VaultConfig, fetchImpl: typeof fetch = fetch): Promise<PushTarget[]> {
  return ((await call(config, "/v1/push/targets", { method: "GET" }, fetchImpl)) as { targets: PushTarget[] }).targets;
}

export async function removePushTarget(config: VaultConfig, id: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  return ((await call(config, `/v1/push/targets/${encodeURIComponent(id)}`, { method: "DELETE" }, fetchImpl)) as { removed: boolean }).removed;
}

export async function testPushTarget(
  config: VaultConfig,
  id: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  return (await call(config, `/v1/push/targets/${encodeURIComponent(id)}/test`, { method: "POST", body: "{}" }, fetchImpl)) as {
    ok: boolean;
    status: number | null;
    error: string | null;
  };
}
