import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";
import type { SyncBlobMeta } from "ctxfile";

/**
 * The relay's datastore. One SQLite file under the data directory (an R2/
 * object-store backend slots in behind the same methods for the hosted
 * deployment). Blobs are ciphertext; vault metadata is wraps and salts;
 * tokens are stored as hashes; the audit table is append-only by convention —
 * nothing in this codebase updates or deletes audit rows.
 */

export interface VaultRow {
  id: string;
  name: string;
  mode: "standard" | "strict";
  salt_b64: string;
  kdf_ops: number | null;
  kdf_mem: number | null;
  wrapped_passphrase_b64: string;
  wrapped_recovery_b64: string;
  /** Keyring-wrapped data key; null for strict vaults (never enrolled). */
  wrapped_data_key_b64: string | null;
  org_id: string | null;
  created_at: number;
}

export type TokenKind = "vault" | "grant";

export interface TokenRow {
  id: string;
  vault_id: string;
  name: string;
  token_hash: string;
  scopes: string;
  kind: TokenKind;
  grant_thread: string | null;
  grant_permission: "read" | "read+ingest" | null;
  expires_at: number | null;
  revoked_at: number | null;
  created_at: number;
  last_used_at: number | null;
}

export interface FederationGrantRow {
  id: string;
  vault_id: string;
  thread_title: string;
  audience_org: string;
  permission: "read" | "read+ingest";
  expires_at: number;
  revoked_at: number | null;
  created_at: number;
  doc_json: string;
  sig_b64: string;
}

export interface AuditRow {
  id: number;
  ts: number;
  vault_id: string | null;
  actor: string;
  action: string;
  detail: string;
  org_id: string | null;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function mintToken(): string {
  return `ctx_${randomBytes(32).toString("base64url")}`;
}

export class RelayDb {
  readonly db: Database.Database;

  constructor(dataDir: string) {
    this.db = new Database(path.join(dataDir, "relay.db"));
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vaults (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mode TEXT NOT NULL,
        salt_b64 TEXT NOT NULL,
        kdf_ops INTEGER,
        kdf_mem INTEGER,
        wrapped_passphrase_b64 TEXT NOT NULL,
        wrapped_recovery_b64 TEXT NOT NULL,
        wrapped_data_key_b64 TEXT,
        org_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tokens (
        id TEXT PRIMARY KEY,
        vault_id TEXT NOT NULL,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        scopes TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'vault',
        grant_thread TEXT,
        grant_permission TEXT,
        expires_at INTEGER,
        revoked_at INTEGER,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS blobs (
        vault_id TEXT NOT NULL,
        id TEXT NOT NULL,
        version INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        data BLOB NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (vault_id, id)
      );
      CREATE TABLE IF NOT EXISTS federation_grants (
        id TEXT PRIMARY KEY,
        vault_id TEXT NOT NULL,
        thread_title TEXT NOT NULL,
        audience_org TEXT NOT NULL,
        permission TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        revoked_at INTEGER,
        created_at INTEGER NOT NULL,
        doc_json TEXT NOT NULL,
        sig_b64 TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS trusted_orgs (
        org_id TEXT PRIMARY KEY,
        public_key_pem TEXT NOT NULL,
        added_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        vault_id TEXT,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '{}',
        org_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_vault ON audit (vault_id, ts DESC);
    `);
  }

  // --- vaults ---------------------------------------------------------------

  createVault(input: {
    name: string;
    mode: "standard" | "strict";
    salt_b64: string;
    kdf_ops: number | null;
    kdf_mem: number | null;
    wrapped_passphrase_b64: string;
    wrapped_recovery_b64: string;
  }): { vault: VaultRow; token: string } {
    const id = randomUUID();
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO vaults (id, name, mode, salt_b64, kdf_ops, kdf_mem, wrapped_passphrase_b64, wrapped_recovery_b64, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.name, input.mode, input.salt_b64, input.kdf_ops, input.kdf_mem, input.wrapped_passphrase_b64, input.wrapped_recovery_b64, now);
    const token = this.createToken(id, "device-1", ["read:context", "write:sessions"]);
    return { vault: this.getVault(id) as VaultRow, token };
  }

  getVault(id: string): VaultRow | null {
    return (this.db.prepare("SELECT * FROM vaults WHERE id = ?").get(id) as VaultRow | undefined) ?? null;
  }

  listVaults(): VaultRow[] {
    return this.db.prepare("SELECT * FROM vaults ORDER BY created_at").all() as VaultRow[];
  }

  setWrappedDataKey(vaultId: string, wrapped: string): void {
    this.db.prepare("UPDATE vaults SET wrapped_data_key_b64 = ? WHERE id = ?").run(wrapped, vaultId);
  }

  /** Re-wrap after a passphrase reset (recovery flow): the data key is
      unchanged, only the passphrase/recovery wraps are replaced. */
  setWraps(vaultId: string, wrappedPassphrase: string, wrappedRecovery: string): void {
    this.db
      .prepare("UPDATE vaults SET wrapped_passphrase_b64 = ?, wrapped_recovery_b64 = ? WHERE id = ?")
      .run(wrappedPassphrase, wrappedRecovery, vaultId);
  }

  // --- tokens (vault devices and handoff grants share the table) -----------

  createToken(
    vaultId: string,
    name: string,
    scopes: string[],
    options: { kind?: TokenKind; grantThread?: string; grantPermission?: "read" | "read+ingest"; expiresAt?: number } = {}
  ): string {
    const token = mintToken();
    this.db
      .prepare(
        `INSERT INTO tokens (id, vault_id, name, token_hash, scopes, kind, grant_thread, grant_permission, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        vaultId,
        name,
        hashToken(token),
        JSON.stringify(scopes),
        options.kind ?? "vault",
        options.grantThread ?? null,
        options.grantPermission ?? null,
        options.expiresAt ?? null,
        Date.now()
      );
    return token;
  }

  /** Resolves a presented bearer token: hash lookup, then liveness checks. */
  resolveToken(presented: string, now = Date.now()): TokenRow | null {
    const row = this.db.prepare("SELECT * FROM tokens WHERE token_hash = ?").get(hashToken(presented)) as
      | TokenRow
      | undefined;
    if (!row) return null;
    if (row.revoked_at !== null) return null;
    if (row.expires_at !== null && now > row.expires_at) return null;
    this.db.prepare("UPDATE tokens SET last_used_at = ? WHERE id = ?").run(now, row.id);
    return row;
  }

  listTokens(vaultId?: string): TokenRow[] {
    return vaultId
      ? (this.db.prepare("SELECT * FROM tokens WHERE vault_id = ? ORDER BY created_at").all(vaultId) as TokenRow[])
      : (this.db.prepare("SELECT * FROM tokens ORDER BY created_at").all() as TokenRow[]);
  }

  /** Revokes a token by id. Pass `vaultId` to scope the revoke to one vault
      (the HTTP surface does this so a device token can never revoke another
      vault's grants); the operator CLI omits it to act across vaults. */
  revokeToken(id: string, vaultId?: string, now = Date.now()): boolean {
    return vaultId
      ? this.db
          .prepare("UPDATE tokens SET revoked_at = ? WHERE id = ? AND vault_id = ? AND revoked_at IS NULL")
          .run(now, id, vaultId).changes > 0
      : this.db.prepare("UPDATE tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(now, id).changes > 0;
  }

  // --- blobs (ciphertext only) ----------------------------------------------

  listBlobs(vaultId: string): SyncBlobMeta[] {
    const rows = this.db.prepare("SELECT id, version, deleted FROM blobs WHERE vault_id = ?").all(vaultId) as {
      id: string;
      version: number;
      deleted: number;
    }[];
    return rows.map((r) => ({ id: r.id, version: r.version, deleted: r.deleted === 1 }));
  }

  getBlob(vaultId: string, id: string): { meta: SyncBlobMeta; data: Uint8Array } | null {
    const row = this.db.prepare("SELECT id, version, deleted, data FROM blobs WHERE vault_id = ? AND id = ?").get(vaultId, id) as
      | { id: string; version: number; deleted: number; data: Buffer }
      | undefined;
    if (!row) return null;
    return { meta: { id: row.id, version: row.version, deleted: row.deleted === 1 }, data: new Uint8Array(row.data) };
  }

  /** LWW at the relay too: an older version never clobbers a newer one. */
  putBlob(vaultId: string, id: string, meta: SyncBlobMeta, data: Uint8Array): boolean {
    const existing = this.db.prepare("SELECT version FROM blobs WHERE vault_id = ? AND id = ?").get(vaultId, id) as
      | { version: number }
      | undefined;
    if (existing && existing.version >= meta.version) return false;
    this.db
      .prepare(
        `INSERT INTO blobs (vault_id, id, version, deleted, data, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (vault_id, id) DO UPDATE SET version = excluded.version, deleted = excluded.deleted,
           data = excluded.data, updated_at = excluded.updated_at`
      )
      .run(vaultId, id, meta.version, meta.deleted ? 1 : 0, Buffer.from(data), Date.now());
    return true;
  }

  // --- federation grants ------------------------------------------------------

  saveFederationGrant(row: Omit<FederationGrantRow, "revoked_at" | "created_at">): void {
    this.db
      .prepare(
        `INSERT INTO federation_grants (id, vault_id, thread_title, audience_org, permission, expires_at, created_at, doc_json, sig_b64)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(row.id, row.vault_id, row.thread_title, row.audience_org, row.permission, row.expires_at, Date.now(), row.doc_json, row.sig_b64);
  }

  getFederationGrant(id: string): FederationGrantRow | null {
    return (
      (this.db.prepare("SELECT * FROM federation_grants WHERE id = ?").get(id) as FederationGrantRow | undefined) ?? null
    );
  }

  listFederationGrants(vaultId?: string): FederationGrantRow[] {
    return vaultId
      ? (this.db.prepare("SELECT * FROM federation_grants WHERE vault_id = ? ORDER BY created_at DESC").all(vaultId) as FederationGrantRow[])
      : (this.db.prepare("SELECT * FROM federation_grants ORDER BY created_at DESC").all() as FederationGrantRow[]);
  }

  revokeFederationGrant(id: string, now = Date.now()): boolean {
    return (
      this.db.prepare("UPDATE federation_grants SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(now, id)
        .changes > 0
    );
  }

  // --- trusted orgs (invite-only federation) ---------------------------------

  trustOrg(orgId: string, publicKeyPem: string): void {
    this.db
      .prepare(
        "INSERT INTO trusted_orgs (org_id, public_key_pem, added_at) VALUES (?, ?, ?) ON CONFLICT (org_id) DO UPDATE SET public_key_pem = excluded.public_key_pem"
      )
      .run(orgId, publicKeyPem, Date.now());
  }

  trustedOrgKey(orgId: string): string | null {
    const row = this.db.prepare("SELECT public_key_pem FROM trusted_orgs WHERE org_id = ?").get(orgId) as
      | { public_key_pem: string }
      | undefined;
    return row?.public_key_pem ?? null;
  }

  // --- audit (append-only) ----------------------------------------------------

  audit(entry: { vaultId?: string | null; actor: string; action: string; detail?: Record<string, unknown>; orgId?: string | null }): void {
    this.db
      .prepare("INSERT INTO audit (ts, vault_id, actor, action, detail, org_id) VALUES (?, ?, ?, ?, ?, ?)")
      .run(Date.now(), entry.vaultId ?? null, entry.actor, entry.action, JSON.stringify(entry.detail ?? {}), entry.orgId ?? null);
  }

  auditRows(vaultId?: string, limit = 200): AuditRow[] {
    return vaultId
      ? (this.db.prepare("SELECT * FROM audit WHERE vault_id = ? ORDER BY id DESC LIMIT ?").all(vaultId, limit) as AuditRow[])
      : (this.db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT ?").all(limit) as AuditRow[]);
  }

  close(): void {
    this.db.close();
  }
}
