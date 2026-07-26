/**
 * Receiver for ctxfile's opt-in telemetry ping.
 *
 * The client (packages/core/src/telemetry.ts) POSTs here at most once a week,
 * and only when telemetry.enabled has been explicitly turned on:
 *
 *   { installId: <random uuid>, version: string, os: NodeJS.Platform }
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
const MAX_BODY_BYTES = 512;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function readString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

async function handlePing(request: Request, env: Env): Promise<Response> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof parsed !== "object" || parsed === null) return new Response(null, { status: 400 });

  const payload = parsed as Record<string, unknown>;
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

  return Response.json({ weeklyActiveInstalls: weekly, knownInstalls: known, byVersion, byOs });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/v1/ping" && request.method === "POST") return handlePing(request, env);
    if (pathname === "/v1/stats" && request.method === "GET") return handleStats(request, env);
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
