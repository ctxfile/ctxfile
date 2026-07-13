import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Org identity (Enterprise PRD §4.1): every hub carries an org_id and an
 * Ed25519 keypair. Federation grants are signed by the issuing org and
 * redeemed only by orgs whose public keys this hub explicitly trusts —
 * invite-only federation, by exchanged identity, no discovery.
 */

export interface OrgIdentity {
  orgId: string;
  publicKeyPem: string;
  privateKey: KeyObject;
}

export function loadOrCreateOrgIdentity(dataDir: string, orgId: string): OrgIdentity {
  const filePath = path.join(dataDir, "org-identity.json");
  if (existsSync(filePath)) {
    const stored = JSON.parse(readFileSync(filePath, "utf8")) as {
      orgId: string;
      publicKeyPem: string;
      privateKeyPem: string;
    };
    return {
      orgId: stored.orgId,
      publicKeyPem: stored.publicKeyPem,
      privateKey: createPrivateKey(stored.privateKeyPem),
    };
  }
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  writeFileSync(filePath, `${JSON.stringify({ orgId, publicKeyPem, privateKeyPem }, null, 2)}\n`, "utf8");
  chmodSync(filePath, 0o600);
  console.error(`ctxfile-relay: generated org identity "${orgId}" at ${filePath} (mode 600)`);
  return { orgId, publicKeyPem, privateKey };
}

/** A federation grant document; signed canonically (sorted keys) so both
    hubs compute identical bytes. */
export interface FederationGrantDoc {
  gid: string;
  issuer_org: string;
  issuer_url: string;
  audience_org: string;
  vault_id: string;
  thread_title: string;
  permission: "read" | "read+ingest";
  exp: number;
}

export function canonicalJson(value: Record<string, unknown>): string {
  return JSON.stringify(value, Object.keys(value).sort());
}

export function signGrantDoc(identity: OrgIdentity, doc: FederationGrantDoc): string {
  return sign(null, Buffer.from(canonicalJson({ ...doc })), identity.privateKey).toString("base64");
}

export function verifyGrantSig(publicKeyPem: string, doc: FederationGrantDoc, sigB64: string): boolean {
  try {
    return verify(null, Buffer.from(canonicalJson({ ...doc })), createPublicKey(publicKeyPem), Buffer.from(sigB64, "base64"));
  } catch {
    return false;
  }
}

/** Signature a requesting hub makes over a grant id, proving it holds the
    audience org's key when redeeming. */
export function signRedemption(identity: OrgIdentity, gid: string): string {
  return sign(null, Buffer.from(`redeem:${gid}`), identity.privateKey).toString("base64");
}

export function verifyRedemption(publicKeyPem: string, gid: string, sigB64: string): boolean {
  try {
    return verify(null, Buffer.from(`redeem:${gid}`), createPublicKey(publicKeyPem), Buffer.from(sigB64, "base64"));
  } catch {
    return false;
  }
}
