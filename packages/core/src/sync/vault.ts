import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SyncClient } from "./client.js";
import {
  fromBase64,
  generateRecoveryCode,
  generateSalt,
  normalizeRecoveryCode,
  toBase64,
  unwrapMasterKey,
  wrapMasterKey,
  zeroKey,
  type KdfParams,
} from "./crypto.js";
import { HttpRelayStore } from "./http-relay.js";
import type { IngestStore } from "../storage/ingest-store.js";

/**
 * The vault client (M2/M3 seam): create or join a vault on a relay, unlock it
 * with the passphrase, and sync the local store through it. Key design: the
 * blob key is a random data key; the passphrase (and a printed recovery code)
 * merely WRAP it, and the wraps live on the relay as vault metadata, so a new
 * device needs only the vault token plus the passphrase, and a passphrase
 * change is a re-wrap, never a re-encrypt of the world. In Standard mode the
 * data key is additionally enrolled with the relay's keyring for serve-time
 * decryption; in Strict mode it never leaves your devices.
 */

export interface VaultConfig {
  relayUrl: string;
  vaultId: string;
  name: string;
  mode: "standard" | "strict";
  /** Bearer token for this device; treat like a password. */
  token: string;
}

export interface VaultMeta {
  vault_id: string;
  name: string;
  mode: "standard" | "strict";
  salt_b64: string;
  kdf: { ops_limit: number; mem_limit: number };
  wrapped_passphrase_b64: string;
  /** Present on device-token reads; used by 'ctxfile vault recover'. */
  wrapped_recovery_b64?: string;
}

/** Minimum vault passphrase length. Raised past a throwaway value because the
    KDF salt and parameters are stored as vault metadata: a weak passphrase is
    offline-bruteforceable by anyone who obtains that metadata. */
export const MIN_PASSPHRASE_LENGTH = 12;

export function assertPassphraseStrength(passphrase: string): void {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`vault passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`);
  }
  if (new Set(passphrase).size < 5) {
    throw new Error("vault passphrase is too repetitive; use a longer, more varied passphrase");
  }
}

export const DEFAULT_VAULT_CONFIG_PATH = path.join(os.homedir(), ".ctxfile", "vault.json");

export function loadVaultConfig(configPath = DEFAULT_VAULT_CONFIG_PATH): VaultConfig | null {
  if (!existsSync(configPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as VaultConfig;
    return parsed.relayUrl && parsed.vaultId && parsed.token ? parsed : null;
  } catch {
    return null;
  }
}

export function saveVaultConfig(config: VaultConfig, configPath = DEFAULT_VAULT_CONFIG_PATH): void {
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  chmodSync(configPath, 0o600);
}

async function relayRequest(
  fetchImpl: typeof fetch,
  relayUrl: string,
  route: string,
  init: RequestInit & { token?: string } = {}
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const response = await fetchImpl(`${relayUrl.replace(/\/+$/, "")}${route}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`relay ${route} failed: ${response.status} ${body.slice(0, 200)}`);
  }
  return response;
}

export interface CreateVaultOptions {
  relayUrl: string;
  name: string;
  mode: "standard" | "strict";
  passphrase: string;
  kdf?: KdfParams;
  configPath?: string;
  fetchImpl?: typeof fetch;
}

export async function createVault(options: CreateVaultOptions): Promise<{ config: VaultConfig; recoveryCode: string }> {
  assertPassphraseStrength(options.passphrase);
  const fetchImpl = options.fetchImpl ?? fetch;
  const salt = await generateSalt();
  // Buffer is a Uint8Array; copy into a plain one for libsodium friendliness.
  const dataKey = new Uint8Array(randomBytes(32));
  const wrappedPassphrase = await wrapMasterKey(dataKey, options.passphrase, salt, options.kdf);
  const recoveryCode = await generateRecoveryCode();
  // Wrap under the normalized recovery secret so retyping (any case/dashing)
  // still unwraps during recovery.
  const wrappedRecovery = await wrapMasterKey(dataKey, normalizeRecoveryCode(recoveryCode), salt, options.kdf);

  const createResponse = await relayRequest(fetchImpl, options.relayUrl, "/v1/vaults", {
    method: "POST",
    body: JSON.stringify({
      name: options.name,
      mode: options.mode,
      salt_b64: await toBase64(salt),
      kdf: options.kdf ? { ops_limit: options.kdf.opsLimit, mem_limit: options.kdf.memLimit } : undefined,
      wrapped_passphrase_b64: await toBase64(wrappedPassphrase),
      wrapped_recovery_b64: await toBase64(wrappedRecovery),
    }),
  });
  const created = (await createResponse.json()) as { vault_id: string; token: string };

  if (options.mode === "standard") {
    // The one moment the data key transits (over TLS in production): the
    // relay wraps it with its keyring immediately and stores only the wrap.
    await relayRequest(fetchImpl, options.relayUrl, "/v1/vaults/enroll-key", {
      method: "POST",
      token: created.token,
      body: JSON.stringify({ data_key_b64: await toBase64(dataKey) }),
    });
  }

  const config: VaultConfig = {
    relayUrl: options.relayUrl,
    vaultId: created.vault_id,
    name: options.name,
    mode: options.mode,
    token: created.token,
  };
  saveVaultConfig(config, options.configPath);
  return { config, recoveryCode };
}

export interface JoinVaultOptions {
  relayUrl: string;
  token: string;
  passphrase: string;
  configPath?: string;
  fetchImpl?: typeof fetch;
}

/** Second device: vault token + passphrase is all it takes; the salt and the
    wrapped key come down from the relay. */
export async function joinVault(options: JoinVaultOptions): Promise<VaultConfig> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const meta = await fetchVaultMeta(fetchImpl, options.relayUrl, options.token);
  // Unwrapping proves the passphrase before we persist anything.
  await unlockWithMeta(meta, options.passphrase);
  const config: VaultConfig = {
    relayUrl: options.relayUrl,
    vaultId: meta.vault_id,
    name: meta.name,
    mode: meta.mode,
    token: options.token,
  };
  saveVaultConfig(config, options.configPath);
  return config;
}

export interface RecoverVaultOptions {
  relayUrl: string;
  token: string;
  recoveryCode: string;
  newPassphrase: string;
  configPath?: string;
  fetchImpl?: typeof fetch;
}

/** Reset a lost passphrase with the printed recovery code. The data key is
    recovered from the recovery wrap, then re-wrapped under the new passphrase
    and a freshly rotated recovery code — nothing is re-encrypted. Requires a
    device token (the recovery code replaces the passphrase factor, not the
    device factor). Returns the new recovery code; the old one stops working. */
export async function recoverVault(options: RecoverVaultOptions): Promise<{ config: VaultConfig; recoveryCode: string }> {
  assertPassphraseStrength(options.newPassphrase);
  const fetchImpl = options.fetchImpl ?? fetch;
  const meta = await fetchVaultMeta(fetchImpl, options.relayUrl, options.token);
  if (!meta.wrapped_recovery_b64) {
    throw new Error("relay did not return a recovery wrap for this token (a device token is required to recover)");
  }
  const salt = await fromBase64(meta.salt_b64);
  const kdf: KdfParams | undefined = meta.kdf ? { opsLimit: meta.kdf.ops_limit, memLimit: meta.kdf.mem_limit } : undefined;
  const recoveryWrap = await fromBase64(meta.wrapped_recovery_b64);
  let dataKey: Uint8Array;
  try {
    dataKey = await unwrapMasterKey(recoveryWrap, normalizeRecoveryCode(options.recoveryCode), salt, kdf);
  } catch {
    // Vaults created before recovery-code normalization wrapped with the raw
    // (dashed) code; fall back to it before giving up. A successful recovery
    // below re-wraps in the normalized format, migrating the vault.
    try {
      dataKey = await unwrapMasterKey(recoveryWrap, options.recoveryCode.trim(), salt, kdf);
    } catch {
      throw new Error("recovery code incorrect (or vault metadata corrupted)");
    }
  }
  try {
    const newRecovery = await generateRecoveryCode();
    const wrappedPassphrase = await wrapMasterKey(dataKey, options.newPassphrase, salt, kdf);
    const wrappedRecovery = await wrapMasterKey(dataKey, normalizeRecoveryCode(newRecovery), salt, kdf);
    await relayRequest(fetchImpl, options.relayUrl, "/v1/vaults/rewrap", {
      method: "POST",
      token: options.token,
      body: JSON.stringify({
        wrapped_passphrase_b64: await toBase64(wrappedPassphrase),
        wrapped_recovery_b64: await toBase64(wrappedRecovery),
      }),
    });
    const config: VaultConfig = {
      relayUrl: options.relayUrl,
      vaultId: meta.vault_id,
      name: meta.name,
      mode: meta.mode,
      token: options.token,
    };
    saveVaultConfig(config, options.configPath);
    return { config, recoveryCode: newRecovery };
  } finally {
    await zeroKey(dataKey);
  }
}

export async function fetchVaultMeta(fetchImpl: typeof fetch, relayUrl: string, token: string): Promise<VaultMeta> {
  const response = await relayRequest(fetchImpl, relayUrl, "/v1/vaults/me", { token });
  return (await response.json()) as VaultMeta;
}

async function unlockWithMeta(meta: VaultMeta, passphrase: string): Promise<Uint8Array> {
  const salt = await fromBase64(meta.salt_b64);
  const wrapped = await fromBase64(meta.wrapped_passphrase_b64);
  const kdf: KdfParams | undefined = meta.kdf ? { opsLimit: meta.kdf.ops_limit, memLimit: meta.kdf.mem_limit } : undefined;
  try {
    return await unwrapMasterKey(wrapped, passphrase, salt, kdf);
  } catch {
    throw new Error("wrong vault passphrase (or corrupted vault metadata)");
  }
}

export async function unlockVault(config: VaultConfig, passphrase: string, fetchImpl: typeof fetch = fetch): Promise<Uint8Array> {
  const meta = await fetchVaultMeta(fetchImpl, config.relayUrl, config.token);
  return unlockWithMeta(meta, passphrase);
}

/** Everything wired: unlock, point the local store at the relay, sync. */
export async function openVaultSync(
  config: VaultConfig,
  passphrase: string,
  store: IngestStore,
  root: string,
  fetchImpl: typeof fetch = fetch
): Promise<SyncClient> {
  const key = await unlockVault(config, passphrase, fetchImpl);
  return new SyncClient(store.syncSource(root), new HttpRelayStore(config.relayUrl, config.token, { fetchImpl }), key);
}
