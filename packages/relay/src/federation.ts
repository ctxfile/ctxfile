import { deriveBlobId, encryptBlob, type SyncPayload } from "ctxfile";
import type { KeyProvider } from "./keyring.js";
import { signRedemption, type FederationGrantDoc, type OrgIdentity } from "./org.js";
import type { RelayDb } from "./store.js";
import { unwrapDataKey } from "./vault-view.js";

/**
 * The redeeming side of federation (Enterprise PRD §4.1, pull model): hub B
 * presents a grant signed by hub A's org, proves it holds the audience org's
 * key, receives the granted thread's payloads, and stores them into its own
 * vault re-encrypted under its own key with the ORIGINAL clocks, so LWW stays
 * coherent if the grant is redeemed again later. Inbound content keeps its
 * provenance (harness, door, org attribution in the audit) and is served with
 * the same untrusted-data labels as everything else — a partner org's
 * compromise must not become yours.
 */

export interface RedeemOptions {
  db: RelayDb;
  keyring: KeyProvider;
  org: OrgIdentity;
  grantB64: string;
  targetVaultId: string;
  fetchImpl?: typeof fetch;
}

const textEncoder = new TextEncoder();

export async function redeemFederatedGrant(options: RedeemOptions): Promise<{ thread: string; imported: number }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let doc: FederationGrantDoc;
  try {
    doc = (JSON.parse(Buffer.from(options.grantB64, "base64url").toString("utf8")) as { doc: FederationGrantDoc }).doc;
  } catch {
    throw new Error("not a valid federation grant blob");
  }
  const response = await fetchImpl(`${doc.issuer_url.replace(/\/+$/, "")}/v1/federation/redeem`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_b64: options.grantB64,
      requester_org: options.org.orgId,
      redemption_sig_b64: signRedemption(options.org, doc.gid),
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`issuer hub refused the redemption: ${response.status} ${body.slice(0, 200)}`);
  }
  const result = (await response.json()) as { thread_title: string; payloads: SyncPayload[] };

  const vault = options.db.getVault(options.targetVaultId);
  if (!vault) throw new Error(`no such vault "${options.targetVaultId}" on this hub`);
  if (vault.mode !== "standard") throw new Error("importing requires a standard vault on this hub (the hub must be able to encrypt into it)");
  const dataKey = unwrapDataKey(options.keyring, vault);

  let imported = 0;
  for (const payload of result.payloads) {
    const naturalId =
      payload.kind === "thread" ? `thread:${payload.title.toLowerCase()}` : `session:${payload.harness}:${payload.session_id}`;
    const blobId = await deriveBlobId(dataKey, naturalId);
    const version = payload.kind === "thread" ? payload.last_active : payload.updated_at;
    const data = await encryptBlob(dataKey, textEncoder.encode(JSON.stringify(payload)), blobId);
    if (options.db.putBlob(vault.id, blobId, { id: blobId, version, deleted: payload.deleted }, data)) imported += 1;
  }
  options.db.audit({
    vaultId: vault.id,
    actor: `org:${doc.issuer_org}`,
    action: "federation.import",
    detail: { gid: doc.gid, thread: result.thread_title, imported },
    orgId: options.org.orgId,
  });
  return { thread: result.thread_title, imported };
}
