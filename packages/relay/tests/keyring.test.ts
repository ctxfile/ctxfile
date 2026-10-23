import { createCipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVault, deleteVault, fetchVaultMeta } from "ctxfile";
import { afterAll, describe, expect, it } from "vitest";
import { loadRelayConfig } from "../src/config.js";
import { createRelayContext, startRelay } from "../src/http.js";
import { keyringStatus, retireKeyFile, rewrapAll } from "../src/keyring-admin.js";
import { loadKeyring, MASTER_KEY_FILE, masterKeyId, newMasterKey, parseMasterKey } from "../src/keyring.js";
import { RelayDb } from "../src/store.js";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "cb-keyring-"));
  dirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** A wrap in the format relays wrote before key ids existed. */
function legacyWrap(masterKey: Buffer, plain: Uint8Array): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

function vaultRow(db: RelayDb, name: string) {
  const { vault, token } = db.createVault({
    name,
    mode: "standard",
    salt_b64: "c2FsdA==",
    kdf_ops: null,
    kdf_mem: null,
    wrapped_passphrase_b64: "x",
    wrapped_recovery_b64: "y",
  });
  return { vault, token };
}

const quiet = { secret: null, previous: [], requireSecret: false };

describe("relay master key", () => {
  it("parses base64 and hex keys and rejects anything else", () => {
    const b64 = newMasterKey();
    expect(parseMasterKey(b64, "k")).toHaveLength(32);
    expect(parseMasterKey(randomBytes(32).toString("hex"), "k")).toHaveLength(32);
    for (const bad of ["", "short", randomBytes(16).toString("base64"), `${b64}!!`]) {
      expect(() => parseMasterKey(bad, "k")).toThrow(/32 bytes/);
    }
  });

  it("refuses to start on a key file when a secret is required, and creates none", () => {
    const dir = tempDir();
    expect(() => loadKeyring(dir, { secret: null, previous: [], requireSecret: true })).toThrow(/CTXFILE_RELAY_MASTER_KEY/);
    expect(existsSync(path.join(dir, MASTER_KEY_FILE))).toBe(false);
  });

  it("keeps the master key off the data directory when it comes from a secret", () => {
    const dir = tempDir();
    const keyring = loadKeyring(dir, { secret: newMasterKey(), previous: [], requireSecret: true });
    expect(keyring.primary.source).toBe("secret");
    const wrapped = keyring.wrap(new Uint8Array([1, 2, 3]));
    expect(wrapped.startsWith(`v2.${keyring.primary.id}.`)).toBe(true);
    expect([...keyring.unwrap(wrapped)]).toEqual([1, 2, 3]);
    expect(existsSync(path.join(dir, MASTER_KEY_FILE))).toBe(false);
  });

  it("moves an existing relay off its key file: rewrap, then retire the file", () => {
    const dir = tempDir();
    const db = new RelayDb(dir);
    // Before: a self-hosted relay wrote wraps with its key file, some in the
    // old format.
    const fileRing = loadKeyring(dir, quiet);
    const fileKey = readFileSync(path.join(dir, MASTER_KEY_FILE));
    const dataKeyA = new Uint8Array(randomBytes(32));
    const dataKeyB = new Uint8Array(randomBytes(32));
    const a = vaultRow(db, "a").vault;
    const b = vaultRow(db, "b").vault;
    db.setWrappedDataKey(a.id, legacyWrap(fileKey, dataKeyA));
    db.setWrappedDataKey(b.id, fileRing.wrap(dataKeyB));
    expect([...fileRing.unwrap(db.getVault(a.id)!.wrapped_data_key_b64!)]).toEqual([...dataKeyA]);

    // The operator sets a secret: the file is kept for unwrapping only.
    const secret = newMasterKey();
    const ring = loadKeyring(dir, { secret, previous: [], requireSecret: true });
    expect(ring.older.map((k) => k.source)).toEqual(["file"]);
    const before = keyringStatus(db, ring);
    expect(before.keyFileStillNeeded).toBe(true);
    expect(before.needRewrap).toBe(2);
    expect(retireKeyFile(db, ring, dir).ok).toBe(false);

    expect(rewrapAll(db, ring)).toEqual({ rewrapped: 2, unreadable: 0 });
    const after = keyringStatus(db, ring);
    expect(after).toMatchObject({ keyFileStillNeeded: false, needRewrap: 0, unreadable: 0 });
    expect(after.wrapsByKey[ring.primary.id]).toBe(2);

    expect(retireKeyFile(db, ring, dir)).toEqual({ ok: true });
    expect(existsSync(path.join(dir, MASTER_KEY_FILE))).toBe(false);

    // A restart with only the secret still opens every vault.
    const restarted = loadKeyring(dir, { secret, previous: [], requireSecret: true });
    expect(restarted.older).toHaveLength(0);
    expect([...restarted.unwrap(db.getVault(a.id)!.wrapped_data_key_b64!)]).toEqual([...dataKeyA]);
    expect([...restarted.unwrap(db.getVault(b.id)!.wrapped_data_key_b64!)]).toEqual([...dataKeyB]);
    db.close();
  });

  it("rotates secrets: the previous key unwraps until a rewrap moves everything over", () => {
    const dir = tempDir();
    const db = new RelayDb(dir);
    const oldSecret = newMasterKey();
    const oldRing = loadKeyring(dir, { secret: oldSecret, previous: [], requireSecret: true });
    const v = vaultRow(db, "rot").vault;
    const dataKey = new Uint8Array(randomBytes(32));
    db.setWrappedDataKey(v.id, oldRing.wrap(dataKey));

    const newSecret = newMasterKey();
    const ring = loadKeyring(dir, { secret: newSecret, previous: [oldSecret], requireSecret: true });
    expect(ring.keyIdOf(db.getVault(v.id)!.wrapped_data_key_b64!)).toBe(masterKeyId(parseMasterKey(oldSecret, "k")));
    rewrapAll(db, ring);
    const only = loadKeyring(dir, { secret: newSecret, previous: [], requireSecret: true });
    expect([...only.unwrap(db.getVault(v.id)!.wrapped_data_key_b64!)]).toEqual([...dataKey]);
    // Without the right key a wrap is reported, never guessed.
    const stranger = loadKeyring(tempDir(), { secret: newMasterKey(), previous: [], requireSecret: true });
    expect(() => stranger.unwrap(db.getVault(v.id)!.wrapped_data_key_b64!)).toThrow(/no relay master key/);
    expect(keyringStatus(db, stranger).unreadable).toBe(1);
    db.close();
  });
});

describe("vault deletion", () => {
  it("deletes from a device with ctxfile's deleteVault", async () => {
    const dir = tempDir();
    const ctx = createRelayContext(loadRelayConfig({ dataDir: dir, port: 0 }, {}));
    const running = await startRelay(ctx);
    try {
      const { config } = await createVault({
        relayUrl: running.publicUrl,
        name: "device-delete",
        mode: "standard",
        passphrase: "a-long-test-passphrase",
        kdf: { opsLimit: 1, memLimit: 8192 },
        configPath: path.join(dir, "vault.json"),
      });
      await fetchVaultMeta(fetch, config.relayUrl, config.token);
      expect(await deleteVault(config)).toBe(true);
      await expect(fetchVaultMeta(fetch, config.relayUrl, config.token)).rejects.toThrow(/401/);
      expect(ctx.db.getVault(config.vaultId)).toBeFalsy();
    } finally {
      await running.close();
      ctx.db.close();
    }
  });


  it("deletes everything stored for a vault, only with a full token and an explicit confirmation", async () => {
    const dir = tempDir();
    const ctx = createRelayContext(
      loadRelayConfig({ dataDir: dir, port: 0, keyring: { secret: newMasterKey(), previous: [], requireSecret: true } }, {})
    );
    const running = await startRelay(ctx);
    try {
      const health = (await (await fetch(`${running.publicUrl}/healthz`)).json()) as { key_source: string };
      expect(health.key_source).toBe("secret");

      const { vault, token } = vaultRow(ctx.db, "doomed");
      const keep = vaultRow(ctx.db, "kept");
      ctx.db.setWrappedDataKey(vault.id, ctx.keyring.wrap(new Uint8Array(randomBytes(32))));
      const marker = randomBytes(48);
      ctx.db.putBlob(vault.id, "a".repeat(32), { id: "a".repeat(32), version: 1, deleted: false }, new Uint8Array(marker));
      ctx.db.putBlob(keep.vault.id, "b".repeat(32), { id: "b".repeat(32), version: 1, deleted: false }, new Uint8Array(randomBytes(48)));
      const readOnly = ctx.db.createToken(vault.id, "reader", ["read:context"]);

      const del = (bearer: string, confirm?: string) =>
        fetch(`${running.publicUrl}/v1/vaults/me`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${bearer}`, ...(confirm ? { "x-ctxfile-confirm-delete": confirm } : {}) },
        });
      expect((await del(readOnly, vault.id)).status).toBe(403);
      expect((await del(token)).status).toBe(400);
      expect((await del(token, keep.vault.id)).status).toBe(400);
      expect(ctx.db.getVault(vault.id)).toBeTruthy();

      const done = await del(token, vault.id);
      expect(done.status).toBe(200);
      expect(ctx.db.getVault(vault.id)).toBeFalsy();
      expect(ctx.db.listBlobs(vault.id)).toHaveLength(0);
      expect((await fetch(`${running.publicUrl}/v1/blobs`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
      // The other vault is untouched.
      expect(ctx.db.listBlobs(keep.vault.id)).toHaveLength(1);
      // The deleted ciphertext is overwritten in the database file itself.
      const file = readFileSync(path.join(dir, "relay.db"));
      expect(file.includes(marker)).toBe(false);
      expect(ctx.db.auditRows(vault.id).some((r) => r.action === "vault.delete")).toBe(true);
    } finally {
      await running.close();
      ctx.db.close();
    }
  });
});
