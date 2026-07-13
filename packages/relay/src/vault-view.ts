import {
  buildVaultView,
  decryptBlob,
  deriveBlobId,
  encryptBlob,
  parseSyncPayload,
  redactContent,
  type SessionSyncPayload,
  type SyncPayload,
  type ThreadSyncPayload,
  type VaultView,
} from "ctxfile";
import type { KeyProvider } from "./keyring.js";
import type { RelayDb, VaultRow } from "./store.js";

/**
 * Standard-mode serving (§3): unwrap the vault's data key via the keyring,
 * decrypt blobs IN MEMORY for the lifetime of one request, and give the MCP
 * layer the same view a local IngestStore would. Nothing decrypted is ever
 * persisted or logged; strict vaults never reach this module because they
 * have no enrolled key to unwrap.
 */

export function unwrapDataKey(keyring: KeyProvider, vault: VaultRow): Uint8Array {
  if (!vault.wrapped_data_key_b64) {
    throw new Error("strict vault: this relay holds no key and cannot read the data");
  }
  return keyring.unwrap(vault.wrapped_data_key_b64);
}

export async function loadVaultPayloads(db: RelayDb, dataKey: Uint8Array, vault: VaultRow): Promise<SyncPayload[]> {
  const payloads: SyncPayload[] = [];
  for (const meta of db.listBlobs(vault.id)) {
    const blob = db.getBlob(vault.id, meta.id);
    if (!blob) continue;
    // A blob that fails auth-decryption is treated as absent, not fatal: one
    // corrupted row must not take the whole vault offline.
    try {
      const plaintext = await decryptBlob(dataKey, blob.data, meta.id);
      const payload = parseSyncPayload(plaintext);
      if (payload) payloads.push(payload);
    } catch {
      console.error(`ctxfile-relay: skipping undecryptable blob ${meta.id} in vault ${vault.id}`);
    }
  }
  return payloads;
}

export async function loadView(db: RelayDb, keyring: KeyProvider, vault: VaultRow): Promise<VaultView> {
  const dataKey = unwrapDataKey(keyring, vault);
  return buildVaultView(await loadVaultPayloads(db, dataKey, vault));
}

const textEncoder = new TextEncoder();

function redact(text: string): string {
  return redactContent(text).text;
}

export interface WriteSessionInput {
  harness: string;
  harness_version?: string | null;
  session_id: string;
  door: "save_session" | "ingest_context";
  started_at?: string | null;
  ended_at?: string | null;
  summary: string;
  key_decisions: string[];
  files_touched: string[];
  open_items: string[];
  thread_title: string | null;
  continues_from?: string | null;
  handoff: boolean;
  state?: string | null;
  gotchas: string[];
  artifacts: { ref: string; role: string }[];
  suggested_first_prompt?: string | null;
  trigger?: "auto" | "manual";
}

/** The relay-side write path (chat surfaces saving through /mcp): redact,
    build payloads, encrypt under the vault key, store with LWW versions —
    exactly what a device's own sync push would have produced. */
export async function writeSession(
  db: RelayDb,
  keyring: KeyProvider,
  vault: VaultRow,
  input: WriteSessionInput,
  now = Date.now()
): Promise<{ sessionId: string; revision: number; threadTitle: string | null }> {
  const dataKey = unwrapDataKey(keyring, vault);
  const naturalId = `session:${input.harness}:${input.session_id}`;
  const blobId = await deriveBlobId(dataKey, naturalId);

  let revision = 1;
  const existing = db.getBlob(vault.id, blobId);
  if (existing) {
    try {
      const prior = parseSyncPayload(await decryptBlob(dataKey, existing.data, blobId));
      if (prior?.kind === "session") revision = prior.revision + 1;
    } catch {
      /* unreadable prior blob: overwrite with revision 1 */
    }
  }

  const threadTitle = input.thread_title ? redact(input.thread_title.trim()) : null;
  const payload: SessionSyncPayload = {
    kind: "session",
    harness: input.harness,
    harness_version: input.harness_version ?? null,
    session_id: input.session_id,
    door: input.door,
    started_at: input.started_at ?? null,
    ended_at: input.ended_at ?? null,
    summary: redact(input.summary),
    key_decisions: input.key_decisions.map(redact),
    files_touched: input.files_touched.map(redact),
    open_items: input.open_items.map(redact),
    thread_title: threadTitle,
    continues_from: input.continues_from ?? null,
    handoff: input.handoff,
    state: input.state ? redact(input.state) : null,
    gotchas: input.gotchas.map(redact),
    artifacts: input.artifacts.map((a) => ({ ref: redact(a.ref), role: redact(a.role) })),
    suggested_first_prompt: input.suggested_first_prompt ? redact(input.suggested_first_prompt) : null,
    trigger: input.trigger === "auto" ? "auto" : "manual",
    ingested_at: now,
    updated_at: now,
    revision,
    deleted: false,
  };
  const data = await encryptBlob(dataKey, textEncoder.encode(JSON.stringify(payload)), blobId);
  db.putBlob(vault.id, blobId, { id: blobId, version: now, deleted: false }, data);

  if (threadTitle) {
    await upsertThreadBlob(db, dataKey, vault, threadTitle, now);
  }
  return { sessionId: input.session_id, revision, threadTitle };
}

async function upsertThreadBlob(db: RelayDb, dataKey: Uint8Array, vault: VaultRow, title: string, now: number): Promise<void> {
  const naturalId = `thread:${title.toLowerCase()}`;
  const blobId = await deriveBlobId(dataKey, naturalId);
  let payload: ThreadSyncPayload = {
    kind: "thread",
    title,
    status: "active",
    tags: [],
    created_at: now,
    last_active: now,
    deleted: false,
  };
  const existing = db.getBlob(vault.id, blobId);
  if (existing) {
    try {
      const prior = parseSyncPayload(await decryptBlob(dataKey, existing.data, blobId));
      if (prior?.kind === "thread") {
        payload = { ...prior, last_active: Math.max(prior.last_active, now), deleted: false };
      }
    } catch {
      /* unreadable prior blob: replace */
    }
  }
  const data = await encryptBlob(dataKey, textEncoder.encode(JSON.stringify(payload)), blobId);
  db.putBlob(vault.id, blobId, { id: blobId, version: payload.last_active, deleted: false }, data);
}
