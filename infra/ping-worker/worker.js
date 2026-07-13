// Cloudflare Worker for the opt-in anonymous install ping.
// Deploy manually (founder-approved) with a KV namespace bound as PINGS.
// Stores one key per installId per ISO week — the KV key count per week IS
// the weekly-active-installs gate metric. No IP addresses are stored; only the
// coarse version/os the client sent are kept (never code, paths, or content).
// The /v1/stats read endpoint requires the STATS_TOKEN admin secret.

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/v1/ping") {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response("bad request", { status: 400 });
      }
      const { installId, version, os } = body ?? {};
      if (typeof installId !== "string" || !/^[0-9a-f-]{36}$/.test(installId)) {
        return new Response("bad request", { status: 400 });
      }
      const week = isoWeek(new Date());
      await env.PINGS.put(
        `${week}:${installId}`,
        JSON.stringify({ version: String(version).slice(0, 20), os: String(os).slice(0, 10) }),
        { expirationTtl: 60 * 60 * 24 * 90 }
      );
      return new Response("ok");
    }

    if (request.method === "GET" && url.pathname === "/v1/stats") {
      // Admin-only: the weekly-active-installs count is a private gate metric,
      // not public data. Requires STATS_TOKEN (set as a Worker secret).
      const auth = request.headers.get("authorization") ?? "";
      const expected = env.STATS_TOKEN ? `Bearer ${env.STATS_TOKEN}` : null;
      if (!expected || auth !== expected) {
        return new Response("unauthorized", { status: 401 });
      }
      const week = url.searchParams.get("week") ?? isoWeek(new Date());
      let count = 0;
      let cursor;
      do {
        const page = await env.PINGS.list({ prefix: `${week}:`, cursor });
        count += page.keys.length;
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return Response.json({ week, weeklyActiveInstalls: count });
    }

    return new Response("not found", { status: 404 });
  },
};
