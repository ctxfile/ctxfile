/**
 * In-browser stand-in for the `ctxfile ui` API, used by the public demo at
 * ctxfile.dev/demo. It intercepts `fetch` for `/api/internal/*` and answers
 * from fixtures, including the SSE streams a real snapshot run and a consult
 * produce. The dashboard code is untouched: it talks to the same paths with
 * the same contract, so the demo shows exactly what a local install renders.
 */

import type {
  ConnectorStatus,
  ContextObject,
  ContextScope,
  DashboardState,
  LicenseState,
  MemoryEntry,
  PlaybookEntry,
} from "../lib/types";

const START = Date.now();
const iso = (msAgo: number): string => new Date(START - msAgo).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const LICENSE: LicenseState = {
  installed: true,
  active: true,
  status: "active",
  features: { sessions: true, memory: true, consult: true, voice: false },
  licenseInfo: { tier: "pro", expiresAt: iso(-200 * DAY), customerId: null },
};

const CONNECTORS: ConnectorStatus[] = [
  { name: "file", status: "ok", durationMs: 947 },
  { name: "git", status: "ok", durationMs: 512 },
  { name: "notion", status: "skipped", durationMs: 2 },
  { name: "ollama", status: "ok", durationMs: 843 },
  { name: "sessions", status: "ok", durationMs: 188 },
];

const TOKEN_BUDGET = 50_000;
const TOKENS_USED = 18_432;

let latestGeneratedAt = iso(6 * MIN);

const RECENT = Array.from({ length: 14 }, (_, i) => ({
  createdAt: START - (13 - i) * 6 * HOUR,
  tokensUsed: [14_120, 15_880, 16_300, 15_020, 17_440, 18_910, 17_250, 16_780, 19_330, 18_120, 17_960, 18_640, 18_205, TOKENS_USED][i] ?? TOKENS_USED,
}));

function state(): DashboardState {
  return {
    version: "0.5.0",
    root: "/Users/you/projects/acme-checkout",
    license: LICENSE,
    config: {
      tokenBudget: TOKEN_BUDGET,
      maxFileTokens: 4_000,
      cacheMaxAgeMs: 30 * MIN,
      include: [],
      exclude: [],
      notion: { configured: false, pageCount: 0 },
      ollama: { summarize: true, model: "qwen3:8b", baseUrl: "http://127.0.0.1:11434" },
      consult: {
        providers: [
          { type: "anthropic", model: "claude-sonnet-5" },
          { type: "openrouter", model: "openrouter/auto" },
        ],
      },
      voice: { configured: false },
      telemetry: { enabled: false },
    },
    latest: { generatedAt: latestGeneratedAt, tokensUsed: TOKENS_USED, tokenBudget: TOKEN_BUDGET, connectors: CONNECTORS },
    recent: RECENT,
  };
}

const PLAN = `# Checkout flow: ship it this sprint

## Goal
Replace the legacy checkout with the new webhook-driven flow. Receipts go out within 30 seconds of \`order.paid\`.

## Decisions
- Verify every webhook with the **Standard Webhooks** signature scheme, not the vendor SDK.
- Idempotency key = provider event id; store it before any side effect.
- Receipt template lives in \`src/payments/receipt.ts\`, rendered server-side.

## Open items
- [x] Signature verification with replay window
- [x] Idempotent event store
- [ ] Receipt email template review
- [ ] Load test: 200 events/min sustained

> Nothing in this file is shared with a model provider unless you run consult.
`;

const WEBHOOK_TS = `import { verifySignature } from "./signature";
import { events } from "./store";
import { sendReceipt } from "./receipt";

const REPLAY_WINDOW_MS = 5 * 60 * 1000;
const SECRET = process.env.WEBHOOK_SECRET ?? "[REDACTED:secret]";

export async function handleWebhook(req: Request): Promise<Response> {
  const raw = await req.text();
  const id = req.headers.get("webhook-id");
  const ts = Number(req.headers.get("webhook-timestamp"));
  if (!id || !Number.isFinite(ts)) return new Response("bad request", { status: 400 });

  // Reject anything outside the replay window before touching crypto.
  if (Math.abs(Date.now() - ts * 1000) > REPLAY_WINDOW_MS) {
    return new Response("stale", { status: 400 });
  }
  if (!verifySignature(SECRET, id, ts, raw, req.headers.get("webhook-signature"))) {
    return new Response("invalid signature", { status: 401 });
  }

  const event = JSON.parse(raw) as { type: string; data: { orderId: string; email: string } };
  if (!(await events.claim(id))) return new Response(null, { status: 200 }); // duplicate

  if (event.type === "order.paid") {
    await sendReceipt(event.data.orderId, event.data.email);
  }
  return new Response(null, { status: 200 });
}
`;

const RECEIPT_TS = `import { render } from "./template";
import { mailer } from "../lib/mailer";

export interface Receipt {
  orderId: string;
  total: number;
  currency: string;
  lines: { sku: string; qty: number; unit: number }[];
}

export async function sendReceipt(orderId: string, email: string): Promise<void> {
  const receipt = await loadReceipt(orderId);
  const html = render("receipt", receipt);
  await mailer.send({ to: email, subject: \`Your receipt for \${orderId}\`, html });
}

async function loadReceipt(orderId: string): Promise<Receipt> {
  // TODO: read from the orders table once the migration lands
  return { orderId, total: 4900, currency: "USD", lines: [{ sku: "laptop-stand", qty: 1, unit: 4900 }] };
}
`;

const SIGNATURE_TS = `import { createHmac, timingSafeEqual } from "node:crypto";

/** Standard Webhooks: v1,<base64(hmac-sha256(secret, "id.ts.body"))> */
export function verifySignature(secret: string, id: string, ts: number, body: string, header: string | null): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64"))
    .update(\`\${id}.\${ts}.\${body}\`)
    .digest("base64");
  return header.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    return version === "v1" && sig !== undefined && safeEqual(sig, expected);
  });
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
`;

const README_MD = `# acme-checkout

Payments service for the Acme storefront. Node 22, TypeScript, Postgres.

## Run

\`\`\`bash
npm install
npm run dev
\`\`\`

## Webhooks

Incoming provider events land on \`POST /webhooks/payments\`. Every event is verified,
claimed once by id, and only then acted on. See \`src/payments/webhook.ts\`.
`;

const CONFIG_YAML = `service: acme-checkout
runtime: node22
env:
  DATABASE_URL: [REDACTED:url]
  WEBHOOK_SECRET: [REDACTED:secret]
  MAIL_FROM: receipts@acme.example
scaling:
  min: 1
  max: 4
`;

const KEY_FILES = [
  { path: "src/payments/webhook.ts", content: WEBHOOK_TS, tokens: 1284, truncated: false, redactions: 1 },
  { path: "src/payments/receipt.ts", content: RECEIPT_TS, tokens: 911, truncated: false, redactions: 0 },
  { path: "src/payments/signature.ts", content: SIGNATURE_TS, tokens: 640, truncated: false, redactions: 0 },
  { path: "docs/PLAN.md", content: PLAN, tokens: 402, truncated: false, redactions: 0 },
  { path: "README.md", content: README_MD, tokens: 210, truncated: false, redactions: 0 },
  { path: "deploy/config.yaml", content: CONFIG_YAML, tokens: 96, truncated: false, redactions: 2 },
];

const GIT = {
  branch: "feat/checkout",
  staged: ["src/payments/signature.ts"],
  modified: ["src/payments/webhook.ts", "docs/PLAN.md"],
  untracked: ["src/payments/receipt.test.ts"],
  ahead: 2,
  behind: 0,
  commits: [
    { hash: "9f3a1c2e7b", date: iso(2 * HOUR), message: "feat: verify webhook signatures with a replay window", author: "Ada" },
    { hash: "b41e770c1a", date: iso(9 * HOUR), message: "chore: checkout scaffolding and event store", author: "Ada" },
    { hash: "72c0d9e4f1", date: iso(1 * DAY + 3 * HOUR), message: "docs: plan the checkout cutover", author: "Lin" },
    { hash: "e8a54b7d20", date: iso(2 * DAY), message: "fix: mailer retries on transient SMTP errors", author: "Lin" },
    { hash: "0d1f6a9c33", date: iso(3 * DAY + 5 * HOUR), message: "test: receipt template snapshot", author: "Ada" },
  ],
  diffSummary:
    " src/payments/webhook.ts   | 41 ++++++++++++++++++-------\n src/payments/signature.ts | 22 ++++++++++++++\n docs/PLAN.md              | 12 +++++---\n 3 files changed, 62 insertions(+), 13 deletions(-)",
};

const SESSIONS = [
  {
    source: "claude-code",
    sessionId: "a1b2c3d4e5f6",
    startedAt: iso(3 * HOUR),
    lastActiveAt: iso(40 * MIN),
    turnCount: 42,
    digest:
      "Implemented **Standard Webhooks** signature verification with a 5-minute replay window and a timing-safe compare.\n\n- Decided against the vendor SDK: it pins an older signing scheme.\n- Added `events.claim(id)` so duplicate deliveries are no-ops.\n- Open: receipt template still uses a stub order loader.",
  },
  {
    source: "cursor",
    sessionId: "e5f6a7b8c9d0",
    startedAt: iso(1 * DAY + 2 * HOUR),
    lastActiveAt: iso(1 * DAY),
    turnCount: 18,
    digest: "Explored the mailer retry path and wrote the receipt template snapshot test. Flagged that `MAIL_FROM` is read at import time.",
  },
  {
    source: "codex",
    sessionId: "1122aabbccdd",
    startedAt: iso(2 * DAY + 6 * HOUR),
    lastActiveAt: iso(2 * DAY + 5 * HOUR),
    turnCount: 9,
    digest: "Drafted the checkout cutover plan and the load-test target (200 events/min).",
  },
];

const NOTES = [
  {
    source: "obsidian",
    vault: "engineering",
    path: "Payments/Webhook verification.md",
    title: "Webhook verification",
    tags: ["payments", "security"],
    modifiedAt: iso(5 * HOUR),
    pinned: true,
    tokens: 318,
    truncated: false,
    redactions: 0,
    content:
      "# Webhook verification\n\nWhat we learned the hard way with the previous provider:\n\n- **Verify before parse.** Never `JSON.parse` an unverified body; a malformed payload should fail closed.\n- **Replay window of 5 minutes.** Longer and retries collide; shorter and clock skew bites.\n- **Claim the event id first**, then act. The claim is what makes retries safe.\n\nSee [[Idempotency keys]] for the storage side and [[Incident 04-12]] for why this note exists.",
    links: [
      { title: "Idempotency keys", firstLine: "Provider event id is the key; never the order id." },
      { title: "Incident 04-12", firstLine: "Duplicate receipts sent after a provider retry storm." },
    ],
  },
  {
    source: "obsidian",
    vault: "engineering",
    path: "Payments/Idempotency keys.md",
    title: "Idempotency keys",
    tags: ["payments"],
    modifiedAt: iso(2 * DAY),
    pinned: false,
    tokens: 142,
    truncated: false,
    redactions: 0,
    content:
      "# Idempotency keys\n\nProvider event id is the key; never the order id (one order can emit several events). Store the claim in the same transaction as the side effect, or accept that a crash between the two re-sends.",
    links: [],
  },
];

const SESSION_SUMMARY =
  "Across three sessions the checkout flow moved from scaffolding to a verified, idempotent webhook handler. Signature verification and the event store are done; the receipt template and a load test remain. One config concern: `MAIL_FROM` is read at import time.";

function context(scope: ContextScope): ContextObject {
  const base: ContextObject = {
    meta: {
      name: "acme-checkout",
      version: "0.5.0",
      generatedAt: latestGeneratedAt,
      root: "/Users/you/projects/acme-checkout",
      tokenBudget: TOKEN_BUDGET,
      tokensUsed: TOKENS_USED,
      connectors: CONNECTORS,
    },
    plan: PLAN,
    keyFiles: KEY_FILES,
    gitState: GIT,
    notionPages: [],
    sessions: SESSIONS,
    notes: NOTES,
    sessionSummary: SESSION_SUMMARY,
  };
  if (scope === "plan") return { ...base, keyFiles: [], gitState: null, sessions: [], notes: [], sessionSummary: null, meta: { ...base.meta, tokensUsed: 402 } };
  if (scope === "files") return { ...base, plan: null, gitState: null, sessions: [], notes: [], sessionSummary: null, meta: { ...base.meta, tokensUsed: 3_543 } };
  if (scope === "git") return { ...base, plan: null, keyFiles: [], sessions: [], notes: [], sessionSummary: null, meta: { ...base.meta, tokensUsed: 1_830 } };
  return base;
}

let memory: MemoryEntry[] = [
  { id: "m1", agentId: "claude-code", content: "Prefer explicit error types over string matching in the payments layer.", createdAt: iso(2 * HOUR), provenance: "session a1b2c3d4" },
  { id: "m2", agentId: "claude-code", content: "Webhook secrets are base64 after the `whsec_` prefix; never log them.", createdAt: iso(3 * HOUR), provenance: "session a1b2c3d4" },
  { id: "m3", agentId: "cursor", content: "Release checklist lives in RELEASING.md; version bumps go through changesets.", createdAt: iso(1 * DAY), provenance: "session e5f6a7b8" },
  { id: "m4", agentId: "codex", content: "Load-test target for checkout is 200 events/min sustained for 10 minutes.", createdAt: iso(2 * DAY), provenance: "session 1122aabb" },
];

let playbooks: PlaybookEntry[] = [
  {
    id: "p1",
    title: "Verify a provider webhook end to end",
    prompt:
      "Given <provider> and its signing scheme, implement verification with a replay window, a timing-safe compare, and an idempotent event store keyed by <event id>. Write the negative-path tests first: bad signature, stale timestamp, duplicate delivery. Only then wire the side effect.",
    provenance: "distilled by claude from 2 sessions in thread “checkout webhooks”",
    createdAt: iso(5 * HOUR),
  },
  {
    id: "p3",
    title: "Write an incident postmortem people will actually read",
    prompt:
      "For <incident>, reconstruct the timeline from logs and chat before writing a word. State impact in customer terms first, then the trigger, then the contributing causes (never a single root cause). List what detected it, what should have, and the three fixes with owners and dates. Blameless tone; name systems, not people.",
    provenance: "distilled by claude from 1 session in thread “payments outage 04-12”",
    createdAt: iso(1 * DAY + 4 * HOUR),
  },
  {
    id: "p4",
    title: "Onboard a new engineer to this codebase",
    prompt:
      "Give <engineer> the current plan, the three most-touched directories from git, and the one decision most likely to surprise them (see plan). Pair them on a <small task> that crosses the webhook and receipt modules, and have them write down every question; the questions become the next docs pass.",
    provenance: "distilled by ollama/qwen3:8b from 2 sessions in thread “onboarding”",
    createdAt: iso(4 * DAY),
  },
  {
    id: "p2",
    title: "Ship a feature end to end",
    prompt:
      "Given <feature>, validate demand first, design the smallest correct schema change, keep writes append-safe, test every layer including the negative paths, then release: gate, versions together, publish in dependency order, deploy, verify live.",
    provenance: "distilled by ollama/qwen3:8b from 3 sessions in thread “acme launch”",
    createdAt: iso(3 * DAY),
  },
];

/* --------------------------------------------------------------- streaming */

type Listener = (frame: string) => void;
const eventListeners = new Set<Listener>();
const encoder = new TextEncoder();

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function eventsStream(): Response {
  let listener: Listener | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(":ok\n\n"));
      listener = (frame) => controller.enqueue(encoder.encode(frame));
      eventListeners.add(listener);
    },
    cancel() {
      if (listener !== null) eventListeners.delete(listener);
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function broadcast(event: string, data: unknown): void {
  const frame = sseFrame(event, data);
  for (const l of eventListeners) l(frame);
}

let running = false;

function runSnapshot(): void {
  if (running) return;
  running = true;
  const steps: { at: number; fn: () => void }[] = [];
  let t = 120;
  for (const c of CONNECTORS) {
    const start = t;
    steps.push({ at: start, fn: () => broadcast("build", { type: "connector:start", name: c.name }) });
    t += Math.max(120, Math.min(900, c.durationMs));
    steps.push({ at: t, fn: () => broadcast("build", { type: "connector:done", connector: c }) });
  }
  steps.push({ at: t + 60, fn: () => broadcast("build", { type: "tokens", tokensUsed: TOKENS_USED, tokenBudget: TOKEN_BUDGET }) });
  steps.push({
    at: t + 220,
    fn: () => {
      latestGeneratedAt = new Date().toISOString();
      RECENT.push({ createdAt: Date.now(), tokensUsed: TOKENS_USED });
      if (RECENT.length > 30) RECENT.shift();
      running = false;
      broadcast("build", { type: "done", generatedAt: latestGeneratedAt });
    },
  });
  for (const step of steps) setTimeout(step.fn, step.at);
}

const ANSWERS: Record<string, string> = {
  anthropic:
    "The riskiest part of the current diff is the **replay window** in `webhook.ts`: it compares `Date.now()` against the provider timestamp in seconds, which is correct, but the window is checked *before* the signature. That is fine for cost, yet it means a forged request with a fresh timestamp reaches the HMAC path. Acceptable.\n\nWhat I would change first:\n\n1. `events.claim(id)` runs after verification but before the side effect. Good. Make sure the claim is durable, not in-memory, or a restart re-sends receipts.\n2. `loadReceipt` is a stub returning a fixed order. Ship the migration before enabling `order.paid` in production.\n3. `MAIL_FROM` is read at import time in the mailer; move it into the send call so tests can override it.",
  openrouter:
    "Three observations on `src/payments/webhook.ts`:\n\n- The signature check is timing-safe and versioned (`v1`), so rotating secrets later is straightforward.\n- Returning `200` for duplicates is the right call; providers stop retrying only on 2xx.\n- Consider logging the event `id` (never the body) on the `stale` and `invalid signature` branches so you can tell clock skew from an attack.\n\nThe receipt loader is the real gap: it ignores `orderId`. I would block the cutover on that, not on the load test.",
};

function consultStream(question: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(":ok\n\n"));
      const providers = Object.keys(ANSWERS);
      let pending = providers.length;
      providers.forEach((provider, index) => {
        const text = (ANSWERS[provider] ?? "").replace("{question}", question);
        const words = text.split(/(?<=\s)/);
        let i = 0;
        const tick = (): void => {
          if (i >= words.length) {
            controller.enqueue(encoder.encode(sseFrame("provider:done", { provider })));
            pending -= 1;
            if (pending === 0) controller.close();
            return;
          }
          const chunk = words.slice(i, i + 3).join("");
          i += 3;
          controller.enqueue(encoder.encode(sseFrame("chunk", { provider, text: chunk })));
          setTimeout(tick, 28 + index * 12);
        };
        setTimeout(tick, 300 + index * 500);
      });
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

/* ------------------------------------------------------------------ router */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

async function route(input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const parsed = new URL(url, window.location.origin);
  const path = parsed.pathname.replace(/^.*?(?=\/api\/internal\/)/, "");
  if (!path.startsWith("/api/internal/")) return null;
  // A touch of latency so loading states are visible but never annoying.
  await new Promise((r) => setTimeout(r, 120 + Math.random() * 180));

  if (path === "/api/internal/state" && method === "GET") return json(state());
  if (path === "/api/internal/context" && method === "GET") {
    const scope = (parsed.searchParams.get("scope") ?? "full") as ContextScope;
    return json(context(scope));
  }
  if (path === "/api/internal/snapshot" && method === "POST") {
    const already = running;
    runSnapshot();
    return json({ jobId: Date.now(), alreadyRunning: already });
  }
  if (path === "/api/internal/events" && method === "GET") return eventsStream();
  if (path === "/api/internal/memory" && method === "GET") return json({ entries: memory });
  if (path.startsWith("/api/internal/memory/") && method === "DELETE") {
    const id = decodeURIComponent(path.slice("/api/internal/memory/".length));
    const before = memory.length;
    memory = memory.filter((e) => e.id !== id);
    return json({ forgotten: memory.length < before });
  }
  if (path === "/api/internal/playbooks" && method === "GET") return json({ entries: playbooks });
  if (path.startsWith("/api/internal/playbooks/") && method === "DELETE") {
    const id = decodeURIComponent(path.slice("/api/internal/playbooks/".length));
    const before = playbooks.length;
    playbooks = playbooks.filter((e) => e.id !== id);
    return json({ removed: playbooks.length < before });
  }
  if (path === "/api/internal/license" && method === "GET") return json(LICENSE);
  if (path === "/api/internal/license" && method === "POST") {
    return json({ stored: true, detail: "Demo mode: keys are not stored here", restartRequired: false });
  }
  if (path === "/api/internal/consult" && method === "POST") {
    let question = "";
    try {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { question?: unknown };
      if (typeof body.question === "string") question = body.question;
    } catch {
      // ignore malformed bodies; the stream still runs
    }
    return consultStream(question);
  }
  return json({ error: "not found" }, 404);
}

/** Installs the mock: every `/api/internal/*` request is answered locally. */
export function installMockServer(): void {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const handled = await route(input, init);
    return handled ?? realFetch(input, init);
  };
}
