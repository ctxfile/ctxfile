import { decryptBlob, deriveBlobId, encryptBlob } from "./crypto.js";

/**
 * The Sync mailbox protocol, client side (M2). Push/pull of encrypted blobs
 * with last-write-wins per blob and tombstones; no CRDTs, because a vault is
 * single-user. The relay implements RelayStore (M3: Fly.io/R2; tests: an
 * in-memory stub) and only ever sees opaque ids, version numbers, and
 * ciphertext. Both sides converge because versions are the source records'
 * own updated-at clocks and apply() is idempotent.
 *
 * Records that must not converge by last-write-wins (task state: two devices
 * must never both win a claim) carry a `baseVersion`, and their push is a
 * compare-and-set: the relay stores it only if its current version is still
 * the base. A refused push pulls the relay's version instead.
 */

/** What the relay sees per blob: opaque id, version, deletion flag. */
export interface SyncBlobMeta {
  id: string;
  version: number;
  deleted: boolean;
}

export interface RelayPutOptions {
  /** Compare-and-set: the version the relay must currently hold, or null
      when the blob must not exist yet. Omitted means plain last-write-wins. */
  ifVersion?: number | null;
}

/** Thrown by RelayStore.put when a compare-and-set finds a different version. */
export class RelayConflictError extends Error {
  constructor(
    readonly blobId: string,
    readonly current: SyncBlobMeta | null
  ) {
    super(`relay holds a different version of blob ${blobId.slice(0, 8)}`);
    this.name = "RelayConflictError";
  }
}

/** The relay contract. M3 implements this over HTTP + R2; the same shape
    self-hosts as the Team hub's storage. */
export interface RelayStore {
  list(): Promise<SyncBlobMeta[]>;
  get(id: string): Promise<{ meta: SyncBlobMeta; data: Uint8Array } | null>;
  /** Resolves false when the relay kept a newer version instead (plain
      last-write-wins refusal); void counts as stored. */
  put(id: string, meta: SyncBlobMeta, data: Uint8Array, options?: RelayPutOptions): Promise<boolean | void>;
}

/** One syncable record, plaintext side. The payload carries its own natural
    identity, so tombstones and cross-device applies never depend on ids the
    relay can read. */
export interface SyncEntry {
  naturalId: string;
  /** LWW clock: the record's own updated-at, in ms. */
  version: number;
  deleted: boolean;
  payload: Uint8Array;
  /** Set for compare-and-set records: the relay version this record was last
      in agreement with (null: never pushed). Undefined means plain LWW. */
  baseVersion?: number | null;
}

/** How a local source classifies a decrypted payload it was handed. */
export interface PayloadClass {
  /** False when this build does not understand the payload's kind. */
  known: boolean;
  kind: string | null;
}

export interface LocalBlobSource {
  snapshot(): Promise<SyncEntry[]>;
  /** Applies remote entries with its own LWW check; returns how many changed local state. */
  apply(entries: SyncEntry[]): Promise<number>;
  /** Optional: tells the client which payloads this build cannot use. */
  classify?(payload: Uint8Array): PayloadClass;
  /** Optional: blob ids already downloaded and found unusable, with the
      version seen. Only kinds this build still does not know are returned. */
  skipped?(): Promise<Map<string, number>>;
  /** Optional: remembers unusable blobs so they are not downloaded again. */
  recordSkipped?(entries: { blobId: string; version: number; kind: string | null }[]): Promise<void>;
  /** Optional: a compare-and-set push succeeded; the relay now holds `version`. */
  markSynced?(entries: { naturalId: string; version: number }[]): Promise<void>;
  /** Optional: how many local, never-pushed changes the last applies replaced
      with the relay's version (they lost a race); resets the count. */
  takeConflicts?(): number;
}

export interface SyncResult {
  pushed: number;
  applied: number;
  /** Compare-and-set pushes the relay refused because another device changed
      the record first; the relay's version was applied locally instead. */
  conflicts: number;
}

export class SyncClient {
  constructor(
    private readonly local: LocalBlobSource,
    private readonly relay: RelayStore,
    private readonly key: Uint8Array
  ) {}

  private async opaqueIds(entries: SyncEntry[]): Promise<Map<string, SyncEntry>> {
    const map = new Map<string, SyncEntry>();
    for (const entry of entries) {
      map.set(await deriveBlobId(this.key, entry.naturalId), entry);
    }
    return map;
  }

  /** Uploads every local blob that is newer than (or absent from) the relay.
      Compare-and-set records that lost a race are replaced by the relay's
      version; `conflicts` counts them. */
  async push(): Promise<{ pushed: number; conflicts: number }> {
    const local = await this.opaqueIds(await this.local.snapshot());
    const remote = new Map((await this.relay.list()).map((m) => [m.id, m]));
    let pushed = 0;
    let conflicts = 0;
    const synced: { naturalId: string; version: number }[] = [];
    for (const [id, entry] of local) {
      const theirs = remote.get(id);
      const cas = entry.baseVersion !== undefined;
      // A compare-and-set record has news only if it moved past the version
      // both sides agreed on. Comparing clocks instead would miss two devices
      // that bumped the same base to the same number.
      if (cas ? entry.baseVersion === entry.version : theirs !== undefined && theirs.version >= entry.version) continue;
      const data = await encryptBlob(this.key, entry.payload, id);
      const meta = { id, version: entry.version, deleted: entry.deleted };
      let stored: boolean;
      try {
        stored = (await this.relay.put(id, meta, data, cas ? { ifVersion: entry.baseVersion ?? null } : undefined)) !== false;
      } catch (error) {
        if (!(error instanceof RelayConflictError)) throw error;
        // The relay lost the blob this record was based on (restore, migration):
        // re-create it rather than conflicting on every sync forever.
        if (error.current === null && entry.baseVersion !== null && (await this.relay.get(id)) === null) {
          try {
            stored = (await this.relay.put(id, meta, data, { ifVersion: null })) !== false;
          } catch (retryError) {
            if (!(retryError instanceof RelayConflictError)) throw retryError;
            stored = false;
          }
        } else {
          stored = false;
        }
      }
      if (!stored) {
        if (cas) {
          conflicts += 1;
          await this.applyRemote(id);
        }
        continue;
      }
      pushed += 1;
      if (cas) synced.push({ naturalId: entry.naturalId, version: entry.version });
    }
    if (synced.length > 0) await this.local.markSynced?.(synced);
    return { pushed, conflicts };
  }

  private async applyRemote(id: string): Promise<void> {
    const blob = await this.relay.get(id);
    if (!blob) return;
    const payload = await decryptBlob(this.key, blob.data, id);
    await this.local.apply([{ naturalId: id, version: blob.meta.version, deleted: blob.meta.deleted, payload }]);
  }

  /** Downloads and applies every remote blob newer than local state. Blobs of
      a kind this build does not understand are downloaded once and then
      skipped until their version changes. */
  async pull(): Promise<number> {
    const local = await this.opaqueIds(await this.local.snapshot());
    const skipped = (await this.local.skipped?.()) ?? new Map<string, number>();
    const incoming: SyncEntry[] = [];
    const unusable: { blobId: string; version: number; kind: string | null }[] = [];
    for (const meta of await this.relay.list()) {
      const mine = local.get(meta.id);
      if (mine) {
        // Compare-and-set records compare against the agreed version: the
        // relay moved on if it holds anything newer than that, whatever the
        // local clock says.
        const agreed = mine.baseVersion !== undefined ? mine.baseVersion : mine.version;
        if (agreed !== null && agreed >= meta.version) continue;
      }
      const skippedAt = skipped.get(meta.id);
      if (skippedAt !== undefined && skippedAt >= meta.version) continue;
      const blob = await this.relay.get(meta.id);
      if (!blob) continue;
      const payload = await decryptBlob(this.key, blob.data, meta.id);
      const cls = this.local.classify?.(payload);
      if (cls && !cls.known) {
        unusable.push({ blobId: meta.id, version: meta.version, kind: cls.kind });
        continue;
      }
      incoming.push({
        // The payload carries the natural id; the source re-derives it there.
        naturalId: meta.id,
        version: meta.version,
        deleted: meta.deleted,
        payload,
      });
    }
    if (unusable.length > 0) await this.local.recordSkipped?.(unusable);
    if (incoming.length === 0) return 0;
    return this.local.apply(incoming);
  }

  /** Pull first (so local LWW sees the freshest remote), then push. */
  async sync(): Promise<SyncResult> {
    const applied = await this.pull();
    const result = await this.push();
    // A source that tallies replaced local changes counts both kinds: found on
    // pull, and found by a refused push (whose remote apply it also saw).
    const conflicts = this.local.takeConflicts ? this.local.takeConflicts() : result.conflicts;
    return { pushed: result.pushed, applied, conflicts };
  }
}
