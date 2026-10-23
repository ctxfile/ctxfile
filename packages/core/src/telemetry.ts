import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ResolvedConfig } from "./config.js";
import { IngestStore, type GateCounts } from "./storage/ingest-store.js";
import { VERSION } from "./version.js";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface TelemetryState {
  installId: string;
  lastPingAt: string | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function statePath(): string {
  return path.join(os.homedir(), ".ctxfile", "telemetry.json");
}

function loadState(filePath: string): TelemetryState {
  try {
    const state = JSON.parse(readFileSync(filePath, "utf8")) as TelemetryState;
    if (typeof state.installId === "string" && state.installId) return state;
  } catch {
    // first run or corrupt state: start fresh
  }
  return { installId: randomUUID(), lastPingAt: null };
}

/** Reads the four gate counters from the local store, or null when there is
    no store yet or it cannot be read. Whole numbers only. */
export function readGateCounts(cacheDir: string, now = Date.now()): GateCounts | null {
  const dbPath = path.join(cacheDir, "ingest.db");
  if (!existsSync(dbPath)) return null;
  let store: IngestStore | null = null;
  try {
    store = new IngestStore(dbPath);
    return store.gateCounts(now);
  } catch {
    return null;
  } finally {
    store?.close();
  }
}

/**
 * Sends the weekly opt-in anonymous ping: random install UUID, version,
 * coarse OS, and four whole-number usage counts (how often work crosses
 * between AI tools) — never code, paths, titles, or content. No-op unless
 * telemetry.enabled is explicitly true. All failures are swallowed;
 * telemetry must never affect the server.
 */
export async function sendPingIfDue(
  config: ResolvedConfig,
  opts: { fetchImpl?: FetchLike; now?: Date; stateFilePath?: string; usage?: () => GateCounts | null } = {}
): Promise<boolean> {
  if (!config.telemetry.enabled) return false;
  const now = opts.now ?? new Date();
  const filePath = opts.stateFilePath ?? statePath();
  const state = loadState(filePath);

  if (state.lastPingAt && now.getTime() - new Date(state.lastPingAt).getTime() < WEEK_MS) {
    return false;
  }

  const fetchImpl = opts.fetchImpl ?? ((url: string, init?: RequestInit) => globalThis.fetch(url, init));
  let usage: GateCounts | null = null;
  try {
    usage = (opts.usage ?? (() => readGateCounts(config.cacheDir, now.getTime())))();
  } catch {
    usage = null;
  }
  try {
    await fetchImpl(config.telemetry.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ installId: state.installId, version: VERSION, os: process.platform, ...(usage ? { usage } : {}) }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return false; // network problems are not our user's problem
  }

  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify({ ...state, lastPingAt: now.toISOString() }));
  } catch {
    // state write failure: worst case we ping again next start
  }
  return true;
}
