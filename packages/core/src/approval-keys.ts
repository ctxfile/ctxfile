import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { approvalStatement, effectStatement, taskContentHash, type EffectDecision, type TaskRecord } from "./tasks.js";

/**
 * The device approval key: an Ed25519 keypair that lives only on the user's
 * own machine (mode 600, never synced, never sent anywhere). The dashboard
 * and CLI sign every task approval and effect decision with it. Its public
 * key is enrolled with the user's vault, so the relay can check that an
 * "approved" task really was approved on one of the user's devices before it
 * wakes any agent, and so a forged approval written by anything else fails.
 */

export interface ApprovalKey {
  keyId: string;
  /** Base64 SPKI DER; what gets enrolled and stored beside each signature. */
  publicKey: string;
  sign(statement: string): string;
}

interface StoredKey {
  key_id: string;
  public_key_spki_b64: string;
  private_key_pkcs8_b64: string;
}

export const APPROVAL_KEY_FILE = "approval-key.json";

export function approvalKeyId(publicKeySpkiB64: string): string {
  return createHash("sha256").update(Buffer.from(publicKeySpkiB64, "base64")).digest("hex").slice(0, 16);
}

function fromStored(stored: StoredKey): ApprovalKey {
  const privateKey: KeyObject = createPrivateKey({
    key: Buffer.from(stored.private_key_pkcs8_b64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  return {
    keyId: stored.key_id,
    publicKey: stored.public_key_spki_b64,
    sign: (statement: string) => sign(null, Buffer.from(statement, "utf8"), privateKey).toString("base64"),
  };
}

/** Loads this device's approval key from `dir`, creating it on first use. */
export function loadOrCreateApprovalKey(dir: string): ApprovalKey {
  const file = path.join(dir, APPROVAL_KEY_FILE);
  try {
    const stored = JSON.parse(readFileSync(file, "utf8")) as Partial<StoredKey>;
    if (stored.key_id && stored.public_key_spki_b64 && stored.private_key_pkcs8_b64) {
      return fromStored(stored as StoredKey);
    }
  } catch {
    // first use or unreadable: mint a fresh key below
  }
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const stored: StoredKey = {
    key_id: approvalKeyId(publicB64),
    public_key_spki_b64: publicB64,
    private_key_pkcs8_b64: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${JSON.stringify(stored, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // best-effort on platforms without POSIX modes
  }
  return fromStored(stored);
}

/** This device's approval key id, without creating a key (null if none yet). */
export function readApprovalKeyId(dir: string): string | null {
  const file = path.join(dir, APPROVAL_KEY_FILE);
  if (!existsSync(file)) return null;
  try {
    const stored = JSON.parse(readFileSync(file, "utf8")) as Partial<StoredKey>;
    return typeof stored.key_id === "string" ? stored.key_id : null;
  } catch {
    return null;
  }
}

/** Ed25519 verification results, memoized: the relay re-checks every task's
    approval on every inbox read, and the inputs are immutable strings. */
const verifyMemo = new Map<string, boolean>();
const VERIFY_MEMO_MAX = 10_000;

export function verifyStatement(statement: string, signatureB64: string, publicKeySpkiB64: string): boolean {
  const memoKey = `${publicKeySpkiB64}\u0000${signatureB64}\u0000${statement}`;
  const memo = verifyMemo.get(memoKey);
  if (memo !== undefined) return memo;
  const result = verifyUncached(statement, signatureB64, publicKeySpkiB64);
  if (verifyMemo.size >= VERIFY_MEMO_MAX) verifyMemo.clear();
  verifyMemo.set(memoKey, result);
  return result;
}

function verifyUncached(statement: string, signatureB64: string, publicKeySpkiB64: string): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(publicKeySpkiB64, "base64"), format: "der", type: "spki" });
    return verify(null, Buffer.from(statement, "utf8"), key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

/** True when the task's approval matches the task's current content and
    carries a valid signature from a key in `trusted` (key ids). Pass null to
    check the content binding and the signature alone. */
export function verifyTaskApproval(task: TaskRecord, trusted: ReadonlySet<string> | null): boolean {
  const approval = task.approval;
  if (!approval?.signature || !approval.public_key || !approval.key_id) return false;
  if (approval.content_hash !== taskContentHash(task)) return false;
  if (approvalKeyId(approval.public_key) !== approval.key_id) return false;
  if (trusted && !trusted.has(approval.key_id)) return false;
  return verifyStatement(approvalStatement(task.task_id, approval), approval.signature, approval.public_key);
}

/** True when an effect decision carries a valid signature from a trusted key. */
export function verifyEffectDecision(taskId: string, decision: EffectDecision, trusted: ReadonlySet<string> | null): boolean {
  if (!decision.signature || !decision.public_key || !decision.key_id) return false;
  if (approvalKeyId(decision.public_key) !== decision.key_id) return false;
  if (trusted && !trusted.has(decision.key_id)) return false;
  return verifyStatement(effectStatement(taskId, decision), decision.signature, decision.public_key);
}

/** The key ids this device trusts: its own approval key (if it has one) plus
    the keys its vault has enrolled, as learned at the last sync. */
export function trustedApproverKeys(dir: string, learned: readonly string[]): Set<string> {
  const own = readApprovalKeyId(dir);
  return new Set(own ? [own, ...learned] : learned);
}

/** A task as a reader should see it: an approval or effect decision that does
    not verify against a trusted key is dropped (the record on disk is left
    alone). Every door that shows a task to an agent, a person, or the push
    logic goes through this, so a forged approval written by anything that can
    reach the store or the vault never counts. */
export function presentTask(task: TaskRecord, trusted: ReadonlySet<string>): TaskRecord {
  const approval = task.approval && verifyTaskApproval(task, trusted) ? task.approval : null;
  const decisions = task.effect_decisions.filter((d) => verifyEffectDecision(task.task_id, d, trusted));
  if (approval === task.approval && decisions.length === task.effect_decisions.length) return task;
  return { ...task, approval, effect_decisions: decisions };
}

/** Agent actions never change approvals or effect decisions. After a
    transition computed on a presented task, put the stored originals back so
    the write does not destroy a real approval this reader cannot verify yet
    (for example one from a device whose key it has not learned). */
export function restoreTrustFields(next: TaskRecord, original: TaskRecord): TaskRecord {
  return { ...next, approval: original.approval, effect_decisions: original.effect_decisions };
}
