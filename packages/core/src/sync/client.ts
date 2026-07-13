import { decryptBlob, deriveBlobId, encryptBlob } from "./crypto.js";

/**
 * The Sync mailbox protocol, client side (M2). Push/pull of encrypted blobs
 * with last-write-wins per blob and tombstones; no CRDTs, because a vault is
 * single-user. The relay implements RelayStore (M3: Fly.io/R2; tests: an
 * in-memory stub) and only ever sees opaque ids, version numbers, and
 * ciphertext. Both sides converge because versions are the source records'
 * own updated-at clocks and apply() is idempotent.
 */

/** What the relay sees per blob: opaque id, version, deletion flag. */
export interface SyncBlobMeta {
  id: string;
  version: number;
  deleted: boolean;
}

/** The relay contract. M3 implements this over HTTP + R2; the same shape
    self-hosts as the Team hub's storage. */
export interface RelayStore {
  list(): Promise<SyncBlobMeta[]>;
  get(id: string): Promise<{ meta: SyncBlobMeta; data: Uint8Array } | null>;
  put(id: string, meta: SyncBlobMeta, data: Uint8Array): Promise<void>;
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
}

export interface LocalBlobSource {
  snapshot(): Promise<SyncEntry[]>;
  /** Applies remote entries with its own LWW check; returns how many changed local state. */
  apply(entries: SyncEntry[]): Promise<number>;
}

export interface SyncResult {
  pushed: number;
  applied: number;
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

  /** Uploads every local blob that is newer than (or absent from) the relay. */
  async push(): Promise<number> {
    const local = await this.opaqueIds(await this.local.snapshot());
    const remote = new Map((await this.relay.list()).map((m) => [m.id, m]));
    let pushed = 0;
    for (const [id, entry] of local) {
      const theirs = remote.get(id);
      if (theirs && theirs.version >= entry.version) continue;
      const data = await encryptBlob(this.key, entry.payload, id);
      await this.relay.put(id, { id, version: entry.version, deleted: entry.deleted }, data);
      pushed += 1;
    }
    return pushed;
  }

  /** Downloads and applies every remote blob newer than local state. */
  async pull(): Promise<number> {
    const local = await this.opaqueIds(await this.local.snapshot());
    const incoming: SyncEntry[] = [];
    for (const meta of await this.relay.list()) {
      const mine = local.get(meta.id);
      if (mine && mine.version >= meta.version) continue;
      const blob = await this.relay.get(meta.id);
      if (!blob) continue;
      const payload = await decryptBlob(this.key, blob.data, meta.id);
      incoming.push({
        // The payload carries the natural id; the source re-derives it there.
        naturalId: meta.id,
        version: meta.version,
        deleted: meta.deleted,
        payload,
      });
    }
    if (incoming.length === 0) return 0;
    return this.local.apply(incoming);
  }

  /** Pull first (so local LWW sees the freshest remote), then push. */
  async sync(): Promise<SyncResult> {
    const applied = await this.pull();
    const pushed = await this.push();
    return { pushed, applied };
  }
}
