/**
 * Receiver for ctxfile's opt-in telemetry ping, plus anonymous site events.
 *
 * The client (packages/core/src/telemetry.ts) POSTs here at most once a week,
 * and only when telemetry.enabled has been explicitly turned on:
 *
 *   { installId: <random uuid>, version: string, os: NodeJS.Platform }
 *
 * ctxfile.dev also sends first-party interaction counters here (for example
 * "setup command copied", with the client tab as the only property), so the
 * site can measure intent without loading any third-party script. An event
 * is a name and an optional short label; it is stored as a daily counter and
 * nothing else.
 *
 * Nothing beyond that is stored. This worker never reads CF-Connecting-IP,
 * never sets a cookie, and never records a user agent, because the question it
 * exists to answer is "is anyone running this?", not "who". Request
 * observability is disabled in wrangler.toml for the same reason: platform
 * request logs would capture client IPs that the application deliberately
 * ignores. The source is public so ctxfile.dev's privacy claim can be audited
 * rather than trusted.
 */

interface Env {
  PINGS: KVNamespace;
  /** Bearer token guarding /v1/stats. Set via `wrangler secret put STATS_TOKEN`. */
  STATS_TOKEN?: string;
}

/**
 * What we keep per install. Held in KV *metadata* rather than the value so
 * that computing stats costs one list page per 1000 installs instead of one
 * read per install.
 */
interface InstallRecord {
  /** First seen, YYYY-MM-DD. Day precision is all this needs. */
  f: string;
  /** Last seen, YYYY-MM-DD. */
  l: string;
  version: string;
  os: string;
}

/** An install that has not pinged in 90 days has stopped using ctxfile. */
const INSTALL_TTL_SECONDS = 90 * 24 * 60 * 60;
/** Daily event counters age out after a year. */
const EVENT_TTL_SECONDS = 365 * 24 * 60 * 60;
const MAX_BODY_BYTES = 512;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** Only the marketing site may report events; the browser enforces this via CORS. */
const EVENT_ORIGINS = new Set(["https://ctxfile.dev", "https://www.ctxfile.dev"]);
/** Event names are a closed set so the store cannot be filled with junk. */
const EVENT_NAMES = new Set(["setup-copied", "extension-downloaded", "demo-opened", "pricing-cta", "post-read", "post-cta"]);

function readString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin !== null && EVENT_ORIGINS.has(origin) ? origin : "https://ctxfile.dev";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  return parsed as Record<string, unknown>;
}

async function handlePing(request: Request, env: Env): Promise<Response> {
  const payload = await readJsonBody(request);
  if (!payload) return new Response(null, { status: 400 });

  const installId = readString(payload.installId, 64);
  const version = readString(payload.version, 32);
  const os = readString(payload.os, 32);
  if (!installId || !version || !os) return new Response(null, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const key = `i:${installId}`;
  const existing = await env.PINGS.getWithMetadata<InstallRecord>(key, "text");
  const record: InstallRecord = {
    f: existing.metadata?.f ?? today,
    l: today,
    version,
    os,
  };

  // Empty value on purpose: everything lives in metadata (see InstallRecord).
  await env.PINGS.put(key, "", { expirationTtl: INSTALL_TTL_SECONDS, metadata: record });
  return new Response(null, { status: 204 });
}

/**
 * Site interaction counter. Key: e:<day>:<name>:<label>, value: count.
 * KV has no atomic increment, so concurrent events on the same second can
 * undercount by one; at this site's volume that is a rounding error and it
 * beats storing one row per click.
 */
async function handleEvent(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);
  if (origin !== null && !EVENT_ORIGINS.has(origin)) return new Response(null, { status: 403, headers });

  const payload = await readJsonBody(request);
  if (!payload) return new Response(null, { status: 400, headers });
  const name = readString(payload.name, 32);
  if (!name || !EVENT_NAMES.has(name)) return new Response(null, { status: 400, headers });
  const label = (readString(payload.label, 40) ?? "-").replace(/[^A-Za-z0-9 _.-]/g, "").slice(0, 40) || "-";

  const today = new Date().toISOString().slice(0, 10);
  const key = `e:${today}:${name}:${label}`;
  const current = Number((await env.PINGS.get(key, "text")) ?? "0");
  await env.PINGS.put(key, String(current + 1), { expirationTtl: EVENT_TTL_SECONDS });
  return new Response(null, { status: 204, headers });
}

async function collectEvents(env: Env): Promise<{ last30Days: Record<string, number>; byDay: Record<string, number> }> {
  const cutoff = Date.now() - MONTH_MS;
  const last30Days: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  let cursor: string | undefined;
  do {
    const page = await env.PINGS.list({ prefix: "e:", cursor });
    for (const entry of page.keys) {
      const [, day, name, label] = entry.name.split(":");
      if (!day || !name || Date.parse(day) < cutoff) continue;
      const count = Number((await env.PINGS.get(entry.name, "text")) ?? "0");
      const series = label && label !== "-" ? `${name}:${label}` : name;
      last30Days[series] = (last30Days[series] ?? 0) + count;
      byDay[day] = (byDay[day] ?? 0) + count;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return { last30Days, byDay };
}

async function handleStats(request: Request, env: Env): Promise<Response> {
  const expected = env.STATS_TOKEN;
  // Aggregate counts are not sensitive, but "how many users does ctxfile have"
  // is not something to hand to anyone who guesses the path either.
  if (!expected) return new Response("stats disabled", { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const cutoff = Date.now() - WEEK_MS;
  const byVersion: Record<string, number> = {};
  const byOs: Record<string, number> = {};
  let cursor: string | undefined;
  let known = 0;
  let weekly = 0;

  do {
    const page = await env.PINGS.list<InstallRecord>({ prefix: "i:", cursor });
    for (const entry of page.keys) {
      const meta = entry.metadata;
      if (!meta) continue;
      known += 1;
      if (Date.parse(meta.l) < cutoff) continue;
      weekly += 1;
      byVersion[meta.version] = (byVersion[meta.version] ?? 0) + 1;
      byOs[meta.os] = (byOs[meta.os] ?? 0) + 1;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  const events = await collectEvents(env);
  return Response.json({ weeklyActiveInstalls: weekly, knownInstalls: known, byVersion, byOs, siteEvents: events });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/v1/ping" && request.method === "POST") return handlePing(request, env);
    if (pathname === "/v1/event" && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
    }
    if (pathname === "/v1/event" && request.method === "POST") return handleEvent(request, env);
    if (pathname === "/v1/stats" && request.method === "GET") return handleStats(request, env);
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
