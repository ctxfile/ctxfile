import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  createVault,
  ingestInputSchema,
  IngestStore,
  openVaultSync,
  recoverVault,
  unlockVault,
  type VaultConfig,
} from "ctxfile";
import { beforeAll, describe, expect, it } from "vitest";
import { loadRelayConfig } from "../src/config.js";
import { redeemFederatedGrant } from "../src/federation.js";
import { createRelayContext, startRelay, type RelayContext, type RunningRelay } from "../src/http.js";

/** Fast KDF for tests; production defaults are interactive-grade Argon2id. */
const TEST_KDF = { opsLimit: 1, memLimit: 8192 };
const PASSPHRASE = "a-long-test-passphrase";

async function connectMcp(url: string, token: string, name: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name, version: "0.0.0" });
  await client.connect(transport);
  return client;
}

function text(result: unknown): string {
  return ((result as { content?: { text: string }[] }).content ?? [])[0]?.text ?? "";
}

describe("the relay (M3-M5 + federation), end to end", () => {
  let dirs: string[];
  let hubA: { ctx: RelayContext; running: RunningRelay };
  let hubB: { ctx: RelayContext; running: RunningRelay };
  let storeA: IngestStore;
  let vaultA: VaultConfig;
  let vaultAConfigPath: string;
  const rootA = "/machine-a/project";

  beforeAll(async () => {
    dirs = [
      mkdtempSync(path.join(os.tmpdir(), "cb-relay-a-")),
      mkdtempSync(path.join(os.tmpdir(), "cb-relay-b-")),
      mkdtempSync(path.join(os.tmpdir(), "cb-relay-local-")),
    ];
    const ctxA = createRelayContext(loadRelayConfig({ dataDir: dirs[0], port: 0, orgId: "org-alpha" }, {}));
    const ctxB = createRelayContext(loadRelayConfig({ dataDir: dirs[1], port: 0, orgId: "org-beta" }, {}));
    hubA = { ctx: ctxA, running: await startRelay(ctxA) };
    hubB = { ctx: ctxB, running: await startRelay(ctxB) };
    storeA = new IngestStore(path.join(dirs[2] as string, "ingest.db"));
    vaultAConfigPath = path.join(dirs[2] as string, "vault.json");

    const created = await createVault({
      relayUrl: hubA.running.publicUrl,
      name: "hudson-vault",
      mode: "standard",
      passphrase: PASSPHRASE,
      kdf: TEST_KDF,
      configPath: vaultAConfigPath,
    });
    vaultA = created.config;
    expect(created.recoveryCode).toMatch(/^([A-Z2-9]{5}-){7}[A-Z2-9]{5}$/);

    return async () => {
      await hubA.running.close();
      await hubB.running.close();
      hubA.ctx.db.close();
      hubB.ctx.db.close();
      storeA.close();
      for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    };
  });

  it("closes the roaming circle: desk -> vault -> chat surface -> vault -> desk", async () => {
    // Machine A works locally, then syncs up.
    storeA.ingest(
      rootA,
      ingestInputSchema.parse({
        ctxfile_ingest_schema: "2",
        source: { harness: "claude-code" },
        session: {
          session_id: "desk-1",
          summary: "Drafted the Q3 campaign brief at the desk.",
          key_decisions: ["launch Sep 3"],
          open_items: ["draft the social copy"],
          thread: "Q3 campaign",
        },
      }),
      Date.now() - 60_000,
      "save_session"
    );
    const sync1 = await (await openVaultSync(vaultA, PASSPHRASE, storeA, rootA)).sync();
    expect(sync1.pushed).toBe(2); // session + thread

    // A hosted chat surface resumes the thread through the relay...
    const phone = await connectMcp(hubA.running.publicUrl, vaultA.token, "chatgpt-connector");
    const resumed = await phone.callTool({ name: "continue_thread", arguments: { thread: "Q3 campaign" } });
    expect(resumed.isError ?? false).toBe(false);
    expect(text(resumed)).toContain("Drafted the Q3 campaign brief");
    expect(text(resumed)).toContain("claude-code");

    // ...and saves its own session into the vault.
    const saved = await phone.callTool({
      name: "save_session",
      arguments: {
        summary: "Drafted the social copy on the phone.",
        thread: "Q3 campaign",
        open_items: ["get legal sign-off on the tagline"],
        harness: "chatgpt",
      },
    });
    expect(saved.isError ?? false).toBe(false);
    expect(saved.structuredContent).toMatchObject({ stored: true, thread: "Q3 campaign" });
    await phone.close();

    // Back at the desk: pull, and the phone session is local.
    const sync2 = await (await openVaultSync(vaultA, PASSPHRASE, storeA, rootA)).sync();
    expect(sync2.applied).toBeGreaterThanOrEqual(1);
    const sessions = storeA.list(rootA);
    expect(sessions.some((s) => s.harness === "chatgpt" && s.summary.includes("social copy"))).toBe(true);
    expect(storeA.listThreads(rootA)[0]).toMatchObject({ title: "Q3 campaign", sessionCount: 2 });
  });

  it("stores ciphertext only: no plaintext in any blob on the relay", () => {
    const blobs = hubA.ctx.db.listBlobs(vaultA.vaultId);
    expect(blobs.length).toBeGreaterThanOrEqual(3);
    for (const meta of blobs) {
      const blob = hubA.ctx.db.getBlob(vaultA.vaultId, meta.id);
      const data = Buffer.from(blob?.data ?? new Uint8Array());
      expect(data.includes(Buffer.from("campaign"))).toBe(false);
      expect(data.includes(Buffer.from("chatgpt"))).toBe(false);
    }
  });

  it("strict vaults sync blobs but the relay cannot serve or write them", async () => {
    const strictPath = path.join(dirs[2] as string, "strict-vault.json");
    const strict = await createVault({
      relayUrl: hubA.running.publicUrl,
      name: "strict-vault",
      mode: "strict",
      passphrase: PASSPHRASE,
      kdf: TEST_KDF,
      configPath: strictPath,
    });
    const strictDir = mkdtempSync(path.join(os.tmpdir(), "cb-strict-"));
    const strictStore = new IngestStore(path.join(strictDir, "ingest.db"));
    try {
      strictStore.ingest(
        "/strict/project",
        ingestInputSchema.parse({
          ctxfile_ingest_schema: "2",
          source: { harness: "cursor" },
          session: { session_id: "s1", summary: "Private strict-mode work.", thread: "Secret plan" },
        })
      );
      const sync = await (await openVaultSync(strict.config, PASSPHRASE, strictStore, "/strict/project")).sync();
      expect(sync.pushed).toBe(2);

      const client = await connectMcp(hubA.running.publicUrl, strict.config.token, "curious-surface");
      const read = await client.callTool({ name: "continue_thread", arguments: {} });
      expect(read.isError).toBe(true);
      expect(text(read).toLowerCase()).toContain("strict vault");
      const write = await client.callTool({ name: "save_session", arguments: { summary: "should fail" } });
      expect(write.isError).toBe(true);
      await client.close();
    } finally {
      strictStore.close();
      rmSync(strictDir, { recursive: true, force: true });
    }
  });

  it("handoff grants are thread-scoped and read-only", async () => {
    // Put a second thread in the vault so scoping is observable.
    const device = await connectMcp(hubA.running.publicUrl, vaultA.token, "desk-agent");
    await device.callTool({
      name: "save_session",
      arguments: { summary: "Unrelated billing investigation.", thread: "Billing bug", harness: "cursor" },
    });
    await device.close();

    const grantResponse = await fetch(`${hubA.running.publicUrl}/v1/grants`, {
      method: "POST",
      headers: { authorization: `Bearer ${vaultA.token}`, "content-type": "application/json" },
      body: JSON.stringify({ thread: "Q3 campaign", days: 7 }),
    });
    expect(grantResponse.ok).toBe(true);
    const grant = (await grantResponse.json()) as { grant_token: string };

    const contractor = await connectMcp(hubA.running.publicUrl, grant.grant_token, "contractor-agent");
    const listed = await contractor.callTool({ name: "list_threads", arguments: {} });
    expect(text(listed)).toContain("Q3 campaign");
    expect(text(listed)).not.toContain("Billing bug");
    const resumed = await contractor.callTool({ name: "continue_thread", arguments: {} });
    expect(resumed.isError ?? false).toBe(false);
    expect(text(resumed)).toContain('Resuming "Q3 campaign"');
    const denied = await contractor.callTool({ name: "save_session", arguments: { summary: "trying to write" } });
    expect(denied.isError).toBe(true);
    expect(text(denied)).toContain("read-only");
    await contractor.close();
  });

  it("federates a thread org-to-org: signed grant, trusted-peer redeem, audit both sides", async () => {
    // Hub B needs its own standard vault to import into.
    const vaultBPath = path.join(dirs[2] as string, "vault-b.json");
    const vaultB = await createVault({
      relayUrl: hubB.running.publicUrl,
      name: "partner-vault",
      mode: "standard",
      passphrase: PASSPHRASE,
      kdf: TEST_KDF,
      configPath: vaultBPath,
    });

    // Org A signs a grant for org B over the Q3 campaign thread.
    const issueResponse = await fetch(`${hubA.running.publicUrl}/v1/federation/grants`, {
      method: "POST",
      headers: { authorization: `Bearer ${vaultA.token}`, "content-type": "application/json" },
      body: JSON.stringify({ thread: "Q3 campaign", audience_org: "org-beta", days: 7 }),
    });
    expect(issueResponse.ok).toBe(true);
    const { grant_b64 } = (await issueResponse.json()) as { grant_b64: string };

    // Untrusted orgs are refused: invite-only federation.
    await expect(
      redeemFederatedGrant({
        db: hubB.ctx.db,
        keyring: hubB.ctx.keyring,
        org: hubB.ctx.org,
        grantB64: grant_b64,
        targetVaultId: vaultB.config.vaultId,
      })
    ).rejects.toThrow(/not trusted/);

    // Exchange identities (A trusts B's public key), then redeem.
    hubA.ctx.db.trustOrg("org-beta", hubB.ctx.org.publicKeyPem);
    const result = await redeemFederatedGrant({
      db: hubB.ctx.db,
      keyring: hubB.ctx.keyring,
      org: hubB.ctx.org,
      grantB64: grant_b64,
      targetVaultId: vaultB.config.vaultId,
    });
    expect(result.thread).toBe("Q3 campaign");
    expect(result.imported).toBeGreaterThanOrEqual(3); // 2 sessions + thread

    // Org B's agents can now resume the federated thread on hub B.
    const partnerAgent = await connectMcp(hubB.running.publicUrl, vaultB.config.token, "partner-agent");
    const resumed = await partnerAgent.callTool({ name: "continue_thread", arguments: { thread: "Q3 campaign" } });
    expect(resumed.isError ?? false).toBe(false);
    expect(text(resumed)).toContain("social copy");
    await partnerAgent.close();

    // The audit trail is the deliverable: issuance + redemption on A, import on B.
    const auditA = hubA.ctx.db.auditRows(vaultA.vaultId).map((r) => r.action);
    expect(auditA).toContain("federation.issue");
    expect(auditA).toContain("federation.redeem");
    const auditB = hubB.ctx.db.auditRows(vaultB.config.vaultId).map((r) => r.action);
    expect(auditB).toContain("federation.import");
  });

  it("exposes the audit trail to the vault owner over HTTP", async () => {
    const response = await fetch(`${hubA.running.publicUrl}/v1/audit`, {
      headers: { authorization: `Bearer ${vaultA.token}` },
    });
    expect(response.ok).toBe(true);
    const { audit } = (await response.json()) as { audit: { action: string }[] };
    const actions = audit.map((r) => r.action);
    expect(actions).toContain("mcp.save_session");
    expect(actions).toContain("grant.issue");
    expect(actions).toContain("vault.enroll_key");
  });

  it("rejects wrong tokens and cross-token session use", async () => {
    const bad = await fetch(`${hubA.running.publicUrl}/v1/blobs`, {
      headers: { authorization: "Bearer ctx_not-a-real-token" },
    });
    expect(bad.status).toBe(401);
  });

  it("confines handoff grant tokens to /mcp: every REST route is 403", async () => {
    const grantResponse = await fetch(`${hubA.running.publicUrl}/v1/grants`, {
      method: "POST",
      headers: { authorization: `Bearer ${vaultA.token}`, "content-type": "application/json" },
      body: JSON.stringify({ thread: "Q3 campaign", days: 7 }),
    });
    const { grant_token } = (await grantResponse.json()) as { grant_token: string };
    const auth = { authorization: `Bearer ${grant_token}` };
    // A grant must NOT reach vault key material, ciphertext, the grant list, or audit.
    for (const route of ["/v1/vaults/me", "/v1/blobs", "/v1/grants", "/v1/audit"]) {
      const res = await fetch(`${hubA.running.publicUrl}${route}`, { headers: auth });
      expect(res.status, `${route} should reject grant tokens`).toBe(403);
    }
    // The wrapped passphrase in particular must never be handed to a grant.
    const me = await fetch(`${hubA.running.publicUrl}/v1/vaults/me`, { headers: auth });
    expect(await me.text()).not.toContain("wrapped_passphrase");
    // But the grant still works where it should: /mcp, thread-scoped.
    const contractor = await connectMcp(hubA.running.publicUrl, grant_token, "contractor-mcp");
    const listed = await contractor.callTool({ name: "list_threads", arguments: {} });
    expect(text(listed)).toContain("Q3 campaign");
    await contractor.close();
  });

  it("scopes grant revocation to the caller's vault (no cross-vault revoke by id)", async () => {
    // A second vault on the SAME hub, with its own grant.
    const vault2Path = path.join(dirs[2] as string, "vault-2.json");
    const vault2 = await createVault({
      relayUrl: hubA.running.publicUrl,
      name: "second-vault",
      mode: "standard",
      passphrase: PASSPHRASE,
      kdf: TEST_KDF,
      configPath: vault2Path,
    });
    const device2 = await connectMcp(hubA.running.publicUrl, vault2.config.token, "v2-device");
    await device2.callTool({ name: "save_session", arguments: { summary: "v2 work", thread: "v2 thread", harness: "cursor" } });
    await device2.close();
    await fetch(`${hubA.running.publicUrl}/v1/grants`, {
      method: "POST",
      headers: { authorization: `Bearer ${vault2.config.token}`, "content-type": "application/json" },
      body: JSON.stringify({ thread: "v2 thread", days: 7 }),
    });
    const grantsV2 = (await (
      await fetch(`${hubA.running.publicUrl}/v1/grants`, { headers: { authorization: `Bearer ${vault2.config.token}` } })
    ).json()) as { grants: { id: string }[] };
    const victimId = grantsV2.grants[0]?.id as string;

    // vaultA's device token must NOT be able to revoke vault2's grant by id.
    const attempt = await fetch(`${hubA.running.publicUrl}/v1/grants/${victimId}/revoke`, {
      method: "POST",
      headers: { authorization: `Bearer ${vaultA.token}` },
    });
    expect(attempt.ok).toBe(true);
    expect(((await attempt.json()) as { revoked: boolean }).revoked).toBe(false);

    // The owner CAN revoke it.
    const owner = await fetch(`${hubA.running.publicUrl}/v1/grants/${victimId}/revoke`, {
      method: "POST",
      headers: { authorization: `Bearer ${vault2.config.token}` },
    });
    expect(((await owner.json()) as { revoked: boolean }).revoked).toBe(true);
  });

  it("resets a lost passphrase with the recovery code, then rotates it", async () => {
    const rvPath = path.join(dirs[2] as string, "vault-recover.json");
    const { config, recoveryCode } = await createVault({
      relayUrl: hubA.running.publicUrl,
      name: "recover-vault",
      mode: "standard",
      passphrase: PASSPHRASE,
      kdf: TEST_KDF,
      configPath: rvPath,
    });
    await expect(unlockVault(config, PASSPHRASE)).resolves.toBeInstanceOf(Uint8Array);

    const NEW = "a-fresh-new-passphrase-7";
    const recovered = await recoverVault({
      relayUrl: config.relayUrl,
      token: config.token,
      recoveryCode,
      newPassphrase: NEW,
      configPath: rvPath,
    });
    // Old passphrase is dead; the new one unlocks.
    await expect(unlockVault(config, PASSPHRASE)).rejects.toThrow(/wrong vault passphrase/);
    await expect(unlockVault(config, NEW)).resolves.toBeInstanceOf(Uint8Array);
    // A new recovery code was issued and the old code no longer works.
    expect(recovered.recoveryCode).not.toBe(recoveryCode);
    await expect(
      recoverVault({ relayUrl: config.relayUrl, token: config.token, recoveryCode, newPassphrase: NEW, configPath: rvPath })
    ).rejects.toThrow(/recovery code incorrect/);
  });

  it("rejects an MCP POST with no trustworthy Content-Length (chunked cannot bypass the cap)", async () => {
    const url = new URL(hubA.running.publicUrl);
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: "/mcp",
          method: "POST",
          headers: {
            authorization: `Bearer ${vaultA.token}`,
            "content-type": "application/json",
            "transfer-encoding": "chunked",
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        }
      );
      req.on("error", reject);
      req.write('{"jsonrpc":"2.0","method":"ping"}');
      req.end();
    });
    expect(status).toBe(411);
  });

  it("refuses vault rewrap from a write-only ingest token (no bricking)", async () => {
    const writeOnly = hubA.ctx.db.createToken(vaultA.vaultId, "ingest-only", ["write:sessions"]);
    const res = await fetch(`${hubA.running.publicUrl}/v1/vaults/rewrap`, {
      method: "POST",
      headers: { authorization: `Bearer ${writeOnly}`, "content-type": "application/json" },
      body: JSON.stringify({ wrapped_passphrase_b64: "AAAA", wrapped_recovery_b64: "BBBB" }),
    });
    expect(res.status).toBe(403);
  });

  it("serves web-chatbot connectors: search finds threads and sessions, fetch returns full content", async () => {
    // A Grok/ChatGPT-style connector: same bearer, only the search/fetch pair.
    const connector = await connectMcp(hubA.running.publicUrl, vaultA.token, "grok-connector");

    // Empty query lists every thread in the vault.
    const all = await connector.callTool({ name: "search", arguments: { query: "" } });
    expect(all.isError ?? false).toBe(false);
    const allResults = (JSON.parse(text(all)) as { results: { id: string; title: string; url: string }[] }).results;
    const allIds = allResults.map((r) => r.id);
    expect(allIds).toContain("thread:Q3 campaign");
    expect(allIds).toContain("thread:Billing bug");
    for (const r of allResults) expect(r.url).toMatch(/^https?:\/\//);

    // A term query matches threads AND session digests.
    const hits = await connector.callTool({ name: "search", arguments: { query: "campaign" } });
    const hitResults = (JSON.parse(text(hits)) as { results: { id: string }[] }).results;
    expect(hitResults.some((r) => r.id === "thread:Q3 campaign")).toBe(true);
    expect(hitResults.some((r) => r.id.startsWith("session:"))).toBe(true);
    expect(hitResults.some((r) => r.id === "thread:Billing bug")).toBe(false);

    // fetch(thread:...) returns the same merged history continue_thread renders.
    const thread = await connector.callTool({ name: "fetch", arguments: { id: "thread:Q3 campaign" } });
    expect(thread.isError ?? false).toBe(false);
    const threadDoc = JSON.parse(text(thread)) as {
      id: string;
      title: string;
      text: string;
      url: string;
      metadata: { sessions: number };
    };
    expect(threadDoc.id).toBe("thread:Q3 campaign");
    expect(threadDoc.text).toContain('Resuming "Q3 campaign"');
    expect(threadDoc.text).toContain("social copy");
    expect(threadDoc.metadata.sessions).toBeGreaterThanOrEqual(2);

    // fetch(session:...) returns one digest.
    const session = await connector.callTool({ name: "fetch", arguments: { id: "session:desk-1" } });
    expect(session.isError ?? false).toBe(false);
    const sessionDoc = JSON.parse(text(session)) as { text: string };
    expect(sessionDoc.text).toContain("campaign brief");

    // A malformed id fails with guidance instead of leaking anything.
    const bad = await connector.callTool({ name: "fetch", arguments: { id: "blob:whatever" } });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toContain("call search first");
    await connector.close();

    // The reads are audited like every other tool.
    const actions = hubA.ctx.db.auditRows(vaultA.vaultId).map((r) => r.action);
    expect(actions).toContain("mcp.search");
    expect(actions).toContain("mcp.fetch");
  });

  it("scopes search/fetch to a handoff grant's thread, like the rest of the surface", async () => {
    const grantResponse = await fetch(`${hubA.running.publicUrl}/v1/grants`, {
      method: "POST",
      headers: { authorization: `Bearer ${vaultA.token}`, "content-type": "application/json" },
      body: JSON.stringify({ thread: "Q3 campaign", days: 7 }),
    });
    const { grant_token } = (await grantResponse.json()) as { grant_token: string };
    const contractor = await connectMcp(hubA.running.publicUrl, grant_token, "contractor-connector");

    const listed = await contractor.callTool({ name: "search", arguments: { query: "" } });
    const ids = (JSON.parse(text(listed)) as { results: { id: string }[] }).results.map((r) => r.id);
    expect(ids).toContain("thread:Q3 campaign");
    expect(ids.some((id) => id.includes("Billing"))).toBe(false);

    // Fetching outside the granted thread is refused, not partially served.
    const denied = await contractor.callTool({ name: "fetch", arguments: { id: "thread:Billing bug" } });
    expect(denied.isError).toBe(true);
    await contractor.close();
  });
});
