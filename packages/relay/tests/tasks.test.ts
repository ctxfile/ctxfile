import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  createVault,
  enrollApprovalKey,
  IngestStore,
  loadOrCreateApprovalKey,
  openVaultSync,
  type VaultConfig,
} from "ctxfile";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadRelayConfig } from "../src/config.js";
import { createRelayContext, startRelay, type RelayContext, type RunningRelay } from "../src/http.js";
import { relayGateStats } from "../src/stats.js";

const TEST_KDF = { opsLimit: 1, memLimit: 8192 };
const PASSPHRASE = "a-long-test-passphrase";

type ToolResult = { isError?: boolean; content: { text: string }[]; structuredContent?: Record<string, unknown> };

async function connect(url: string, token: string, name: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name, version: "1.0.0" });
  await client.connect(transport);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as ToolResult;
}

describe("tasks through the relay (Grok -> vault -> ChatGPT, approved at the desk)", () => {
  let dirs: string[];
  let hub: { ctx: RelayContext; running: RunningRelay };
  let vault: VaultConfig;
  let strictVault: VaultConfig;
  let desk: IngestStore;
  const root = "/desk/project";
  const clients: Client[] = [];
  let taskId = "";

  beforeAll(async () => {
    dirs = [mkdtempSync(path.join(os.tmpdir(), "cb-relay-tasks-")), mkdtempSync(path.join(os.tmpdir(), "cb-relay-tasks-desk-"))];
    const ctx = createRelayContext(loadRelayConfig({ dataDir: dirs[0], port: 0, orgId: "org-tasks" }, {}));
    hub = { ctx, running: await startRelay(ctx) };
    desk = new IngestStore(path.join(dirs[1] as string, "ingest.db"));
    vault = (
      await createVault({
        relayUrl: hub.running.publicUrl,
        name: "tasks-vault",
        mode: "standard",
        passphrase: PASSPHRASE,
        kdf: TEST_KDF,
        configPath: path.join(dirs[1] as string, "vault.json"),
      })
    ).config;
    strictVault = (
      await createVault({
        relayUrl: hub.running.publicUrl,
        name: "strict-vault",
        mode: "strict",
        passphrase: PASSPHRASE,
        kdf: TEST_KDF,
        configPath: path.join(dirs[1] as string, "strict.json"),
      })
    ).config;
  });

  afterAll(async () => {
    for (const c of clients) await c.close().catch(() => undefined);
    await hub.running.close();
    hub.ctx.db.close();
    desk.close();
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  async function client(name: string, token = vault.token): Promise<Client> {
    const c = await connect(hub.running.publicUrl, token, name);
    clients.push(c);
    return c;
  }

  it("serves the three task tools and the server instructions", async () => {
    const grok = await client("connectors-manager");
    const { tools } = await grok.listTools();
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["post_task", "list_tasks", "update_task"]));
    expect(tools).toHaveLength(11);
    expect(grok.getInstructions()).toContain("list_tasks");
  });

  it("lets Grok post a proposal for ChatGPT, stored as ciphertext", async () => {
    const grok = await client("connectors-manager");
    const posted = await call(grok, "post_task", {
      thread: "Q4 leads",
      title: "Email the 12 leads",
      instructions: "Draft an intro email to each lead in the sheet and send them.",
      assignee: "chatgpt",
      capabilities: ["read:thread", "draft:content", "send:message"],
    });
    expect(posted.isError ?? false).toBe(false);
    expect(posted.structuredContent?.from).toBe("grok");
    taskId = String(posted.structuredContent?.task_id);
    for (const meta of hub.ctx.db.listBlobs(hub.ctx.db.listVaults()[0]!.id)) {
      const blob = hub.ctx.db.getBlob(hub.ctx.db.listVaults()[0]!.id, meta.id)!;
      expect(Buffer.from(blob.data).toString("utf8")).not.toContain("Email the 12 leads");
    }
  });

  it("shows ChatGPT its inbox and lets it claim the task after asking", async () => {
    const chatgpt = await client("chatgpt");
    const context = await call(chatgpt, "get_context", {});
    expect(context.content[1]?.text).toMatch(/1 task waiting for chatgpt \(1 unapproved proposal\)/);
    const listed = await call(chatgpt, "list_tasks", {});
    expect(listed.content[0]!.text).toContain(taskId);
    const claimed = await call(chatgpt, "update_task", { task_id: taskId, action: "claim" });
    expect(claimed.isError ?? false).toBe(false);
    expect(claimed.content[0]!.text).toContain("NOT approved by the user");
    const again = await call(await client("cursor"), "update_task", { task_id: taskId, action: "claim" });
    expect(again.isError).toBe(true);
  });

  it("counts an approval made at the desk only once the desk's key is enrolled", async () => {
    const sync = await openVaultSync(vault, PASSPHRASE, desk, root);
    await sync.sync();
    const local = desk.tasks.get(root, taskId);
    expect(local?.state).toBe("claimed");
    const key = loadOrCreateApprovalKey(dirs[1] as string);
    const approved = desk.tasks.humanAction(root, taskId, { kind: "approve" }, {
      now: Date.now(),
      via: "cli",
      signer: { key_id: key.keyId, public_key: key.publicKey, sign: key.sign },
    });
    expect(approved.ok).toBe(true);
    expect((await sync.sync()).conflicts).toBe(0);

    const chatgpt = await client("chatgpt");
    const before = await call(chatgpt, "list_tasks", { task_id: taskId });
    expect(before.content[0]!.text).toContain("NOT approved by the user");

    expect(await enrollApprovalKey(vault, key)).toBe(true);
    const after = await call(chatgpt, "list_tasks", { task_id: taskId });
    expect(after.content[0]!.text).toContain("Approved by the user");
  });

  it("refuses an approver key that is not a valid Ed25519 key or id", async () => {
    const response = await fetch(`${hub.running.publicUrl}/v1/vaults/approver-keys`, {
      method: "POST",
      headers: { authorization: `Bearer ${vault.token}`, "content-type": "application/json" },
      body: JSON.stringify({ key_id: "0123456789abcdef", public_key_b64: Buffer.from("not a key").toString("base64") }),
    });
    expect(response.status).toBe(400);
  });

  it("completes through the relay and the desk sees the result", async () => {
    const chatgpt = await client("chatgpt");
    const done = await call(chatgpt, "update_task", {
      task_id: taskId,
      action: "complete",
      result: { summary: "Drafted 12 emails; sending waits for an effect approval in a later task." },
    });
    expect(done.isError ?? false).toBe(false);
    await (await openVaultSync(vault, PASSPHRASE, desk, root)).sync();
    expect(desk.tasks.get(root, taskId)?.state).toBe("completed");
  });

  it("refuses a stale compare-and-set blob write with 409", async () => {
    const vaultRow = hub.ctx.db.listVaults().find((v) => v.name === "tasks-vault")!;
    const meta = hub.ctx.db.listBlobs(vaultRow.id)[0]!;
    const put = (headers: Record<string, string>) =>
      fetch(`${hub.running.publicUrl}/v1/blobs/${meta.id}`, {
        method: "PUT",
        headers: { authorization: `Bearer ${vault.token}`, "content-type": "application/json", ...headers },
        body: JSON.stringify({ version: meta.version + 10, deleted: false, data_b64: Buffer.from("x").toString("base64") }),
      });
    const stale = await put({ "if-match": `"${meta.version - 1}"` });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { current: { version: number } }).current.version).toBe(meta.version);
    expect((await put({ "if-none-match": "*" })).status).toBe(409);
    expect((await put({ "if-match": "nonsense" })).status).toBe(400);
  });

  it("keeps tasks away from strict vaults and handoff grants", async () => {
    const strict = await client("chatgpt", strictVault.token);
    const refused = await call(strict, "list_tasks", {});
    expect(refused.isError).toBe(true);
    expect(refused.content[0]!.text).toContain("strict vault");

    const grantResponse = await fetch(`${hub.running.publicUrl}/v1/grants`, {
      method: "POST",
      headers: { authorization: `Bearer ${vault.token}`, "content-type": "application/json" },
      body: JSON.stringify({ thread: "Q4 leads", permission: "read+ingest" }),
    });
    const { grant_token } = (await grantResponse.json()) as { grant_token: string };
    const guest = await client("claude", grant_token);
    const denied = await call(guest, "post_task", { thread: "Q4 leads", title: "x", instructions: "y", assignee: "any" });
    expect(denied.isError).toBe(true);
    expect(denied.content[0]!.text).toContain("does not include tasks");
  });

  it("audits tasks by id only, never titles or text", () => {
    const rows = hub.ctx.db.auditRows(undefined, 500).filter((r) => r.action.startsWith("mcp.") && r.action.includes("task"));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.detail).not.toContain("Email the 12 leads");
      expect(row.detail).not.toContain("Q4 leads");
    }
  });

  it("counts cross-vendor handoff pickups for the operator", async () => {
    const grok = await client("connectors-manager");
    await call(grok, "save_session", {
      summary: "Found 12 leads.",
      thread: "Leads handoff",
      handoff: true,
      state: "list done",
      key_decisions: ["B2B only"],
      open_items: ["email them"],
      gotchas: ["none encountered"],
      artifacts: [{ ref: "leads.csv", role: "the leads" }],
      suggested_first_prompt: "Email the leads",
    });
    const chatgpt = await client("chatgpt");
    await call(chatgpt, "continue_thread", { thread: "Leads handoff" });
    const stats = relayGateStats(hub.ctx.db);
    expect(stats.cross_vendor_handoff_resumes).toBe(1);
    expect(stats.handoffs_saved).toBe(1);
    expect(stats.resumes_with_prompt).toBe(1);
    expect(stats.cross_vendor_threads).toBeGreaterThanOrEqual(1);
  });
});
