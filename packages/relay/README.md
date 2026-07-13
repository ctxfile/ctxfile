# @ctxfile/relay

The ctxfile relay: an always-on MCP endpoint over an encrypted vault. **Hosted, it is the Sync tier** (`sync.ctxfile.dev`). **Self-hosted, the same build is the Team/Enterprise hub.** One image, every SKU.

The relay is open source on purpose: it is the component that momentarily holds plaintext in Standard mode, so it is the component you must be able to audit. See [ctxfile.dev/security](https://ctxfile.dev/security).

## What it does

- **Stores ciphertext.** Devices encrypt every record client-side (XChaCha20-Poly1305, keys derived via Argon2id) and sync blobs up under opaque ids. The datastore never contains plaintext, and blob names leak nothing.
- **Serves the five ctxfile tools over Streamable HTTP** (`get_context`, `save_session`, `continue_thread`, `list_threads`, `ingest_context`) so any MCP-capable client surface — phone, web, chat app, another machine — can save and resume threads. Standard-mode vaults only: serve-time decryption happens in memory, per request, under a key wrapped by the keyring; nothing decrypted is persisted or logged.
- **Strict vaults are a wall:** the relay holds ciphertext it can never decrypt. Sync works; `/mcp` refuses; that refusal is the feature.
- **Handoff grants:** thread-scoped, read-only (or read+ingest), expiring, revocable bearer tokens — "take over my project while I'm out", enforced server-side.
- **Federation (Enterprise):** org identities (Ed25519), signed org-to-org grants, invite-only trusted-peer redemption, pull-model thread exchange between two hubs. No central server in the data path.
- **Append-only audit:** every vault event, blob push, MCP call, grant issue/redeem/denial, with actor and org attribution. `audit export` emits JSONL for your SIEM.

## Run

```bash
node dist/cli.js start --data-dir ~/ctxfile-relay      # or: ctxfile-relay start
```

All state (SQLite, keyring master key, org identity) lives in the data dir: one folder to volume-mount, one folder to back up. Defaults: `127.0.0.1:5959`, registration open (self-host mode). Environment: `CTXFILE_RELAY_DATA`, `CTXFILE_RELAY_HOST`, `CTXFILE_RELAY_PORT`, `CTXFILE_RELAY_ORG`, `CTXFILE_RELAY_REGISTRATION` (`closed` for hosted deployments where the subscription flow provisions vaults), `CTXFILE_RELAY_PUBLIC_URL`.

Docker (build from the repo root; this is the Team hub artifact):

```bash
docker build -f packages/relay/Dockerfile -t ctxfile-relay .
docker run -p 5959:5959 -v ctxfile-relay-data:/data ctxfile-relay
```

Fly.io: `fly deploy -c packages/relay/fly.toml` (see the file's header for secrets).

## HTTP API

| Route | Auth | Purpose |
|---|---|---|
| `GET /healthz` | none | Liveness + org id |
| `POST /v1/vaults` | none (when registration is open) | Create a vault: salt, KDF params, passphrase/recovery key wraps; returns vault id + device token |
| `GET /v1/vaults/me` | bearer | Vault metadata a new device needs to unlock (salt, wraps) |
| `POST /v1/vaults/enroll-key` | bearer (write) | Standard mode only: the data key, immediately wrapped by the keyring |
| `GET /v1/blobs`, `GET/PUT /v1/blobs/:id` | bearer (read/write) | Ciphertext sync; LWW versions enforced server-side too; 512KB cap, per-token rate limits |
| `POST /v1/grants`, `GET /v1/grants`, `POST /v1/grants/:id/revoke` | bearer (write to issue) | Handoff grants |
| `POST /v1/federation/grants` | bearer (write) | Org-signed federation grant for an audience org |
| `POST /v1/federation/redeem` | signatures, not bearer | Trusted-peer redemption; every denial is audited |
| `GET /v1/audit` | bearer | The vault's audit rows |
| `/mcp` | bearer (vault or grant token) | Streamable HTTP MCP; one session per client, session bound to its token |

Tokens are stored as SHA-256 hashes and carry scopes (`read:context`, `write:sessions`). CLI: `vaults`, `tokens list|create|revoke`, `grants issue`, `org show|trust`, `federation issue|redeem`, `audit tail|export`.

## Security model, in one paragraph

Clients encrypt before upload; the relay stores ciphertext under opaque ids; Standard-mode serving unwraps a per-vault data key through the `KeyProvider` seam (local keyring file when self-hosted, cloud KMS when hosted, the customer's own KMS for BYOK — same two-method interface, which is why key revocation is crypto-shredding), decrypts in memory for one request, and discards; Strict mode never enrolls a key at all; no plaintext is ever written to logs (log lines carry ids and counts only); grants are least-privilege by default (single thread, read-only, 7-day expiry); federation is invite-only by exchanged org identity and every redemption or denial is an audit row. Production deployments terminate TLS in front (Fly edge, Caddy, nginx); hub-to-hub mTLS is on the deploy checklist.

## Boundary note (for the repo split)

The data path in this package (crypto, blob storage, vault serving) is Apache-2.0 and stays open — it is the trust story. The planned multi-org/team management layer (org member administration, policy workflows, SSO glue, managed-hub tooling) is the commercial module and will live in the private repo, plugging in the way `@ctxfile/pro` plugs into the core. What exists here today, including grants, federation primitives, and audit, is open.
