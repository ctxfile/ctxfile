import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ingestInputSchema, type IngestInput } from "../src/ingest.js";
import { IngestStore } from "../src/storage/ingest-store.js";
import { SyncClient, type RelayStore, type SyncBlobMeta } from "../src/sync/client.js";
import {
  decryptBlob,
  deriveBlobId,
  deriveMasterKey,
  encryptBlob,
  generateRecoveryCode,
  generateSalt,
  toBase64,
  unwrapMasterKey,
  wrapMasterKey,
} from "../src/sync/crypto.js";
import { recoverVault } from "../src/sync/vault.js";

/** Fast KDF params for tests only; production defaults are interactive-grade. */
const TEST_KDF = { opsLimit: 1, memLimit: 8192 };

describe("sync crypto (the lockbox)", () => {
  let salt: Uint8Array;
  let key: Uint8Array;

  beforeAll(async () => {
    salt = await generateSalt();
    key = await deriveMasterKey("correct horse battery staple", salt, TEST_KDF);
  });

  it("derives deterministically from passphrase + salt, and differently otherwise", async () => {
    const again = await deriveMasterKey("correct horse battery staple", salt, TEST_KDF);
    expect(Buffer.from(again).equals(Buffer.from(key))).toBe(true);
    const otherPass = await deriveMasterKey("wrong passphrase", salt, TEST_KDF);
    expect(Buffer.from(otherPass).equals(Buffer.from(key))).toBe(false);
    const otherSalt = await deriveMasterKey("correct horse battery staple", await generateSalt(), TEST_KDF);
    expect(Buffer.from(otherSalt).equals(Buffer.from(key))).toBe(false);
  });

  it("round-trips a blob and refuses tampering, wrong keys, and wrong slots", async () => {
    const plaintext = new TextEncoder().encode("the Q3 campaign brief");
    const blob = await encryptBlob(key, plaintext, "blob-1");
    expect(Buffer.from(blob).includes(Buffer.from("campaign"))).toBe(false);
    const opened = await decryptBlob(key, blob, "blob-1");
    expect(new TextDecoder().decode(opened)).toBe("the Q3 campaign brief");

    const tampered = new Uint8Array(blob);
    tampered[tampered.length - 3] = (tampered[tampered.length - 3] as number) ^ 0xff;
    await expect(decryptBlob(key, tampered, "blob-1")).rejects.toThrow();
    // AAD binds a ciphertext to its slot: no replaying blob-1 into blob-2.
    await expect(decryptBlob(key, blob, "blob-2")).rejects.toThrow();
    const wrongKey = await deriveMasterKey("intruder", salt, TEST_KDF);
    await expect(decryptBlob(wrongKey, blob, "blob-1")).rejects.toThrow();
  });

  it("wraps the master key under a recovery code (Bitwarden model)", async () => {
    const code = await generateRecoveryCode();
    expect(code).toMatch(/^([A-Z2-9]{5}-){7}[A-Z2-9]{5}$/);
    const wrapped = await wrapMasterKey(key, code, salt, TEST_KDF);
    const recovered = await unwrapMasterKey(wrapped, code, salt, TEST_KDF);
    expect(Buffer.from(recovered).equals(Buffer.from(key))).toBe(true);
    await expect(unwrapMasterKey(wrapped, "WRONG-CODE", salt, TEST_KDF)).rejects.toThrow();
  });

  it("derives opaque blob ids: stable per key, unlinkable across keys", async () => {
    const a = await deriveBlobId(key, "session:chatgpt:gpt-1");
    expect(a).toBe(await deriveBlobId(key, "session:chatgpt:gpt-1"));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("chatgpt");
    const otherKey = await deriveMasterKey("another vault", salt, TEST_KDF);
    expect(await deriveBlobId(otherKey, "session:chatgpt:gpt-1")).not.toBe(a);
  });
});

class MemoryRelay implements RelayStore {
  readonly blobs = new Map<string, { meta: SyncBlobMeta; data: Uint8Array }>();
  async list(): Promise<SyncBlobMeta[]> {
    return [...this.blobs.values()].map((b) => b.meta);
  }
  async get(id: string): Promise<{ meta: SyncBlobMeta; data: Uint8Array } | null> {
    return this.blobs.get(id) ?? null;
  }
  async put(id: string, meta: SyncBlobMeta, data: Uint8Array): Promise<void> {
    this.blobs.set(id, { meta, data: new Uint8Array(data) });
  }
}

function input(sessionId: string, summary: string, harness = "chatgpt", thread?: string): IngestInput {
  return ingestInputSchema.parse({
    ctxfile_ingest_schema: "2",
    source: { harness },
    session: { session_id: sessionId, summary, ...(thread ? { thread } : {}) },
  });
}

describe("sync client E2E (M2: two stores converge through a stub relay)", () => {
  let dirA: string;
  let dirB: string;
  let storeA: IngestStore;
  let storeB: IngestStore;
  let relay: MemoryRelay;
  let clientA: SyncClient;
  let clientB: SyncClient;
  const rootA = "/machine-a/project";
  const rootB = "/machine-b/project";

  beforeAll(async () => {
    dirA = mkdtempSync(path.join(os.tmpdir(), "cb-sync-a-"));
    dirB = mkdtempSync(path.join(os.tmpdir(), "cb-sync-b-"));
    storeA = new IngestStore(path.join(dirA, "ingest.db"));
    storeB = new IngestStore(path.join(dirB, "ingest.db"));
    relay = new MemoryRelay();
    const key = await deriveMasterKey("one vault passphrase", await generateSalt(), TEST_KDF);
    clientA = new SyncClient(storeA.syncSource(rootA), relay, key);
    clientB = new SyncClient(storeB.syncSource(rootB), relay, key);
    return () => {
      storeA.close();
      storeB.close();
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    };
  });

  it("machine B resumes a thread saved on machine A", async () => {
    storeA.ingest(rootA, input("gpt-1", "Drafted the Q3 campaign brief.", "chatgpt", "Q3 campaign"), 1_000, "save_session");
    storeA.ingest(rootA, input("cl-1", "Refined the campaign schedule.", "claude", "Q3 campaign"), 2_000, "save_session");

    const first = await clientA.sync();
    expect(first).toEqual({ pushed: 3, applied: 0 }); // 2 sessions + 1 thread

    const applied = await clientB.pull();
    expect(applied).toBe(3);
    const sessions = storeB.list(rootB);
    expect(sessions).toHaveLength(2);
    const threads = storeB.listThreads(rootB);
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ title: "Q3 campaign", sessionCount: 2, lastHarness: "claude" });
    const chronological = storeB.threadSessions(rootB, threads[0]?.id as number);
    expect(chronological.map((s) => s.sessionId)).toEqual(["gpt-1", "cl-1"]);
    expect(chronological[0]?.door).toBe("save_session");
  });

  it("the relay holds ciphertext and opaque ids only", () => {
    expect(relay.blobs.size).toBe(3);
    for (const [id, blob] of relay.blobs) {
      expect(id).toMatch(/^[0-9a-f]{32}$/);
      const data = Buffer.from(blob.data);
      expect(data.includes(Buffer.from("campaign"))).toBe(false);
      expect(data.includes(Buffer.from("chatgpt"))).toBe(false);
      expect(data.includes(Buffer.from("gpt-1"))).toBe(false);
    }
  });

  it("tombstones propagate: delete on B disappears from A", async () => {
    const target = storeB.list(rootB).find((s) => s.sessionId === "cl-1");
    expect(storeB.remove(rootB, target?.id as number, 3_000)).toBe(true);
    await clientB.sync();
    const applied = await clientA.pull();
    expect(applied).toBe(1);
    expect(storeA.list(rootA).map((s) => s.sessionId)).toEqual(["gpt-1"]);
    expect(storeA.listThreads(rootA)[0]?.sessionCount).toBe(1);
  });

  it("last write wins on a conflict, both directions converge", async () => {
    storeB.ingest(rootB, input("gpt-1", "B's older edit.", "chatgpt", "Q3 campaign"), 8_000, "save_session");
    storeA.ingest(rootA, input("gpt-1", "A's newer edit wins.", "chatgpt", "Q3 campaign"), 9_000, "save_session");
    await clientB.sync(); // B uploads 8_000
    await clientA.sync(); // A skips the older remote, uploads 9_000
    await clientB.sync(); // B applies A's newer version
    expect(storeA.list(rootA).find((s) => s.sessionId === "gpt-1")?.summary).toBe("A's newer edit wins.");
    expect(storeB.list(rootB).find((s) => s.sessionId === "gpt-1")?.summary).toBe("A's newer edit wins.");
  });

  it("re-syncing when nothing changed is a no-op", async () => {
    expect(await clientA.sync()).toEqual({ pushed: 0, applied: 0 });
    expect(await clientB.sync()).toEqual({ pushed: 0, applied: 0 });
  });

  it("a re-used title resurrects a tombstoned thread instead of leaving it invisible (M1)", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "cb-tomb-"));
    const store = new IngestStore(path.join(dir, "ingest.db"));
    try {
      const root = "/m1/project";
      // Threads are only tombstoned via sync; simulate a deleted-thread payload arriving.
      const payload = new TextEncoder().encode(
        JSON.stringify({
          kind: "thread",
          title: "Ghost",
          status: "active",
          tags: [],
          created_at: 1_000,
          last_active: 2_000,
          deleted: true,
        })
      );
      store.importSyncEntries(root, [{ naturalId: "thread:ghost", version: 2_000, deleted: true, payload }]);
      expect(store.listThreads(root)).toHaveLength(0); // tombstoned, invisible

      const ensured = store.ensureThread(root, "Ghost", 3_000);
      expect(ensured.created).toBe(true); // resurrected
      const threads = store.listThreads(root);
      expect(threads).toHaveLength(1);
      expect(threads[0]).toMatchObject({ id: ensured.id, title: "Ghost" });
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a thread's private flag syncs across devices (M2)", async () => {
    storeA.ingest(rootA, input("priv-1", "Sensitive HR matter.", "claude", "HR review"), 20_000, "save_session");
    const threadId = storeA.listThreads(rootA).find((t) => t.title === "HR review")?.id as number;
    expect(storeA.setThreadPrivate(rootA, threadId, true)).toBe(true);
    await clientA.sync();
    await clientB.pull();
    const remote = storeB.listThreads(rootB).find((t) => t.title === "HR review");
    expect(remote?.private).toBe(true);
  });
});

describe("recoverVault legacy recovery-wrap fallback", () => {
  it("recovers a vault whose recovery wrap used the raw (dashed) code", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "cb-recover-legacy-"));
    try {
      // A vault as the pre-normalization version stored it: recovery wrap made
      // with the raw dashed code, not the normalized (dash-stripped) form.
      const salt = await generateSalt();
      const dataKey = new Uint8Array(randomBytes(32));
      const legacyCode = "ABCDE-FGHJK-MNPQR-STVWX-YZ234-56789-ABCDE-FGHJK";
      const legacyRecoveryWrap = await wrapMasterKey(dataKey, legacyCode, salt, TEST_KDF);
      const passphraseWrap = await wrapMasterKey(dataKey, "an old vault passphrase", salt, TEST_KDF);
      const meta = {
        vault_id: "v-legacy",
        name: "legacy vault",
        mode: "standard",
        salt_b64: await toBase64(salt),
        kdf: { ops_limit: TEST_KDF.opsLimit, mem_limit: TEST_KDF.memLimit },
        wrapped_passphrase_b64: await toBase64(passphraseWrap),
        wrapped_recovery_b64: await toBase64(legacyRecoveryWrap),
      };

      let rewrapped = false;
      const fetchImpl = (async (url: string | URL) => {
        const u = String(url);
        if (u.endsWith("/v1/vaults/me")) {
          return new Response(JSON.stringify(meta), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (u.endsWith("/v1/vaults/rewrap")) {
          rewrapped = true;
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
        }
        return new Response("not found", { status: 404 });
      }) as unknown as typeof fetch;

      // The provided code is the dashed original; normalized unwrap fails, so
      // this only succeeds because recoverVault falls back to the raw code.
      const result = await recoverVault({
        relayUrl: "http://relay.test",
        token: "ctx_device",
        recoveryCode: legacyCode,
        newPassphrase: "a brand new long passphrase",
        configPath: path.join(dir, "vault.json"),
        fetchImpl,
      });
      expect(rewrapped).toBe(true);
      expect(result.recoveryCode).not.toBe(legacyCode); // rotated to a fresh code
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
