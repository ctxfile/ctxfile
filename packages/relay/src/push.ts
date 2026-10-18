import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import {
  decryptBlob,
  isTaskApproved,
  normalizeTask,
  parseSyncPayload,
  parseTaskRecord,
  sanitizeTaskText,
  verifyEffectDecision,
  verifyTaskApproval,
  type TaskRecord,
} from "ctxfile";
import type { KeyProvider } from "./keyring.js";
import type { RelayDb, VaultRow } from "./store.js";
import { readTask, unwrapDataKey } from "./vault-view.js";

/**
 * Push: wake an agent the moment a task is approved for it, instead of
 * waiting for its next session to pull the inbox.
 *
 * Rules that make this safe to run with nobody watching:
 * - Only Standard vaults (the relay must read the task to decide).
 * - Only tasks whose approval signature verifies against a device approval
 *   key enrolled with the vault. An agent cannot approve, so an agent can
 *   never trigger a wake-up for its own proposal.
 * - The event carries a summary (id, thread, title, who, for whom), never the
 *   task text. The woken agent reads the task through the ctxfile tools,
 *   where it arrives as labeled data with the rules attached.
 * - Nothing decrypted is stored: the outbox holds task ids and event types;
 *   the body is rebuilt (and eligibility re-checked) at send time.
 * - Targets are https only; private and link-local addresses are refused at
 *   connect time (after DNS resolution, so rebinding cannot sneak past).
 *
 * Webhooks follow the Standard Webhooks spec (webhook-id, webhook-timestamp,
 * webhook-signature: v1,<base64 HMAC-SHA256 of "id.timestamp.body">), so
 * n8n, Zapier, Make, Hermes and OpenClaw routes can verify them. The Claude
 * Code Routine adapter calls the routine's documented fire endpoint.
 */

export type PushTargetKind = "webhook" | "claude-code-routine";
export type PushEventType = "task.assigned" | "task.effect_decided" | "ping";

export const PUSH_RETRY_SCHEDULE_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
const SEND_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const WORKER_INTERVAL_MS = 5_000;
const BATCH = 20;
/** Claude Code Routines accept 30 fires an hour per routine; stay under it. */
const ROUTINE_FIRES_PER_HOUR = 25;
const ROUTINE_URL = /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9]+\/fire$/;

export interface PushTargetRow {
  id: string;
  vault_id: string;
  kind: PushTargetKind;
  name: string;
  url: string;
  assignee: string;
  secret_wrapped: string;
  created_at: number;
  disabled: number;
  last_status: string | null;
  last_attempt_at: number | null;
}

export interface PushOutboxRow {
  id: number;
  vault_id: string;
  target_id: string;
  event_id: string;
  event_type: PushEventType;
  task_id: string | null;
  attempts: number;
  next_attempt_at: number;
  status: "pending" | "delivered" | "failed" | "skipped";
  last_error: string | null;
  created_at: number;
}

export interface PushOptions {
  /** Allow http:// targets (self-hosted LANs and tests only). */
  allowHttp?: boolean;
  /** Allow private and loopback addresses (self-hosted LANs and tests only). */
  allowPrivate?: boolean;
  /** Clock seam for tests. */
  now?: () => number;
}

export function migratePush(db: RelayDb): void {
  db.db.exec(`
    CREATE TABLE IF NOT EXISTS push_targets (
      id TEXT PRIMARY KEY,
      vault_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      assignee TEXT NOT NULL,
      secret_wrapped TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0,
      last_status TEXT,
      last_attempt_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_push_targets_vault ON push_targets (vault_id);
    CREATE TABLE IF NOT EXISTS push_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vault_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      task_id TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE (target_id, event_id)
    );
    CREATE INDEX IF NOT EXISTS idx_push_outbox_due ON push_outbox (status, next_attempt_at);
  `);
}

/** A fresh Standard Webhooks signing secret. */
export function newWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64")}`;
}

/** Standard Webhooks signature header value for one delivery. */
export function signWebhook(secret: string, id: string, timestampSeconds: number, body: string): string {
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret, "base64");
  const mac = createHmac("sha256", key).update(`${id}.${timestampSeconds}.${body}`).digest("base64");
  return `v1,${mac}`;
}

// ---------------------------------------------------------------------------
// SSRF guard
// ---------------------------------------------------------------------------

function ipv4Private(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** True for loopback, private, link-local, CGNAT, multicast and reserved
    addresses, IPv4 or IPv6 (including IPv4-mapped IPv6). */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return ipv4Private(ip);
  if (!net.isIPv6(ip)) return true;
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Private(mapped[1] as string);
  // URL parsing normalizes IPv4-mapped addresses to hex: ::ffff:c0a8:101.
  const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1] as string, 16);
    const lo = parseInt(mappedHex[2] as string, 16);
    return ipv4Private(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb") ||
    lower.startsWith("ff") ||
    lower.startsWith("64:ff9b:") ||
    lower.startsWith("2001:db8:")
  );
}

export function validateTargetUrl(raw: string, kind: PushTargetKind, options: PushOptions = {}): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "url is not a valid URL" };
  }
  if (url.username || url.password) return { ok: false, error: "url must not carry credentials" };
  if (url.protocol !== "https:" && !(options.allowHttp && url.protocol === "http:")) {
    return { ok: false, error: "push targets must use https://" };
  }
  if (kind === "claude-code-routine" && !ROUTINE_URL.test(url.toString())) {
    return {
      ok: false,
      error: "a Claude Code Routine target must be its fire URL: https://api.anthropic.com/v1/claude_code/routines/trig_.../fire",
    };
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && isPrivateAddress(host) && !options.allowPrivate) {
    return { ok: false, error: "push targets cannot be private, loopback, or link-local addresses" };
  }
  return { ok: true, url };
}

interface SendResult {
  status: number | null;
  error: string | null;
  retryAfterMs: number | null;
}

/** One POST with the SSRF guard enforced at connect time, a timeout, and a
    capped response read. Never throws. */
export function guardedPost(url: URL, headers: Record<string, string>, body: string, options: PushOptions = {}): Promise<SendResult> {
  return new Promise((resolve) => {
    const lookup: net.LookupFunction = (hostname, lookupOptions, callback) => {
      dns.lookup(hostname, { ...lookupOptions, all: true }, (error, addresses) => {
        if (error) return callback(error, "", 4);
        const list = Array.isArray(addresses) ? addresses : [];
        const bad = list.find((a) => isPrivateAddress(a.address));
        if (!options.allowPrivate && (list.length === 0 || bad)) {
          return callback(new Error("refused: target resolves to a private or reserved address"), "", 4);
        }
        const first = list[0];
        if (!first) return callback(new Error("no address"), "", 4);
        if ((lookupOptions as { all?: boolean }).all) {
          (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
          return;
        }
        callback(null, first.address, first.family);
      });
    };
    const transport = url.protocol === "https:" ? https : http;
    const req = transport.request(
      url,
      {
        method: "POST",
        headers: { ...headers, "content-length": Buffer.byteLength(body).toString() },
        lookup,
        timeout: SEND_TIMEOUT_MS,
      },
      (res) => {
        let received = 0;
        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_RESPONSE_BYTES) res.destroy();
        });
        const finish = (): void => {
          const retryAfter = Number(res.headers["retry-after"]);
          resolve({
            status: res.statusCode ?? null,
            error: null,
            retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null,
          });
        };
        res.on("end", finish);
        res.on("close", finish);
      }
    );
    req.on("timeout", () => req.destroy(new Error("timed out after 5s")));
    req.on("error", (error) => resolve({ status: null, error: error.message, retryAfterMs: null }));
    req.end(body);
  });
}

// ---------------------------------------------------------------------------
// The push service
// ---------------------------------------------------------------------------

export interface AddTargetInput {
  kind: PushTargetKind;
  name?: string;
  url: string;
  assignee?: string;
  /** Routine targets: the per-routine bearer token. */
  token?: string;
}

export type AddTargetResult =
  | { ok: true; target: Omit<PushTargetRow, "secret_wrapped">; secret: string | null }
  | { ok: false; error: string };

function eventId(...parts: string[]): string {
  return `msg_${createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32)}`;
}

function publicTarget(row: PushTargetRow): Omit<PushTargetRow, "secret_wrapped"> {
  const { secret_wrapped: _secret, ...rest } = row;
  return rest;
}

export class PushService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly now: () => number;

  constructor(
    private readonly db: RelayDb,
    private readonly keyring: KeyProvider,
    private readonly options: PushOptions = {}
  ) {
    migratePush(db);
    this.now = options.now ?? Date.now;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), WORKER_INTERVAL_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // --- targets ---------------------------------------------------------------

  addTarget(vault: VaultRow, input: AddTargetInput, actor: string): AddTargetResult {
    if (vault.mode !== "standard") return { ok: false, error: "push needs a standard vault: a strict vault's relay cannot read a task to decide whether to wake anyone" };
    if (input.kind !== "webhook" && input.kind !== "claude-code-routine") return { ok: false, error: 'kind must be "webhook" or "claude-code-routine"' };
    const checked = validateTargetUrl(input.url, input.kind, this.options);
    if (!checked.ok) return checked;
    const assignee = (input.assignee ?? (input.kind === "claude-code-routine" ? "claude-code" : "any")).trim().toLowerCase();
    if (!/^(any|[a-z0-9][a-z0-9:-]{0,40})$/.test(assignee)) return { ok: false, error: "assignee must be a client id or any" };
    if (this.listTargets(vault.id).length >= 20) return { ok: false, error: "a vault can have at most 20 push targets" };
    let secret: string;
    if (input.kind === "webhook") {
      secret = newWebhookSecret();
    } else {
      if (!input.token || input.token.length < 20 || input.token.length > 500) {
        return { ok: false, error: "a Claude Code Routine target needs the routine's API token (sk-ant-oat01-...)" };
      }
      secret = input.token;
    }
    const row: PushTargetRow = {
      id: randomUUID(),
      vault_id: vault.id,
      kind: input.kind,
      name: (input.name ?? input.kind).slice(0, 60),
      url: checked.url.toString(),
      assignee,
      secret_wrapped: this.keyring.wrap(new Uint8Array(Buffer.from(secret, "utf8"))),
      created_at: this.now(),
      disabled: 0,
      last_status: null,
      last_attempt_at: null,
    };
    this.db.db
      .prepare(
        `INSERT INTO push_targets (id, vault_id, kind, name, url, assignee, secret_wrapped, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(row.id, row.vault_id, row.kind, row.name, row.url, row.assignee, row.secret_wrapped, row.created_at);
    this.db.audit({ vaultId: vault.id, actor, action: "push.target_add", detail: { target: row.id, kind: row.kind, assignee } });
    // The webhook secret is shown once; a routine token is the user's own and never echoed.
    return { ok: true, target: publicTarget(row), secret: input.kind === "webhook" ? secret : null };
  }

  listTargets(vaultId: string): Omit<PushTargetRow, "secret_wrapped">[] {
    return (this.db.db.prepare("SELECT * FROM push_targets WHERE vault_id = ? ORDER BY created_at").all(vaultId) as PushTargetRow[]).map(publicTarget);
  }

  removeTarget(vaultId: string, id: string, actor: string): boolean {
    const removed = this.db.db.prepare("DELETE FROM push_targets WHERE vault_id = ? AND id = ?").run(vaultId, id).changes > 0;
    if (removed) {
      this.db.db.prepare("DELETE FROM push_outbox WHERE target_id = ? AND status = 'pending'").run(id);
      this.db.audit({ vaultId, actor, action: "push.target_remove", detail: { target: id } });
    }
    return removed;
  }

  outbox(vaultId: string, limit = 50): PushOutboxRow[] {
    return this.db.db.prepare("SELECT * FROM push_outbox WHERE vault_id = ? ORDER BY id DESC LIMIT ?").all(vaultId, limit) as PushOutboxRow[];
  }

  private target(id: string): PushTargetRow | null {
    return (this.db.db.prepare("SELECT * FROM push_targets WHERE id = ?").get(id) as PushTargetRow | undefined) ?? null;
  }

  // --- deciding what to send ---------------------------------------------------

  /** Called after a device stores a blob: if it is a task, consider it. */
  async onBlobStored(vault: VaultRow, blobId: string): Promise<void> {
    if (vault.mode !== "standard" || !vault.wrapped_data_key_b64) return;
    if (this.listTargets(vault.id).length === 0) return;
    const blob = this.db.getBlob(vault.id, blobId);
    if (!blob) return;
    try {
      const payload = parseSyncPayload(await decryptBlob(unwrapDataKey(this.keyring, vault), blob.data, blobId));
      if (payload?.kind !== "task") return;
      const task = parseTaskRecord(payload);
      if (task) this.onTask(vault, task);
    } catch {
      // Not decryptable or not a task: nothing to push.
    }
  }

  /** Enqueues the events this task state calls for (idempotent per event). */
  onTask(vault: VaultRow, raw: TaskRecord): void {
    if (vault.mode !== "standard") return;
    const now = this.now();
    const task = normalizeTask(raw, now);
    const keys = this.db.approverKeyIds(vault.id);
    const targets = this.listTargets(vault.id).filter((t) => t.disabled === 0);
    if (targets.length === 0) return;
    const enqueue = (targetId: string, id: string, type: PushEventType): void => {
      this.db.db
        .prepare(
          `INSERT INTO push_outbox (vault_id, target_id, event_id, event_type, task_id, next_attempt_at, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?) ON CONFLICT (target_id, event_id) DO NOTHING`
        )
        .run(vault.id, targetId, id, type, task.task_id, now, now);
    };
    if (this.assignedEligible(task, keys, now)) {
      const id = eventId(task.task_id, "task.assigned", String(task.approval?.at ?? 0));
      for (const target of targets) {
        if (this.matches(target.assignee, task.assignee)) enqueue(target.id, id, "task.assigned");
      }
    }
    const decision = task.effect_decisions[task.effect_decisions.length - 1];
    if (task.state === "claimed" && task.lease && decision && verifyEffectDecision(task.task_id, decision, keys)) {
      const id = eventId(task.task_id, "task.effect_decided", decision.effect_hash, decision.decision, String(decision.at));
      for (const target of targets) {
        if (this.matches(target.assignee, task.lease.harness)) enqueue(target.id, id, "task.effect_decided");
      }
    }
  }

  private matches(targetAssignee: string, taskAssignee: string): boolean {
    return targetAssignee === "any" || taskAssignee === "any" || targetAssignee === taskAssignee;
  }

  private assignedEligible(task: TaskRecord, keys: ReadonlySet<string>, now: number): boolean {
    return task.state === "pending" && isTaskApproved(task, now) && verifyTaskApproval(task, keys);
  }

  // --- sending -----------------------------------------------------------------

  /** Delivers due events. Exposed for tests; the timer calls it. */
  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let sent = 0;
    try {
      const due = this.db.db
        .prepare("SELECT * FROM push_outbox WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY next_attempt_at LIMIT ?")
        .all(this.now(), BATCH) as PushOutboxRow[];
      for (const row of due) {
        if (await this.deliver(row)) sent += 1;
      }
    } finally {
      this.running = false;
    }
    return sent;
  }

  /** Sends one test event right away and reports the result. */
  async test(vault: VaultRow, targetId: string, actor: string): Promise<{ ok: boolean; status: number | null; error: string | null }> {
    const target = this.target(targetId);
    if (!target || target.vault_id !== vault.id) return { ok: false, status: null, error: "no such push target in this vault" };
    const id = eventId("ping", targetId, String(this.now()));
    const result = await this.send(target, id, "ping", null);
    this.db.audit({ vaultId: vault.id, actor, action: "push.test", detail: { target: targetId, status: result.status } });
    return { ok: result.status !== null && result.status >= 200 && result.status < 300, status: result.status, error: result.error };
  }

  private async deliver(row: PushOutboxRow): Promise<boolean> {
    const now = this.now();
    const target = this.target(row.target_id);
    const vault = this.db.getVault(row.vault_id);
    const finish = (status: PushOutboxRow["status"], error: string | null): void => {
      this.db.db.prepare("UPDATE push_outbox SET status = ?, last_error = ? WHERE id = ?").run(status, error, row.id);
    };
    if (!target || !vault || target.disabled === 1) {
      finish("skipped", "target removed or disabled");
      return false;
    }
    // Re-check eligibility against the task as it is now.
    const current = row.task_id ? await readTask(this.db, this.keyring, vault, row.task_id) : null;
    const task = current ? normalizeTask(current.task, now) : null;
    const keys = this.db.approverKeyIds(vault.id);
    if (row.event_type === "task.assigned" && (!task || !this.assignedEligible(task, keys, now))) {
      finish("skipped", "task no longer waiting (claimed, edited, expired, or approval no longer valid)");
      return false;
    }
    if (row.event_type === "task.effect_decided" && (!task || task.state !== "claimed")) {
      finish("skipped", "task no longer claimed");
      return false;
    }
    if (target.kind === "claude-code-routine" && this.recentFires(target.id, now) >= ROUTINE_FIRES_PER_HOUR) {
      this.db.db.prepare("UPDATE push_outbox SET next_attempt_at = ? WHERE id = ?").run(now + 10 * 60_000, row.id);
      return false;
    }
    const result = await this.send(target, row.event_id, row.event_type, task);
    const attempts = row.attempts + 1;
    const ok = result.status !== null && result.status >= 200 && result.status < 300;
    this.db.db.prepare("UPDATE push_targets SET last_status = ?, last_attempt_at = ? WHERE id = ?").run(
      ok ? "ok" : result.status !== null ? `http ${result.status}` : (result.error ?? "error"),
      now,
      target.id
    );
    if (ok) {
      this.db.db.prepare("UPDATE push_outbox SET status = 'delivered', attempts = ?, last_error = NULL WHERE id = ?").run(attempts, row.id);
      this.db.audit({ vaultId: vault.id, actor: "push", action: "push.sent", detail: { target: target.id, event: row.event_type, task: row.task_id } });
      return true;
    }
    // 4xx other than 408/429 will not get better by retrying.
    const permanent = result.status !== null && result.status >= 400 && result.status < 500 && result.status !== 408 && result.status !== 429;
    const delay = PUSH_RETRY_SCHEDULE_MS[attempts - 1];
    if (permanent || delay === undefined) {
      this.db.db.prepare("UPDATE push_outbox SET status = 'failed', attempts = ?, last_error = ? WHERE id = ?").run(
        attempts,
        result.error ?? `http ${result.status}`,
        row.id
      );
      this.db.audit({ vaultId: vault.id, actor: "push", action: "push.failed", detail: { target: target.id, event: row.event_type, task: row.task_id, status: result.status } });
      return false;
    }
    const next = now + Math.max(delay, result.retryAfterMs ?? 0);
    this.db.db.prepare("UPDATE push_outbox SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?").run(
      attempts,
      next,
      result.error ?? `http ${result.status}`,
      row.id
    );
    return false;
  }

  private recentFires(targetId: string, now: number): number {
    return (
      this.db.db
        .prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'push.sent' AND ts >= ? AND detail LIKE ?")
        .get(now - 3_600_000, `%"target":"${targetId}"%`) as { n: number }
    ).n;
  }

  /** The summary an event carries: never the task text. */
  static summary(task: TaskRecord | null): Record<string, unknown> | null {
    if (!task) return null;
    return {
      task_id: task.task_id,
      thread: task.thread,
      title: sanitizeTaskText(task.title).slice(0, 120),
      assignee: task.assignee,
      from: task.origin === "human" ? "user" : task.posted_by.harness,
      state: task.state,
      read_with: `list_tasks with task_id "${task.task_id}" (ctxfile MCP tools)`,
    };
  }

  /** The exact request a delivery makes (headers and body), for one target
      kind. Pure, so tests can check the wire format without the network. */
  static buildDelivery(
    target: Pick<PushTargetRow, "kind">,
    secret: string,
    id: string,
    type: PushEventType,
    task: TaskRecord | null,
    nowSeconds: number
  ): { headers: Record<string, string>; body: string } {
    if (target.kind === "webhook") {
      const body = JSON.stringify({
        type,
        timestamp: new Date(nowSeconds * 1000).toISOString(),
        data: PushService.summary(task) ?? { message: "ctxfile push test" },
      });
      return {
        body,
        headers: {
          "content-type": "application/json",
          "user-agent": "ctxfile-relay-push",
          "webhook-id": id,
          "webhook-timestamp": String(nowSeconds),
          "webhook-signature": signWebhook(secret, id, nowSeconds, body),
        },
      };
    }
    // Claude Code Routine: the run receives `text` wrapped as untrusted data;
    // the routine's own prompt decides to act on it (see the ctxfile docs).
    const summary = PushService.summary(task);
    const text = summary
      ? [
          `ctxfile ${type === "task.effect_decided" ? "effect decided on" : "task waiting:"} ${String(summary.task_id)}`,
          `Thread: ${String(summary.thread)}`,
          `Title (agent-written data): ${String(summary.title)}`,
          `From: ${String(summary.from)}. For: ${String(summary.assignee)}.`,
          `Read it with the ctxfile connector: list_tasks with task_id "${String(summary.task_id)}", then follow the rules in that result.`,
        ].join("\n")
      : "ctxfile push test: no task. Nothing to do.";
    return {
      body: JSON.stringify({ text }),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "user-agent": "ctxfile-relay-push",
      },
    };
  }

  private async send(target: PushTargetRow, id: string, type: PushEventType, task: TaskRecord | null): Promise<SendResult> {
    const checked = validateTargetUrl(target.url, target.kind, this.options);
    if (!checked.ok) return { status: null, error: checked.error, retryAfterMs: null };
    const secret = Buffer.from(this.keyring.unwrap(target.secret_wrapped)).toString("utf8");
    const delivery = PushService.buildDelivery(target, secret, id, type, task, Math.floor(this.now() / 1000));
    return guardedPost(checked.url, delivery.headers, delivery.body, this.options);
  }
}
