import { randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { SyncBlobMeta } from "ctxfile";
import type { RelayConfig } from "./config.js";
import { LocalKeyProvider, type KeyProvider } from "./keyring.js";
import {
  createVaultMcpServer,
  StreamableHTTPServerTransport,
  WRITE_MAX_PER_MINUTE,
  type GrantScope,
  type VaultMcpServer,
} from "./mcp.js";
import {
  loadOrCreateOrgIdentity,
  signGrantDoc,
  verifyGrantSig,
  verifyRedemption,
  type FederationGrantDoc,
  type OrgIdentity,
} from "./org.js";
import { RelayDb, type TokenRow, type VaultRow } from "./store.js";
import { loadVaultPayloads, unwrapDataKey } from "./vault-view.js";
import { VERSION } from "./version.js";

/**
 * The relay's HTTP surface. Everything except /healthz and the federation
 * redeem (which authenticates by org signatures) requires a bearer token.
 * No plaintext is ever logged: log lines carry ids and counts only.
 */

const MAX_BODY_BYTES = 512 * 1024;
/** MCP tool calls (JSON-RPC) can carry a full session digest, so they get a
    larger ceiling than the metadata routes — but still bounded, so a public
    relay cannot be memory-exhausted by one giant POST. */
const MAX_MCP_BODY_BYTES = 4 * 1024 * 1024;
const BLOB_WRITES_PER_MINUTE = 120;
/** Open (self-host) registration: cap vault creation per source address so an
    unauthenticated relay cannot be flooded into minting vaults and tokens. */
const VAULT_CREATES_PER_HOUR = 10;
/** Bounds on the in-memory MCP session map so init-without-close cannot grow
    it without limit; idle sessions are swept on an interval. */
const MAX_MCP_SESSIONS = 1000;
const SESSION_IDLE_MS = 30 * 60_000;
const SESSION_SWEEP_MS = 5 * 60_000;

export interface RelayContext {
  config: RelayConfig;
  db: RelayDb;
  keyring: KeyProvider;
  org: OrgIdentity;
  /** How this relay names itself in federation grants (redeemers call it back here). */
  publicUrl: string;
}

export function createRelayContext(config: RelayConfig, publicUrl?: string): RelayContext {
  return {
    config,
    db: new RelayDb(config.dataDir),
    keyring: new LocalKeyProvider(config.dataDir),
    org: loadOrCreateOrgIdentity(config.dataDir, config.orgId),
    publicUrl: publicUrl ?? process.env.CTXFILE_RELAY_PUBLIC_URL ?? `http://${config.host}:${config.port}`,
  };
}

export interface RunningRelay {
  port: number;
  host: string;
  publicUrl: string;
  close(): Promise<void>;
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body too large (512KB cap)"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

interface AuthedRequest {
  token: TokenRow;
  vault: VaultRow;
  scopes: string[];
  grant: GrantScope | undefined;
}

export async function startRelay(ctx: RelayContext): Promise<RunningRelay> {
  const { db, config } = ctx;
  const sessions = new Map<
    string,
    { transport: StreamableHTTPServerTransport; server: VaultMcpServer; tokenId: string; lastSeen: number }
  >();
  const blobWriteTimestamps = new Map<string, number[]>();
  const vaultCreateTimestamps = new Map<string, number[]>();
  const mcpWriteTimestamps = new Map<string, number[]>();
  let boundPort = config.port;

  /** Sliding-window rate check. `record` true consumes a slot when under the
      limit; false only peeks (used to gate before doing work). */
  const withinWindow = (
    map: Map<string, number[]>,
    key: string,
    now: number,
    windowMs: number,
    limit: number,
    record: boolean
  ): boolean => {
    const stamps = map.get(key) ?? [];
    while (stamps.length > 0 && now - (stamps[0] ?? 0) > windowMs) stamps.shift();
    map.set(key, stamps);
    if (stamps.length >= limit) return false;
    if (record) stamps.push(now);
    return true;
  };

  const authenticate = (req: http.IncomingMessage): AuthedRequest | null => {
    const header = req.headers.authorization;
    if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
    const token = db.resolveToken(header.slice("Bearer ".length).trim());
    if (!token) return null;
    const vault = db.getVault(token.vault_id);
    if (!vault) return null;
    const grant: GrantScope | undefined =
      token.kind === "grant" && token.grant_thread
        ? { thread: token.grant_thread, permission: token.grant_permission ?? "read", grantName: token.name }
        : undefined;
    return { token, vault, scopes: JSON.parse(token.scopes) as string[], grant };
  };

  const overBlobLimit = (tokenId: string, now: number): boolean =>
    !withinWindow(blobWriteTimestamps, tokenId, now, 60_000, BLOB_WRITES_PER_MINUTE, true);

  const clientAddr = (req: http.IncomingMessage): string => req.socket.remoteAddress ?? "unknown";

  // Sweep idle MCP sessions so init-without-close cannot pin memory forever.
  const sweeper = setInterval(() => {
    const cutoff = Date.now() - SESSION_IDLE_MS;
    for (const [id, entry] of sessions) {
      if (entry.lastSeen < cutoff) {
        sessions.delete(id);
        void entry.server.close().catch(() => undefined);
      }
    }
  }, SESSION_SWEEP_MS);
  sweeper.unref();

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const pathname = (req.url ?? "/").split("?")[0] ?? "/";
    const method = req.method ?? "GET";

    if (pathname === "/healthz") {
      json(res, 200, { ok: true, org: ctx.org.orgId, version: VERSION });
      return;
    }

    if (pathname === "/v1/vaults" && method === "POST") {
      if (config.registration === "closed") {
        json(res, 403, { error: "vault registration is closed on this relay" });
        return;
      }
      // Open registration is unauthenticated by design (self-host/local); cap
      // it per source address so it cannot be flooded into minting vaults.
      if (!withinWindow(vaultCreateTimestamps, clientAddr(req), Date.now(), 3_600_000, VAULT_CREATES_PER_HOUR, true)) {
        json(res, 429, { error: "vault creation rate limit reached; retry later" });
        return;
      }
      const body = (await readBody(req)) as {
        name?: string;
        mode?: string;
        salt_b64?: string;
        kdf?: { ops_limit?: number; mem_limit?: number };
        wrapped_passphrase_b64?: string;
        wrapped_recovery_b64?: string;
      };
      if (
        !body.name ||
        (body.mode !== "standard" && body.mode !== "strict") ||
        !body.salt_b64 ||
        !body.wrapped_passphrase_b64 ||
        !body.wrapped_recovery_b64
      ) {
        json(res, 400, { error: "vault create requires name, mode (standard|strict), salt_b64, wrapped_passphrase_b64, wrapped_recovery_b64" });
        return;
      }
      const { vault, token } = db.createVault({
        name: body.name.slice(0, 120),
        mode: body.mode,
        salt_b64: body.salt_b64,
        kdf_ops: body.kdf?.ops_limit ?? null,
        kdf_mem: body.kdf?.mem_limit ?? null,
        wrapped_passphrase_b64: body.wrapped_passphrase_b64,
        wrapped_recovery_b64: body.wrapped_recovery_b64,
      });
      db.audit({ vaultId: vault.id, actor: "registration", action: "vault.create", detail: { mode: vault.mode } });
      json(res, 200, { vault_id: vault.id, token });
      return;
    }

    if (pathname === "/v1/federation/redeem" && method === "POST") {
      await handleFederationRedeem(ctx, req, res);
      return;
    }

    // Everything below requires a bearer token.
    const auth = authenticate(req);
    if (!auth) {
      res.setHeader("www-authenticate", 'Bearer realm="ctxfile-relay"');
      json(res, 401, { error: "invalid, expired, or missing bearer token" });
      return;
    }
    const { vault, token, grant } = auth;
    // Handoff grant tokens are thread-scoped and belong ONLY on /mcp (where
    // mcp.ts enforces the thread scope). Every REST route below manages vault
    // key material, blobs, grants, and audit for the WHOLE vault, so a grant
    // token must never reach them — otherwise a thread share leaks the vault's
    // wrapped passphrase, all ciphertext, the grant list, and the audit log.
    if (grant && pathname !== "/mcp") {
      json(res, 403, { error: "handoff grant tokens are scoped to /mcp only" });
      return;
    }
    // Past the gate, only device tokens remain, so scope checks are by scope.
    const canRead = auth.scopes.includes("read:context");
    const canWrite = auth.scopes.includes("write:sessions");

    if (pathname === "/v1/vaults/me" && method === "GET") {
      json(res, 200, {
        vault_id: vault.id,
        name: vault.name,
        mode: vault.mode,
        salt_b64: vault.salt_b64,
        kdf: vault.kdf_ops !== null && vault.kdf_mem !== null ? { ops_limit: vault.kdf_ops, mem_limit: vault.kdf_mem } : undefined,
        wrapped_passphrase_b64: vault.wrapped_passphrase_b64,
        // The recovery wrap is served (device-only) so 'ctxfile vault recover'
        // can reset a lost passphrase with the printed recovery code.
        wrapped_recovery_b64: vault.wrapped_recovery_b64,
      });
      return;
    }

    if (pathname === "/v1/vaults/rewrap" && method === "POST") {
      // Rewrap replaces the passphrase/recovery wraps, so a caller that gets it
      // wrong (or is malicious) can lock every device out. Require a full device
      // token (read:context AND write:sessions), not a write-only ingest token.
      if (!canRead || !canWrite) {
        json(res, 403, { error: "rewrap requires a full device token (read:context and write:sessions)" });
        return;
      }
      const body = (await readBody(req)) as { wrapped_passphrase_b64?: string; wrapped_recovery_b64?: string };
      if (!body.wrapped_passphrase_b64 || !body.wrapped_recovery_b64) {
        json(res, 400, { error: "rewrap requires wrapped_passphrase_b64 and wrapped_recovery_b64" });
        return;
      }
      db.setWraps(vault.id, body.wrapped_passphrase_b64, body.wrapped_recovery_b64);
      db.audit({ vaultId: vault.id, actor: token.name, action: "vault.rewrap", detail: {} });
      json(res, 200, { ok: true });
      return;
    }

    if (pathname === "/v1/vaults/enroll-key" && method === "POST") {
      if (grant || !canWrite) {
        json(res, 403, { error: "key enrollment requires a device token with write:sessions" });
        return;
      }
      if (vault.mode !== "standard") {
        json(res, 400, { error: "strict vaults never enroll a key; that is the point of strict" });
        return;
      }
      const body = (await readBody(req)) as { data_key_b64?: string };
      if (!body.data_key_b64) {
        json(res, 400, { error: "enroll-key requires data_key_b64" });
        return;
      }
      const dataKey = Buffer.from(body.data_key_b64, "base64");
      if (dataKey.length !== 32) {
        json(res, 400, { error: "data key must be 32 bytes" });
        return;
      }
      // Wrapped immediately; the raw key's lifetime ends with this request.
      db.setWrappedDataKey(vault.id, ctx.keyring.wrap(new Uint8Array(dataKey)));
      db.audit({ vaultId: vault.id, actor: token.name, action: "vault.enroll_key", detail: { keyring: ctx.keyring.name } });
      json(res, 200, { ok: true, keyring: ctx.keyring.name });
      return;
    }

    if (pathname === "/v1/blobs" && method === "GET") {
      if (!canRead) {
        json(res, 403, { error: "token lacks read:context" });
        return;
      }
      json(res, 200, { blobs: db.listBlobs(vault.id) });
      return;
    }

    const blobMatch = pathname.match(/^\/v1\/blobs\/([0-9a-f]{32})$/);
    if (blobMatch) {
      const blobId = blobMatch[1] as string;
      if (method === "GET") {
        if (!canRead) {
          json(res, 403, { error: "token lacks read:context" });
          return;
        }
        const blob = db.getBlob(vault.id, blobId);
        if (!blob) {
          json(res, 404, { error: "no such blob" });
          return;
        }
        json(res, 200, { meta: blob.meta, data_b64: Buffer.from(blob.data).toString("base64") });
        return;
      }
      if (method === "PUT") {
        if (!canWrite) {
          json(res, 403, { error: "token lacks write:sessions" });
          return;
        }
        if (overBlobLimit(token.id, Date.now())) {
          json(res, 429, { error: "blob write rate limit reached; retry shortly" });
          return;
        }
        const body = (await readBody(req)) as { version?: number; deleted?: boolean; data_b64?: string };
        if (typeof body.version !== "number" || typeof body.data_b64 !== "string") {
          json(res, 400, { error: "blob put requires version (number) and data_b64" });
          return;
        }
        const meta: SyncBlobMeta = { id: blobId, version: body.version, deleted: body.deleted === true };
        const stored = db.putBlob(vault.id, blobId, meta, new Uint8Array(Buffer.from(body.data_b64, "base64")));
        db.audit({ vaultId: vault.id, actor: token.name, action: "blob.push", detail: { id: blobId.slice(0, 8), stored } });
        json(res, 200, { stored });
        return;
      }
    }

    if (pathname === "/v1/grants" && method === "POST") {
      if (grant || !canWrite) {
        json(res, 403, { error: "grant issuance requires a device token with write:sessions" });
        return;
      }
      if (vault.mode !== "standard") {
        json(res, 400, { error: "handoff grants need a standard vault; a strict vault cannot be served by the relay" });
        return;
      }
      const body = (await readBody(req)) as { thread?: string; days?: number; permission?: string };
      if (!body.thread) {
        json(res, 400, { error: "grant requires thread (the thread title to share)" });
        return;
      }
      const permission = body.permission === "read+ingest" ? "read+ingest" : "read";
      const days = Math.min(Math.max(body.days ?? 7, 1), 90);
      const expiresAt = Date.now() + days * 86_400_000;
      const grantToken = db.createToken(vault.id, `grant:${body.thread}`, [], {
        kind: "grant",
        grantThread: body.thread,
        grantPermission: permission,
        expiresAt,
      });
      db.audit({ vaultId: vault.id, actor: token.name, action: "grant.issue", detail: { thread: body.thread, permission, days } });
      json(res, 200, { grant_token: grantToken, thread: body.thread, permission, expires_at: expiresAt, mcp_url: `${ctx.publicUrl}/mcp` });
      return;
    }

    if (pathname === "/v1/grants" && method === "GET") {
      const rows = db
        .listTokens(vault.id)
        .filter((t) => t.kind === "grant")
        .map((t) => ({
          id: t.id,
          thread: t.grant_thread,
          permission: t.grant_permission,
          expires_at: t.expires_at,
          revoked: t.revoked_at !== null,
          last_used_at: t.last_used_at,
        }));
      json(res, 200, { grants: rows });
      return;
    }

    const revokeMatch = pathname.match(/^\/v1\/grants\/([0-9a-f-]{36})\/revoke$/);
    if (revokeMatch && method === "POST") {
      if (!canWrite) {
        json(res, 403, { error: "grant revoke requires write:sessions" });
        return;
      }
      // Scoped to the caller's vault: a device token can only revoke its own
      // vault's grants, never another vault's by id.
      const revoked = db.revokeToken(revokeMatch[1] as string, vault.id);
      if (revoked) db.audit({ vaultId: vault.id, actor: token.name, action: "grant.revoke", detail: { id: revokeMatch[1] } });
      json(res, 200, { revoked });
      return;
    }

    if (pathname === "/v1/federation/grants" && method === "POST") {
      if (grant || !canWrite) {
        json(res, 403, { error: "federation grants require a device token with write:sessions" });
        return;
      }
      if (vault.mode !== "standard") {
        json(res, 400, { error: "federation requires a standard vault on the issuing hub" });
        return;
      }
      const body = (await readBody(req)) as { thread?: string; audience_org?: string; days?: number; permission?: string };
      if (!body.thread || !body.audience_org) {
        json(res, 400, { error: "federation grant requires thread and audience_org" });
        return;
      }
      const doc: FederationGrantDoc = {
        gid: randomUUID(),
        issuer_org: ctx.org.orgId,
        issuer_url: ctx.publicUrl,
        audience_org: body.audience_org,
        vault_id: vault.id,
        thread_title: body.thread,
        permission: body.permission === "read+ingest" ? "read+ingest" : "read",
        exp: Date.now() + Math.min(Math.max(body.days ?? 7, 1), 90) * 86_400_000,
      };
      const sig = signGrantDoc(ctx.org, doc);
      db.saveFederationGrant({
        id: doc.gid,
        vault_id: vault.id,
        thread_title: doc.thread_title,
        audience_org: doc.audience_org,
        permission: doc.permission,
        expires_at: doc.exp,
        doc_json: JSON.stringify(doc),
        sig_b64: sig,
      });
      db.audit({ vaultId: vault.id, actor: token.name, action: "federation.issue", detail: { gid: doc.gid, audience: doc.audience_org, thread: doc.thread_title }, orgId: ctx.org.orgId });
      json(res, 200, { grant_b64: Buffer.from(JSON.stringify({ doc, sig })).toString("base64url") });
      return;
    }

    if (pathname === "/v1/audit" && method === "GET") {
      json(res, 200, { audit: db.auditRows(vault.id) });
      return;
    }

    if (pathname === "/mcp") {
      // Bound the request body before the SDK transport consumes the stream.
      // Only POSTs carry a body; require a trustworthy Content-Length so a
      // chunked or length-omitting request cannot slip past the cap.
      if (method === "POST") {
        const contentLength = Number(req.headers["content-length"]);
        if (!Number.isFinite(contentLength)) {
          json(res, 411, { error: "Content-Length required" });
          return;
        }
        if (contentLength > MAX_MCP_BODY_BYTES) {
          json(res, 413, { error: "request body too large" });
          return;
        }
      }
      const sessionId = req.headers["mcp-session-id"];
      if (typeof sessionId === "string" && sessionId.length > 0) {
        const entry = sessions.get(sessionId);
        if (!entry) {
          json(res, 404, { error: "session not found; re-initialize" });
          return;
        }
        if (entry.tokenId !== token.id) {
          json(res, 401, { error: "session was opened with a different token" });
          return;
        }
        entry.lastSeen = Date.now();
        await entry.transport.handleRequest(req, res);
        return;
      }
      if (method !== "POST") {
        json(res, 400, { error: "missing mcp-session-id; initialize with a POST first" });
        return;
      }
      if (sessions.size >= MAX_MCP_SESSIONS) {
        // Reclaim closed/idle sessions before rejecting.
        const cutoff = Date.now() - SESSION_IDLE_MS;
        for (const [id, e] of sessions) {
          if (e.lastSeen < cutoff) {
            sessions.delete(id);
            void e.server.close().catch(() => undefined);
          }
        }
        if (sessions.size >= MAX_MCP_SESSIONS) {
          json(res, 503, { error: "relay at session capacity; retry shortly" });
          return;
        }
      }
      const entry: {
        transport: StreamableHTTPServerTransport;
        server: VaultMcpServer;
        tokenId: string;
        lastSeen: number;
      } = {
        transport: new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id: string) => {
            sessions.set(id, entry);
          },
          onsessionclosed: (id: string) => {
            sessions.delete(id);
          },
        }),
        server: createVaultMcpServer({
          db,
          keyring: ctx.keyring,
          vault,
          scopes: auth.scopes,
          // Grant token names already carry the "grant:" prefix from issuance.
          actor: token.name,
          grant,
          version: VERSION,
          publicUrl: ctx.publicUrl,
          // Rate-limit writes per bearer token, not per session, so opening
          // fresh sessions cannot reset the budget.
          overWriteLimit: (now) => !withinWindow(mcpWriteTimestamps, token.id, now, 60_000, WRITE_MAX_PER_MINUTE, false),
          recordWrite: (now) => void withinWindow(mcpWriteTimestamps, token.id, now, 60_000, WRITE_MAX_PER_MINUTE, true),
        }),
        tokenId: token.id,
        lastSeen: Date.now(),
      };
      entry.transport.onclose = () => {
        const id = entry.transport.sessionId;
        if (id) sessions.delete(id);
      };
      await entry.server.connect(entry.transport);
      await entry.transport.handleRequest(req, res);
      return;
    }

    json(res, 404, { error: "unknown route" });
  }

  const httpServer = http.createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      console.error(`ctxfile-relay: ${error instanceof Error ? error.message : String(error)}`);
      if (!res.headersSent) json(res, 500, { error: "internal error" });
      else res.end();
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(config.port, config.host, () => resolve());
  });
  boundPort = (httpServer.address() as AddressInfo).port;
  const publicUrl = ctx.publicUrl.includes(":0") ? `http://${config.host}:${boundPort}` : ctx.publicUrl;
  ctx.publicUrl = publicUrl;

  return {
    port: boundPort,
    host: config.host,
    publicUrl,
    close: async () => {
      clearInterval(sweeper);
      for (const entry of sessions.values()) {
        await entry.server.close().catch(() => undefined);
      }
      sessions.clear();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

/** Org-to-org redemption: no bearer, authenticated entirely by signatures —
    ours on the grant, the trusted audience org's on the redemption. */
async function handleFederationRedeem(ctx: RelayContext, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const { db } = ctx;
  const body = (await readBody(req)) as { grant_b64?: string; requester_org?: string; redemption_sig_b64?: string };
  if (!body.grant_b64 || !body.requester_org || !body.redemption_sig_b64) {
    json(res, 400, { error: "redeem requires grant_b64, requester_org, redemption_sig_b64" });
    return;
  }
  let doc: FederationGrantDoc;
  let sig: string;
  try {
    const decoded = JSON.parse(Buffer.from(body.grant_b64, "base64url").toString("utf8")) as { doc: FederationGrantDoc; sig: string };
    doc = decoded.doc;
    sig = decoded.sig;
  } catch {
    json(res, 400, { error: "grant_b64 is not a valid grant" });
    return;
  }
  const deny = (reason: string): void => {
    db.audit({ vaultId: doc.vault_id, actor: `org:${body.requester_org}`, action: "federation.redeem_denied", detail: { gid: doc.gid, reason }, orgId: ctx.org.orgId });
    json(res, 403, { error: reason });
  };
  if (doc.issuer_org !== ctx.org.orgId) return deny("grant was not issued by this hub's org");
  if (!verifyGrantSig(ctx.org.publicKeyPem, doc, sig)) return deny("grant signature invalid");
  const row = db.getFederationGrant(doc.gid);
  if (!row) return deny("unknown grant");
  if (row.revoked_at !== null) return deny("grant revoked");
  if (Date.now() > doc.exp) return deny("grant expired");
  if (body.requester_org !== doc.audience_org) return deny("requester is not the grant audience");
  const trustedKey = db.trustedOrgKey(body.requester_org);
  if (!trustedKey) return deny(`org "${body.requester_org}" is not trusted by this hub; exchange org identities first`);
  if (!verifyRedemption(trustedKey, doc.gid, body.redemption_sig_b64)) return deny("redemption signature invalid");

  const vault = db.getVault(doc.vault_id);
  if (!vault || vault.mode !== "standard") return deny("granted vault unavailable for serving");
  const dataKey = unwrapDataKey(ctx.keyring, vault);
  const payloads = await loadVaultPayloads(db, dataKey, vault);
  const wanted = doc.thread_title.toLowerCase();
  const scoped = payloads.filter((p) =>
    p.kind === "thread" ? p.title.toLowerCase() === wanted : p.thread_title?.toLowerCase() === wanted
  );
  db.audit({
    vaultId: vault.id,
    actor: `org:${body.requester_org}`,
    action: "federation.redeem",
    detail: { gid: doc.gid, thread: doc.thread_title, payloads: scoped.length },
    orgId: ctx.org.orgId,
  });
  json(res, 200, { thread_title: doc.thread_title, permission: doc.permission, payloads: scoped });
}
