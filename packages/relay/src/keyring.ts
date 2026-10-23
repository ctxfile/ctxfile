import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * The relay's key-wrapping seam (§3 of the sync plan, §4.1 BYOK of the
 * Enterprise PRD). Standard-mode vaults enroll their data key here, and push
 * targets keep their webhook secrets and routine tokens here; the relay
 * stores only the wraps and unwraps in memory for the lifetime of a request.
 *
 * KeyProvider is deliberately the entire key-management surface we need: a
 * cloud-KMS or customer-KMS provider (BYOK) implements these same two methods
 * against a key the customer can revoke.
 *
 * Where the master key lives decides what a stolen disk is worth:
 * - CTXFILE_RELAY_MASTER_KEY (a platform secret, e.g. `fly secrets set`): the
 *   key never touches the data volume, so a copy of the volume or one of its
 *   snapshots holds only ciphertext and wraps it cannot open. The hosted relay
 *   requires this (CTXFILE_RELAY_REQUIRE_SECRET_KEY=1).
 * - Otherwise, a key file generated once into the data directory: convenient
 *   for self-hosting, but it sits beside the data, so back it up and protect
 *   it like a private key.
 */
export interface KeyProvider {
  name: string;
  wrap(dataKey: Uint8Array): string;
  unwrap(wrapped: string): Uint8Array;
}

export const MASTER_KEY_FILE = "relay-master.key";
const WRAP_PREFIX = "v2.";

export type MasterKeySource = "secret" | "previous-secret" | "file";

export interface MasterKey {
  /** First 12 hex chars of SHA-256(key): names the key in wraps and status. */
  id: string;
  source: MasterKeySource;
  key: Buffer;
}

export function masterKeyId(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

/** Parses a 32-byte key given as base64 or 64 hex characters. */
export function parseMasterKey(raw: string, label: string): Buffer {
  const value = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32 || (!/^[0-9a-fA-F]{64}$/.test(value) && key.toString("base64").replace(/=+$/, "") !== value.replace(/=+$/, ""))) {
    throw new Error(`${label} must be 32 bytes, as base64 or 64 hex characters (generate one with: ctxfile-relay keyring new)`);
  }
  return key;
}

/** A fresh master key, base64, for `fly secrets set CTXFILE_RELAY_MASTER_KEY=...`. */
export function newMasterKey(): string {
  return randomBytes(32).toString("base64");
}

/**
 * AES-256-GCM key wrapping under one primary master key, with any number of
 * older keys kept for unwrapping only (rotation). Wraps name their key:
 * `v2.<key id>.<base64 iv|tag|ciphertext>`. Wraps written before key ids
 * existed (bare base64) still unwrap: the GCM tag identifies the right key.
 */
export class MasterKeyring implements KeyProvider {
  readonly name: string;

  constructor(
    readonly primary: MasterKey,
    readonly older: readonly MasterKey[] = []
  ) {
    this.name = primary.source === "file" ? "local-keyring" : "secret-keyring";
  }

  get keys(): readonly MasterKey[] {
    return [this.primary, ...this.older];
  }

  wrap(dataKey: Uint8Array): string {
    return `${WRAP_PREFIX}${this.primary.id}.${seal(this.primary.key, dataKey)}`;
  }

  unwrap(wrapped: string): Uint8Array {
    const found = this.open(wrapped);
    if (!found) throw new Error("no relay master key opens this wrap (was a master key lost or rotated away?)");
    return found.plain;
  }

  /** The id of the key that opens this wrap, or null if none here does. */
  keyIdOf(wrapped: string): string | null {
    return this.open(wrapped)?.keyId ?? null;
  }

  /** True when the wrap is already under the primary key in the current format. */
  isCurrent(wrapped: string): boolean {
    return wrapped.startsWith(`${WRAP_PREFIX}${this.primary.id}.`);
  }

  private open(wrapped: string): { plain: Uint8Array; keyId: string } | null {
    if (wrapped.startsWith(WRAP_PREFIX)) {
      const rest = wrapped.slice(WRAP_PREFIX.length);
      const dot = rest.indexOf(".");
      if (dot < 0) return null;
      const id = rest.slice(0, dot);
      const key = this.keys.find((k) => k.id === id);
      if (!key) return null;
      const plain = unseal(key.key, rest.slice(dot + 1));
      return plain ? { plain, keyId: key.id } : null;
    }
    for (const key of this.keys) {
      const plain = unseal(key.key, wrapped);
      if (plain) return { plain, keyId: key.id };
    }
    return null;
  }
}

function seal(key: Buffer, plain: Uint8Array): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

function unseal(key: Buffer, b64: string): Uint8Array | null {
  try {
    const raw = Buffer.from(b64, "base64");
    if (raw.length < 28) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return new Uint8Array(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]));
  } catch {
    return null;
  }
}

function readKeyFile(dataDir: string, create: boolean): MasterKey | null {
  const keyPath = path.join(dataDir, MASTER_KEY_FILE);
  if (!existsSync(keyPath)) {
    if (!create) return null;
    writeFileSync(keyPath, randomBytes(32), { mode: 0o600 });
    try {
      chmodSync(keyPath, 0o600);
    } catch {
      // best-effort on platforms without POSIX modes
    }
    console.error(`ctxfile-relay: generated keyring master key at ${keyPath} (mode 600; back it up)`);
  }
  const key = readFileSync(keyPath);
  if (key.length !== 32) throw new Error(`${keyPath} must be exactly 32 bytes`);
  return { id: masterKeyId(key), source: "file", key };
}

export interface KeyringSettings {
  /** CTXFILE_RELAY_MASTER_KEY: the primary key, held outside the data dir. */
  secret: string | null;
  /** CTXFILE_RELAY_MASTER_KEY_PREVIOUS: older keys, unwrap only (comma-separated). */
  previous: readonly string[];
  /** CTXFILE_RELAY_REQUIRE_SECRET_KEY=1: refuse to run on a key file. */
  requireSecret: boolean;
}

/** Builds the relay's keyring from its settings and data directory. With a
    secret key, a leftover key file is kept for unwrapping only, until
    `ctxfile-relay keyring rewrap` and `keyring retire-file` remove the need. */
export function loadKeyring(dataDir: string, settings: KeyringSettings): MasterKeyring {
  const previous = settings.previous.map((raw, i) => {
    const key = parseMasterKey(raw, `CTXFILE_RELAY_MASTER_KEY_PREVIOUS[${i}]`);
    return { id: masterKeyId(key), source: "previous-secret" as const, key };
  });
  if (settings.secret) {
    const key = parseMasterKey(settings.secret, "CTXFILE_RELAY_MASTER_KEY");
    const file = readKeyFile(dataDir, false);
    const primary: MasterKey = { id: masterKeyId(key), source: "secret", key };
    const older = [...previous, ...(file && file.id !== primary.id ? [file] : [])].filter((k) => k.id !== primary.id);
    return new MasterKeyring(primary, older);
  }
  if (settings.requireSecret) {
    throw new Error(
      "CTXFILE_RELAY_MASTER_KEY is not set, and this relay requires its master key to come from a secret " +
        "(CTXFILE_RELAY_REQUIRE_SECRET_KEY=1) so it never sits on the data volume. Generate one with " +
        "`ctxfile-relay keyring new` and set it as a platform secret."
    );
  }
  const file = readKeyFile(dataDir, true) as MasterKey;
  return new MasterKeyring(file, previous.filter((k) => k.id !== file.id));
}

/** Self-hosted default kept for callers that only have a data directory:
    a key file in the data dir, created on first use. */
export class LocalKeyProvider extends MasterKeyring {
  constructor(dataDir: string) {
    super(readKeyFile(dataDir, true) as MasterKey);
  }
}

/** Overwrites and removes the data directory's key file. The caller must
    first make sure no wrap still depends on it. */
export function destroyKeyFile(dataDir: string): boolean {
  const keyPath = path.join(dataDir, MASTER_KEY_FILE);
  if (!existsSync(keyPath)) return false;
  writeFileSync(keyPath, randomBytes(32));
  unlinkSync(keyPath);
  return true;
}
