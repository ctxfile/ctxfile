import { createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  addPushTarget,
  applyHumanAction,
  createTaskRecord,
  createVault,
  enrollApprovalKey,
  IngestStore,
  listPushTargets,
  loadOrCreateApprovalKey,
  openVaultSync,
  postTaskSchema,
  testPushTarget,
  type HumanContext,
  type TaskRecord,
  type VaultConfig,
} from "ctxfile";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadRelayConfig } from "../src/config.js";
import { createRelayContext, startRelay, type RelayContext, type RunningRelay } from "../src/http.js";
import { LocalKeyProvider } from "../src/keyring.js";
import { guardedPost, isPrivateAddress, PushService, signWebhook, validateTargetUrl } from "../src/push.js";
import { RelayDb } from "../src/store.js";
import { writeTask } from "../src/vault-view.js";

const TEST_KDF = { opsLimit: 1, memLimit: 8192 };
const PASSPHRASE = "a-long-test-passphrase";

interface Received {
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** A local webhook receiver; `status` decides how it answers next. */
async function receiver(): Promise<{ url: string; got: Received[]; status: number[]; close: () => Promise<void> }> {
  const got: Received[] = [];
  const status: number[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      got.push({ headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
      res.writeHead(status.shift() ?? 200);
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/hook`, got, status, close: () => new Promise((r) => server.close(() => r())) };
}

/** Verifies a delivery exactly as a Standard Webhooks consumer would. */
function verify(secret: string, r: Received): boolean {
  const id = String(r.headers["webhook-id"]);
  const ts = String(r.headers["webhook-timestamp"]);
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${r.body}`).digest("base64");
  return String(r.headers["webhook-signature"]).split(" ").includes(`v1,${expected}`);
}

describe("push wire format and safety", () => {
  it("signs per the Standard Webhooks spec (reference vector)", () => {
    expect(signWebhook("whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw", "msg_p5jXN8AQM9LWM0D4loKWxJek", 1614265330, '{"test": 2432232314}')).toBe(
      "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE="
    );
  });

  it("refuses private, loopback, link-local and non-https targets by default", () => {
    for (const url of [
      "http://hooks.example.com/x",
      "https://127.0.0.1/x",
      "https://10.1.2.3/x",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/x",
      "https://[::ffff:192.168.1.1]/x",
      "https://user:pass@hooks.example.com/x",
      "not a url",
    ]) {
      expect(validateTargetUrl(url, "webhook").ok).toBe(false);
    }
    expect(validateTargetUrl("https://hooks.example.com/x", "webhook").ok).toBe(true);
    expect(isPrivateAddress("100.64.0.1")).toBe(true);
    expect(isPrivateAddress("fd00::1")).toBe(true);
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
    expect(isPrivateAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
  });

  it("only accepts a real Claude Code Routine fire URL for routine targets", () => {
    expect(validateTargetUrl("https://api.anthropic.com/v1/claude_code/routines/trig_01ABCDEF/fire", "claude-code-routine").ok).toBe(true);
    expect(validateTargetUrl("https://evil.example.com/v1/claude_code/routines/trig_01ABCDEF/fire", "claude-code-routine").ok).toBe(false);
    expect(validateTargetUrl("https://api.anthropic.com/v1/messages", "claude-code-routine").ok).toBe(false);
  });

  it("refuses at connect time a hostname that resolves to a private address", async () => {
    const result = await guardedPost(new URL("http://localhost:9/x"), {}, "{}", { allowHttp: true });
    expect(result.status).toBeNull();
    expect(result.error).toMatch(/private or reserved/);
  });

  it("fires a routine with the documented headers and a summary-only text", () => {
    const task = createTaskRecord(
      postTaskSchema.parse({ thread: "T", title: "Fix CI", instructions: "SECRET PLAN: rm -rf /", assignee: "claude-code" }),
      { now: 1_000, postedBy: { kind: "human", harness: null, door: "cli", client: null, token: null } }
    );
    const delivery = PushService.buildDelivery({ kind: "claude-code-routine" }, "sk-ant-oat01-token", "msg_1", "task.assigned", task, 1);
    expect(delivery.headers).toMatchObject({
      authorization: "Bearer sk-ant-oat01-token",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    });
    const body = JSON.parse(delivery.body) as { text: string };
    expect(Object.keys(body)).toEqual(["text"]);
    expect(body.text).toContain(task.task_id);
    expect(body.text).not.toContain("SECRET PLAN");
    expect(delivery.body.length).toBeLessThan(65_536);
  });
});

describe("push end to end: approve at the desk, the agent's webhook fires", () => {
  let dirs: string[];
  let hub: { ctx: RelayContext; running: RunningRelay };
  let vault: VaultConfig;
  let desk: IngestStore;
  let hook: Awaited<ReturnType<typeof receiver>>;
  let secret = "";
  const root = "/desk";

  beforeAll(async () => {
    dirs = [mkdtempSync(path.join(os.tmpdir(), "cb-push-relay-")), mkdtempSync(path.join(os.tmpdir(), "cb-push-desk-"))];
    const ctx = createRelayContext(
      loadRelayConfig({ dataDir: dirs[0], port: 0, orgId: "org-push", pushAllowHttp: true, pushAllowPrivate: true }, {})
    );
    hub = { ctx, running: await startRelay(ctx) };
    // Tests drive delivery with explicit tick() calls; the background timer
    // would race them.
    ctx.push.stop();
    hook = await receiver();
    desk = new IngestStore(path.join(dirs[1] as string, "ingest.db"));
    vault = (
      await createVault({
        relayUrl: hub.running.publicUrl,
        name: "push-vault",
        mode: "standard",
        passphrase: PASSPHRASE,
        kdf: TEST_KDF,
        configPath: path.join(dirs[1] as string, "vault.json"),
      })
    ).config;
  });

  afterAll(async () => {
    await hub.running.close();
    hub.ctx.db.close();
    await hook.close();
    desk.close();
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it("registers a webhook target and hands back its secret once", async () => {
    const added = await addPushTarget(vault, { kind: "webhook", url: hook.url, assignee: "claude-code", name: "my n8n" });
    expect(added.secret).toMatch(/^whsec_/);
    secret = added.secret as string;
    const listed = await listPushTargets(vault);
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(secret);
    const test = await testPushTarget(vault, added.target.id);
    expect(test.ok).toBe(true);
    expect(verify(secret, hook.got.at(-1)!)).toBe(true);
  });

  it("does not wake anyone for an agent's unapproved proposal", async () => {
    const transport = new StreamableHTTPClientTransport(new URL(`${hub.running.publicUrl}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${vault.token}` } },
    });
    const grok = new Client({ name: "connectors-manager", version: "1" });
    await grok.connect(transport);
    const posted = (await grok.callTool({
      name: "post_task",
      arguments: { thread: "CI", title: "Fix the flaky test", instructions: "The retry test flakes.", assignee: "claude-code" },
    })) as { isError?: boolean };
    expect(posted.isError ?? false).toBe(false);
    await grok.close();
    const before = hook.got.length;
    await hub.ctx.push.tick();
    expect(hook.got.length).toBe(before);
  });

  it("wakes the assignee once the user approves on an enrolled device", async () => {
    const key = loadOrCreateApprovalKey(dirs[1] as string);
    await enrollApprovalKey(vault, key);
    const sync = await openVaultSync(vault, PASSPHRASE, desk, root);
    await sync.sync();
    const task = desk.tasks.list(root).find((t) => t.title === "Fix the flaky test")!;
    const signer: HumanContext = { now: Date.now(), via: "dashboard", signer: { key_id: key.keyId, public_key: key.publicKey, sign: key.sign } };
    expect(desk.tasks.humanAction(root, task.task_id, { kind: "approve" }, signer).ok).toBe(true);
    await sync.sync();
    // The blob push triggers the decision asynchronously; give it a beat.
    await new Promise((r) => setTimeout(r, 50));
    const before = hook.got.length;
    expect(await hub.ctx.push.tick()).toBe(1);
    const delivery = hook.got[before]!;
    expect(verify(secret, delivery)).toBe(true);
    const event = JSON.parse(delivery.body) as { type: string; data: Record<string, unknown> };
    expect(event.type).toBe("task.assigned");
    expect(event.data.task_id).toBe(task.task_id);
    expect(delivery.body).not.toContain("The retry test flakes.");
    // Syncing again does not wake it twice.
    await sync.sync();
    await new Promise((r) => setTimeout(r, 50));
    expect(await hub.ctx.push.tick()).toBe(0);
  });
});

describe("push retries, forged approvals, and stale events", () => {
  let dir: string;
  let db: RelayDb;
  let keyring: LocalKeyProvider;
  let hook: Awaited<ReturnType<typeof receiver>>;
  let clock = 1_800_000_000_000;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cb-push-unit-"));
    db = new RelayDb(dir);
    keyring = new LocalKeyProvider(dir);
    hook = await receiver();
  });

  afterAll(async () => {
    db.close();
    await hook.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function freshVault() {
    const { vault } = db.createVault({
      name: `v-${clock}`,
      mode: "standard",
      salt_b64: "c2FsdA==",
      kdf_ops: null,
      kdf_mem: null,
      wrapped_passphrase_b64: "x",
      wrapped_recovery_b64: "y",
    });
    db.setWrappedDataKey(vault.id, keyring.wrap(new Uint8Array(randomBytes(32))));
    return db.getVault(vault.id)!;
  }

  function approvedTask(signWith: ReturnType<typeof loadOrCreateApprovalKey>): TaskRecord {
    const task = createTaskRecord(
      postTaskSchema.parse({ thread: "T", title: "Deploy notes", instructions: "Write them.", assignee: "any" }),
      { now: clock, postedBy: { kind: "agent", harness: "codex", door: "post_task", client: null, token: null } }
    );
    const approved = applyHumanAction(task, { kind: "approve" }, {
      now: clock + 1,
      via: "dashboard",
      signer: { key_id: signWith.keyId, public_key: signWith.publicKey, sign: signWith.sign },
    });
    if (!approved.ok) throw new Error(approved.error);
    return approved.task;
  }

  it("retries on the schedule after a 500, then delivers", async () => {
    const push = new PushService(db, keyring, { allowHttp: true, allowPrivate: true, now: () => clock });
    const vault = freshVault();
    const key = loadOrCreateApprovalKey(path.join(dir, "k1"));
    db.addApproverKey(vault.id, key.keyId, key.publicKey, "device-1");
    const target = push.addTarget(vault, { kind: "webhook", url: hook.url }, "device-1");
    if (!target.ok) throw new Error(target.error);
    const task = approvedTask(key);
    await writeTask(db, keyring, vault, task, null);
    push.onTask(vault, task);
    hook.status.push(500);
    expect(await push.tick()).toBe(0);
    const [row] = push.outbox(vault.id);
    expect(row?.attempts).toBe(1);
    expect(row?.next_attempt_at).toBe(clock + 60_000);
    expect(await push.tick()).toBe(0); // not due yet
    clock += 61_000;
    expect(await push.tick()).toBe(1);
    expect(push.outbox(vault.id)[0]?.status).toBe("delivered");
  });

  it("ignores approvals signed by a key the vault never enrolled", async () => {
    const push = new PushService(db, keyring, { allowHttp: true, allowPrivate: true, now: () => clock });
    const vault = freshVault();
    const rogue = loadOrCreateApprovalKey(path.join(dir, "rogue"));
    push.addTarget(vault, { kind: "webhook", url: hook.url }, "device-1");
    const task = approvedTask(rogue);
    await writeTask(db, keyring, vault, task, null);
    push.onTask(vault, task);
    expect(push.outbox(vault.id)).toHaveLength(0);
  });

  it("skips an event whose task was claimed before delivery", async () => {
    const push = new PushService(db, keyring, { allowHttp: true, allowPrivate: true, now: () => clock });
    const vault = freshVault();
    const key = loadOrCreateApprovalKey(path.join(dir, "k2"));
    db.addApproverKey(vault.id, key.keyId, key.publicKey, "device-1");
    push.addTarget(vault, { kind: "webhook", url: hook.url }, "device-1");
    const task = approvedTask(key);
    await writeTask(db, keyring, vault, task, null);
    push.onTask(vault, task);
    const claimed: TaskRecord = { ...task, state: "claimed", updated_at: task.updated_at + 5, lease: { harness: "cursor", session_id: null, claimed_at: clock, expires_at: clock + 1_800_000 } };
    await writeTask(db, keyring, vault, claimed, task.updated_at);
    const before = hook.got.length;
    expect(await push.tick()).toBe(0);
    expect(hook.got.length).toBe(before);
    expect(push.outbox(vault.id)[0]?.status).toBe("skipped");
  });

  it("refuses push targets on strict vaults", () => {
    const push = new PushService(db, keyring, {});
    const { vault } = db.createVault({ name: "strict", mode: "strict", salt_b64: "c2FsdA==", kdf_ops: null, kdf_mem: null, wrapped_passphrase_b64: "x", wrapped_recovery_b64: "y" });
    const added = push.addTarget(vault, { kind: "webhook", url: "https://hooks.example.com/x" }, "device-1");
    expect(added.ok).toBe(false);
  });
});
