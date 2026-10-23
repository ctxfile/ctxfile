import { destroyKeyFile, type MasterKeyring } from "./keyring.js";
import type { RelayDb } from "./store.js";

/**
 * Operator tools for the relay's master key: see which key every stored wrap
 * depends on, move them all onto the primary key after a rotation, and retire
 * the on-disk key file once nothing needs it. Only key ids and counts are
 * ever printed.
 */

interface WrapRow {
  table: "vaults" | "push_targets";
  id: string;
  wrapped: string;
}

function hasTable(db: RelayDb, name: string): boolean {
  return db.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
}

function storedWraps(db: RelayDb): WrapRow[] {
  const rows: WrapRow[] = (
    db.db.prepare("SELECT id, wrapped_data_key_b64 AS wrapped FROM vaults WHERE wrapped_data_key_b64 IS NOT NULL").all() as {
      id: string;
      wrapped: string;
    }[]
  ).map((r) => ({ table: "vaults", id: r.id, wrapped: r.wrapped }));
  if (hasTable(db, "push_targets")) {
    for (const r of db.db.prepare("SELECT id, secret_wrapped AS wrapped FROM push_targets").all() as { id: string; wrapped: string }[]) {
      rows.push({ table: "push_targets", id: r.id, wrapped: r.wrapped });
    }
  }
  return rows;
}

export interface KeyringStatus {
  primary: { id: string; source: string };
  older: { id: string; source: string }[];
  /** Wraps per key id that opens them. */
  wrapsByKey: Record<string, number>;
  /** Wraps no loaded key opens (a lost key): their vaults cannot serve. */
  unreadable: number;
  /** Wraps not yet in the current format under the primary key. */
  needRewrap: number;
  /** True when a key file is loaded and some wrap still opens only with it. */
  keyFileStillNeeded: boolean;
}

export function keyringStatus(db: RelayDb, keyring: MasterKeyring): KeyringStatus {
  const wrapsByKey: Record<string, number> = {};
  let unreadable = 0;
  let needRewrap = 0;
  for (const row of storedWraps(db)) {
    const id = keyring.keyIdOf(row.wrapped);
    if (id === null) unreadable += 1;
    else wrapsByKey[id] = (wrapsByKey[id] ?? 0) + 1;
    if (!keyring.isCurrent(row.wrapped)) needRewrap += 1;
  }
  const file = keyring.keys.find((k) => k.source === "file");
  return {
    primary: { id: keyring.primary.id, source: keyring.primary.source },
    older: keyring.older.map((k) => ({ id: k.id, source: k.source })),
    wrapsByKey,
    unreadable,
    needRewrap,
    keyFileStillNeeded: file !== undefined && (wrapsByKey[file.id] ?? 0) > 0,
  };
}

/** Re-wraps everything under the primary key, in one transaction. Wraps no
    loaded key can open are left as they are and counted. */
export function rewrapAll(db: RelayDb, keyring: MasterKeyring): { rewrapped: number; unreadable: number } {
  let rewrapped = 0;
  let unreadable = 0;
  db.db.transaction(() => {
    for (const row of storedWraps(db)) {
      if (keyring.isCurrent(row.wrapped)) continue;
      let plain: Uint8Array;
      try {
        plain = keyring.unwrap(row.wrapped);
      } catch {
        unreadable += 1;
        continue;
      }
      const next = keyring.wrap(plain);
      if (row.table === "vaults") {
        db.db.prepare("UPDATE vaults SET wrapped_data_key_b64 = ? WHERE id = ?").run(next, row.id);
      } else {
        db.db.prepare("UPDATE push_targets SET secret_wrapped = ? WHERE id = ?").run(next, row.id);
      }
      rewrapped += 1;
    }
  })();
  if (rewrapped > 0) db.audit({ actor: "operator", action: "keyring.rewrap", detail: { rewrapped, primary: keyring.primary.id } });
  return { rewrapped, unreadable };
}

/** Deletes the data directory's key file, but only when the primary key is a
    secret and no stored wrap still depends on the file. */
export function retireKeyFile(db: RelayDb, keyring: MasterKeyring, dataDir: string): { ok: true } | { ok: false; error: string } {
  if (keyring.primary.source === "file") {
    return { ok: false, error: "the key file is still the primary key; set CTXFILE_RELAY_MASTER_KEY and run `keyring rewrap` first" };
  }
  const status = keyringStatus(db, keyring);
  if (status.keyFileStillNeeded) {
    return { ok: false, error: "some wraps still open only with the key file; run `ctxfile-relay keyring rewrap` first" };
  }
  if (!destroyKeyFile(dataDir)) return { ok: false, error: "no key file in the data directory" };
  db.audit({ actor: "operator", action: "keyring.retire_file", detail: { primary: keyring.primary.id } });
  return { ok: true };
}
