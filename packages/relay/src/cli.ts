import { readFileSync, writeFileSync } from "node:fs";
import { loadRelayConfig, type RelayConfigOverrides } from "./config.js";
import { redeemFederatedGrant } from "./federation.js";
import { createRelayContext, startRelay } from "./http.js";
import { VERSION } from "./version.js";

const USAGE = `ctxfile-relay v${VERSION} — the ctxfile relay / self-hosted hub

Usage: ctxfile-relay start [options]          Run the relay (default command)
       ctxfile-relay vaults                   List vaults on this hub
       ctxfile-relay tokens list [--vault <id>]
       ctxfile-relay tokens create --vault <id> --name <n> [--scopes s1,s2]
       ctxfile-relay tokens revoke --id <token-id>
       ctxfile-relay grants issue --vault <id> --thread <t> [--days 7] [--permission read|read+ingest]
       ctxfile-relay org show
       ctxfile-relay org trust --org <org-id> --key-file <pem>
       ctxfile-relay federation issue --vault <id> --thread <t> --audience <org-id> [--days 7]
       ctxfile-relay federation redeem --grant-file <f>|--grant <b64> --into <vault-id>
       ctxfile-relay audit tail [--vault <id>] [--limit 50]
       ctxfile-relay audit export [--out audit.jsonl]

Options (start):
  --port <n>          Port (default 5959; env CTXFILE_RELAY_PORT)
  --host <h>          Bind address (default 127.0.0.1; env CTXFILE_RELAY_HOST)
  --data-dir <d>      State directory (default ~/.ctxfile-relay; env CTXFILE_RELAY_DATA)
  --org <id>          Org identity id (default org-local; env CTXFILE_RELAY_ORG)
  --registration <m>  open|closed (default open; env CTXFILE_RELAY_REGISTRATION)

All state (SQLite, keyring master key, org identity) lives in the data dir:
one folder to volume-mount in Docker, one folder to back up.
`;

interface Flags {
  [key: string]: string | undefined;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(USAGE);
      process.exit(0);
    }
    if (arg?.startsWith("--")) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      flags[arg.slice(2)] = value;
      i += 1;
    }
  }
  return flags;
}

function overridesFrom(flags: Flags): RelayConfigOverrides {
  return {
    dataDir: flags["data-dir"],
    host: flags.host,
    port: flags.port !== undefined ? Number(flags.port) : undefined,
    orgId: flags.org,
    registration: flags.registration === "closed" ? "closed" : flags.registration === "open" ? "open" : undefined,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0] && !argv[0].startsWith("--") ? argv[0] : "start";
  const sub = argv[1] && !argv[1].startsWith("--") ? argv[1] : undefined;
  const flags = parseFlags(argv);
  const config = loadRelayConfig(overridesFrom(flags));
  const ctx = createRelayContext(config);

  if (command === "start") {
    const running = await startRelay(ctx);
    console.error(`ctxfile-relay v${VERSION} (org "${ctx.org.orgId}") on ${running.publicUrl}`);
    console.error(`  MCP endpoint: ${running.publicUrl}/mcp (bearer: vault or grant token)`);
    console.error(`  data dir: ${config.dataDir} · registration: ${config.registration} · keyring: ${ctx.keyring.name}`);
    console.error("  Standard vaults serve the five tools; strict vaults sync ciphertext only.");
    const shutdown = (): void => {
      void running.close().then(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return;
  }

  try {
    if (command === "vaults") {
      for (const vault of ctx.db.listVaults()) {
        process.stdout.write(`${vault.id}  "${vault.name}"  ${vault.mode}  created ${new Date(vault.created_at).toISOString()}\n`);
      }
      return;
    }
    if (command === "tokens" && sub === "list") {
      for (const t of ctx.db.listTokens(flags.vault)) {
        process.stdout.write(
          `${t.id}  vault=${t.vault_id}  "${t.name}"  ${t.kind}${t.grant_thread ? ` thread="${t.grant_thread}" ${t.grant_permission}` : ""}  ${
            t.revoked_at ? "REVOKED" : t.expires_at && Date.now() > t.expires_at ? "EXPIRED" : "active"
          }\n`
        );
      }
      return;
    }
    if (command === "tokens" && sub === "create") {
      if (!flags.vault || !flags.name) throw new Error("tokens create requires --vault and --name");
      const scopes = (flags.scopes ?? "read:context,write:sessions").split(",").map((s) => s.trim());
      const token = ctx.db.createToken(flags.vault, flags.name, scopes);
      ctx.db.audit({ vaultId: flags.vault, actor: "cli", action: "token.create", detail: { name: flags.name, scopes } });
      process.stdout.write(`${token}\n`);
      console.error("ctxfile-relay: token printed once above; store it in a password manager");
      return;
    }
    if (command === "tokens" && sub === "revoke") {
      if (!flags.id) throw new Error("tokens revoke requires --id");
      const revoked = ctx.db.revokeToken(flags.id);
      if (revoked) ctx.db.audit({ actor: "cli", action: "token.revoke", detail: { id: flags.id } });
      console.error(revoked ? "ctxfile-relay: token revoked" : "ctxfile-relay: no active token with that id");
      return;
    }
    if (command === "grants" && sub === "issue") {
      if (!flags.vault || !flags.thread) throw new Error("grants issue requires --vault and --thread");
      const permission = flags.permission === "read+ingest" ? "read+ingest" : "read";
      const days = Math.min(Math.max(Number(flags.days ?? 7), 1), 90);
      const token = ctx.db.createToken(flags.vault, `grant:${flags.thread}`, [], {
        kind: "grant",
        grantThread: flags.thread,
        grantPermission: permission,
        expiresAt: Date.now() + days * 86_400_000,
      });
      ctx.db.audit({ vaultId: flags.vault, actor: "cli", action: "grant.issue", detail: { thread: flags.thread, permission, days } });
      process.stdout.write(`${token}\n`);
      console.error(
        `ctxfile-relay: handoff grant for thread "${flags.thread}" (${permission}, ${days}d). Recipient adds ${ctx.publicUrl}/mcp with this bearer token.`
      );
      return;
    }
    if (command === "org" && sub === "show") {
      process.stdout.write(`org_id: ${ctx.org.orgId}\n${ctx.org.publicKeyPem}`);
      console.error("ctxfile-relay: hand the org_id and public key to partner hubs ('org trust' on their side)");
      return;
    }
    if (command === "org" && sub === "trust") {
      if (!flags.org || !flags["key-file"]) throw new Error("org trust requires --org and --key-file <pem>");
      ctx.db.trustOrg(flags.org, readFileSync(flags["key-file"], "utf8"));
      ctx.db.audit({ actor: "cli", action: "org.trust", detail: { org: flags.org } });
      console.error(`ctxfile-relay: org "${flags.org}" is now trusted for federation redemptions`);
      return;
    }
    if (command === "federation" && sub === "issue") {
      if (!flags.vault || !flags.thread || !flags.audience) {
        throw new Error("federation issue requires --vault, --thread, and --audience");
      }
      // Issue through the same code path HTTP uses, without the server: sign
      // and persist directly.
      const { randomUUID } = await import("node:crypto");
      const { signGrantDoc } = await import("./org.js");
      const doc = {
        gid: randomUUID(),
        issuer_org: ctx.org.orgId,
        issuer_url: flags.url ?? ctx.publicUrl,
        audience_org: flags.audience,
        vault_id: flags.vault,
        thread_title: flags.thread,
        permission: (flags.permission === "read+ingest" ? "read+ingest" : "read") as "read" | "read+ingest",
        exp: Date.now() + Math.min(Math.max(Number(flags.days ?? 7), 1), 90) * 86_400_000,
      };
      const sig = signGrantDoc(ctx.org, doc);
      ctx.db.saveFederationGrant({
        id: doc.gid,
        vault_id: doc.vault_id,
        thread_title: doc.thread_title,
        audience_org: doc.audience_org,
        permission: doc.permission,
        expires_at: doc.exp,
        doc_json: JSON.stringify(doc),
        sig_b64: sig,
      });
      ctx.db.audit({ vaultId: doc.vault_id, actor: "cli", action: "federation.issue", detail: { gid: doc.gid, audience: doc.audience_org }, orgId: ctx.org.orgId });
      process.stdout.write(`${Buffer.from(JSON.stringify({ doc, sig })).toString("base64url")}\n`);
      console.error(`ctxfile-relay: federation grant for "${doc.thread_title}" -> org "${doc.audience_org}" (expires ${new Date(doc.exp).toISOString()})`);
      return;
    }
    if (command === "federation" && sub === "redeem") {
      const grantB64 = flags.grant ?? (flags["grant-file"] ? readFileSync(flags["grant-file"], "utf8").trim() : undefined);
      if (!grantB64 || !flags.into) throw new Error("federation redeem requires --grant (or --grant-file) and --into <vault-id>");
      const result = await redeemFederatedGrant({ db: ctx.db, keyring: ctx.keyring, org: ctx.org, grantB64, targetVaultId: flags.into });
      console.error(`ctxfile-relay: imported thread "${result.thread}" (${result.imported} records) into vault ${flags.into}`);
      return;
    }
    if (command === "audit" && sub === "tail") {
      const rows = ctx.db.auditRows(flags.vault, Number(flags.limit ?? 50));
      for (const row of rows.reverse()) {
        process.stdout.write(`${new Date(row.ts).toISOString()}  ${row.vault_id ?? "-"}  ${row.actor}  ${row.action}  ${row.detail}\n`);
      }
      return;
    }
    if (command === "audit" && sub === "export") {
      const rows = ctx.db.auditRows(undefined, 1_000_000);
      const lines = rows
        .reverse()
        .map((row) => JSON.stringify({ ...row, ts_iso: new Date(row.ts).toISOString() }))
        .join("\n");
      const out = flags.out ?? "audit.jsonl";
      writeFileSync(out, `${lines}\n`, "utf8");
      console.error(`ctxfile-relay: exported ${rows.length} audit rows to ${out} (append-only source; ship to your SIEM)`);
      return;
    }
    throw new Error(`unknown command "${command}${sub ? ` ${sub}` : ""}" (see --help)`);
  } finally {
    ctx.db.close();
  }
}

main().catch((error: unknown) => {
  console.error(`ctxfile-relay: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
