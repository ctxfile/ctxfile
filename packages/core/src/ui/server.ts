import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import type { ResolvedConfig } from "../config.js";
import { filterScope } from "../engine/build.js";
import { CONTEXT_SCOPES, type ContextObject, type ContextScope } from "../engine/types.js";
import type { SnapshotService } from "../engine/service.js";
import { inspectLicenseKey } from "../license-inspect.js";
import { storeLicenseKey } from "../license-store.js";
import type { ProModule, ProUiFeatures } from "../plugin.js";
import { VERSION } from "../version.js";
import { hostAllowed, tokenMatches } from "./security.js";

export const DEFAULT_UI_PORT = 4747;
const MAX_BODY_BYTES = 64 * 1024;
const NO_FEATURES: ProUiFeatures = { sessions: false, memory: false, consult: false, voice: false };
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'";

export interface UiServerDeps {
  config: ResolvedConfig;
  service: SnapshotService;
  pro: ProModule | null;
  proActive: boolean;
  token: string;
  staticDir?: string;
  homedir?: string;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

/** Everything /state serves is a summary; secret VALUES (tokens, keys) never appear. */
function buildState(deps: UiServerDeps): unknown {
  const { config, service, pro, proActive } = deps;
  const latest = service.latestCached();
  return {
    version: VERSION,
    root: config.root,
    license: {
      installed: pro !== null,
      active: proActive,
      status: pro?.licenseStatus() ?? null,
      features: (proActive && pro?.ui?.features()) || NO_FEATURES,
      licenseInfo: proActive ? (pro?.ui?.licenseInfo?.() ?? null) : null,
    },
    config: {
      tokenBudget: config.tokenBudget,
      maxFileTokens: config.maxFileTokens,
      cacheMaxAgeMs: config.cacheMaxAgeMs,
      include: config.include,
      exclude: config.exclude,
      notion: { configured: config.notion.token !== null, pageCount: config.notion.pageIds.length },
      ollama: { summarize: config.ollama.summarize, model: config.ollama.model, baseUrl: config.ollama.baseUrl },
      consult: { providers: config.consult.providers.map((p) => ({ type: p.type, model: p.model ?? null })) },
      voice: { configured: config.voice.whisperPath !== null && config.voice.modelPath !== null },
      telemetry: { enabled: config.telemetry.enabled },
    },
    latest: latest
      ? {
          generatedAt: latest.meta.generatedAt,
          tokensUsed: latest.meta.tokensUsed,
          tokenBudget: latest.meta.tokenBudget,
          connectors: latest.meta.connectors,
        }
      : null,
    recent: service.recentSnapshots(20),
  };
}

function proGate(
  deps: UiServerDeps,
  feature: keyof ProUiFeatures,
  res: ServerResponse
): NonNullable<ProModule["ui"]> | null {
  const ui = deps.proActive ? deps.pro?.ui : undefined;
  if (!ui || !ui.features()[feature]) {
    sendJson(res, 403, { error: "pro feature not available", feature, licensed: false });
    return null;
  }
  return ui;
}

export function createUiServer(deps: UiServerDeps): Server {
  const server = createHttpServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      console.error(`ctxfile ui: ${error instanceof Error ? error.message : String(error)}`);
      if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
      else res.end();
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const port = (server.address() as AddressInfo | null)?.port ?? 0;
    if (!hostAllowed(req.headers.host, port)) {
      sendJson(res, 403, { error: "forbidden host" });
      return;
    }
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

    if (url.pathname.startsWith("/api/internal/")) {
      const auth = req.headers.authorization;
      const provided = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
      if (!tokenMatches(deps.token, provided)) {
        sendJson(res, 401, { error: "unauthorized" });
        return;
      }
      await handleApi(req, res, url);
      return;
    }

    handleStatic(req, res, url);
  }

  async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const route = `${req.method ?? "GET"} ${url.pathname}`;

    if (route === "GET /api/internal/state") {
      sendJson(res, 200, buildState(deps));
      return;
    }

    if (route === "GET /api/internal/context") {
      const scope = (url.searchParams.get("scope") ?? "full") as ContextScope;
      if (!CONTEXT_SCOPES.includes(scope)) {
        sendJson(res, 400, { error: `invalid scope "${scope}"` });
        return;
      }
      // Join the shared single-flight rebuild so a cold /context can never run
      // a second build concurrently with POST /snapshot.
      const cached = deps.service.getCached(scope);
      sendJson(res, 200, cached ?? filterScope(await rebuildShared(), scope));
      return;
    }

    if (route === "GET /api/internal/license") {
      sendJson(res, 200, {
        installed: deps.pro !== null,
        active: deps.proActive,
        status: deps.pro?.licenseStatus() ?? null,
        features: (deps.proActive && deps.pro?.ui?.features()) || NO_FEATURES,
        licenseInfo: deps.proActive ? (deps.pro?.ui?.licenseInfo?.() ?? null) : null,
      });
      return;
    }

    if (route === "POST /api/internal/license") {
      let key: unknown;
      try {
        key = (await readJsonBody(req) as { key?: unknown }).key;
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : "invalid body" });
        return;
      }
      if (typeof key !== "string" || key.length === 0) {
        sendJson(res, 400, { error: "body must be {\"key\": string}" });
        return;
      }
      const inspection = inspectLicenseKey(key);
      if (!inspection.ok) {
        sendJson(res, 400, { error: `refusing to store license: ${inspection.detail}` });
        return;
      }
      try {
        const { detail } = storeLicenseKey(key, deps.homedir);
        sendJson(res, 200, { stored: true, detail, restartRequired: true });
      } catch (error) {
        console.error(
          `ctxfile ui: failed to store license key: ${error instanceof Error ? error.message : String(error)}`
        );
        sendJson(res, 500, { error: "failed to store license" });
      }
      return;
    }

    if (route === "GET /api/internal/memory") {
      const ui = proGate(deps, "memory", res);
      if (ui) sendJson(res, 200, { entries: await ui.listMemory() });
      return;
    }

    if ((req.method ?? "") === "DELETE" && url.pathname.startsWith("/api/internal/memory/")) {
      const ui = proGate(deps, "memory", res);
      if (ui) {
        let id: string;
        try {
          id = decodeURIComponent(url.pathname.slice("/api/internal/memory/".length));
        } catch {
          sendJson(res, 400, { error: "bad path" });
          return;
        }
        // Pro memory ids are opaque and never contain "/"; reject defensively.
        if (id.includes("/")) {
          sendJson(res, 400, { error: "bad path" });
          return;
        }
        sendJson(res, 200, { forgotten: await ui.forgetMemory(id) });
      }
      return;
    }

    if (route === "POST /api/internal/consult") {
      const ui = proGate(deps, "consult", res);
      if (!ui) return;
      if (!ui.consult) {
        sendJson(res, 501, { error: "consult UI streaming not implemented by this pro version" });
        return;
      }
      // SSE streaming over the POST response; writeSse arrives in Task 7.
      await streamConsult(req, res, ui);
      return;
    }

    // POST /api/internal/snapshot and GET /api/internal/events are added in Task 7.
    if (await handleSnapshotRoutes(req, res, url)) return;

    sendJson(res, 404, { error: "not found" });
  }

  // --- SSE hub -------------------------------------------------------------
  const sseClients = new Set<ServerResponse>();

  function openSse(res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
    });
    res.write(":ok\n\n");
    sseClients.add(res);
    res.on("close", () => sseClients.delete(res));
    res.on("error", () => sseClients.delete(res));
  }

  function broadcast(eventName: string, data: unknown): void {
    const frame = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(frame);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  // --- single-flight snapshot runner ----------------------------------------
  // Shared by POST /snapshot and cold GET /context so at most one rebuild runs.
  let inflight: Promise<ContextObject> | null = null;
  let jobCounter = 0;

  function rebuildShared(): Promise<ContextObject> {
    if (!inflight) {
      inflight = Promise.resolve()
        .then(() => deps.service.rebuild((event) => broadcast(event.type, event)))
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  }

  function startSnapshotJob(): { jobId: number; alreadyRunning: boolean } {
    if (inflight) return { jobId: jobCounter, alreadyRunning: true };
    jobCounter += 1;
    const jobId = jobCounter;
    rebuildShared().catch((error: unknown) => {
      broadcast("error", { message: error instanceof Error ? error.message : String(error) });
    });
    return { jobId, alreadyRunning: false };
  }

  async function handleSnapshotRoutes(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const route = `${req.method ?? "GET"} ${url.pathname}`;
    if (route === "POST /api/internal/snapshot") {
      sendJson(res, 202, startSnapshotJob());
      return true;
    }
    if (route === "GET /api/internal/events") {
      openSse(res);
      return true;
    }
    return false;
  }

  async function streamConsult(req: IncomingMessage, res: ServerResponse, ui: NonNullable<ProModule["ui"]>): Promise<void> {
    let question: unknown;
    try {
      question = (await readJsonBody(req) as { question?: unknown }).question;
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "invalid body" });
      return;
    }
    if (typeof question !== "string" || question.length === 0) {
      sendJson(res, 400, { error: "body must be {\"question\": string}" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
    });
    try {
      await ui.consult!(question, (event) => {
        try {
          res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
        } catch {
          // client gone; ignore
        }
      });
    } catch (error) {
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ message: error instanceof Error ? error.message : String(error) })}\n\n`);
      } catch {
        // client gone; ignore
      }
    }
    res.end();
  }

  function handleStatic(req: IncomingMessage, res: ServerResponse, url: URL): void {
    if ((req.method ?? "GET") !== "GET") {
      sendJson(res, 405, { error: "method not allowed" });
      return;
    }
    if (!deps.staticDir) {
      sendJson(res, 404, { error: "dashboard assets not built — run the dashboard build (Plan 3)" });
      return;
    }
    const staticRoot = path.resolve(deps.staticDir);
    // decodeURIComponent defeats %2f-encoded traversal; resolve then prefix-check defeats the rest.
    let requested: string;
    try {
      requested = decodeURIComponent(url.pathname);
    } catch {
      sendJson(res, 400, { error: "bad path" });
      return;
    }
    let filePath = path.resolve(staticRoot, "." + path.posix.normalize("/" + requested));
    if (filePath !== staticRoot && !filePath.startsWith(staticRoot + path.sep)) {
      sendJson(res, 403, { error: "forbidden" });
      return;
    }
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      const ext = path.extname(filePath);
      if (ext && ext !== ".html") {
        sendJson(res, 404, { error: "not found" });
        return;
      }
      filePath = path.join(staticRoot, "index.html"); // SPA fallback
      if (!existsSync(filePath)) {
        sendJson(res, 404, { error: "dashboard assets not built — run the dashboard build (Plan 3)" });
        return;
      }
    }
    // Resolve symlinks before streaming: the prefix check above only validates filePath's own
    // path, not where a symlink inside staticDir might point. Compare against the resolved root
    // (not staticRoot) — on macOS, tmpdir paths are themselves symlinks (/var -> /private/var),
    // so comparing against the unresolved root would reject legitimate files.
    let realPath: string;
    let realRoot: string;
    try {
      realPath = realpathSync(filePath);
      realRoot = realpathSync(staticRoot);
    } catch {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    if (realPath !== realRoot && !realPath.startsWith(realRoot + path.sep)) {
      sendJson(res, 403, { error: "forbidden" });
      return;
    }
    const ext = path.extname(filePath);
    const headers: Record<string, string> = {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    };
    if (ext === ".html") headers["Content-Security-Policy"] = CSP;
    res.writeHead(200, headers);
    createReadStream(realPath).pipe(res);
  }

  return server;
}

export async function listenOnAvailablePort(server: Server, startPort: number, attempts = 10): Promise<number> {
  // startPort 0 = OS-assigned ephemeral port (tests); a single attempt suffices.
  const ports = startPort === 0 ? [0] : Array.from({ length: attempts }, (_, i) => startPort + i);
  for (const port of ports) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: NodeJS.ErrnoException): void => {
          server.removeListener("listening", onListening);
          reject(error);
        };
        const onListening = (): void => {
          server.removeListener("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, "127.0.0.1");
      });
      return (server.address() as AddressInfo).port;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error(`no free port in ${startPort}-${startPort + attempts - 1}; pass --port to choose another range`);
}
