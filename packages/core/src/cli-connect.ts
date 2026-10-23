import os from "node:os";
import path from "node:path";
import {
  CLIENTS,
  connectClient,
  describeTarget,
  findClient,
  resolveLaunch,
  type ClientSpec,
  type ConnectContext,
  type ConnectResult,
  type ConnectScope,
} from "./connect.js";

export const CONNECT_USAGE = `ctxfile connect                         Which MCP clients are on this machine, and how to add ctxfile to each
ctxfile connect <client>... [options]   Register ctxfile in those clients
ctxfile connect --all [options]         Register ctxfile in every client detected here
ctxfile connect --print <client>        Show the exact config, command, and one-click link; write nothing

Options:
  --root <dir>    Project ctxfile serves (default: current directory)
  --project       Write the project-level config (default: the client's global config)
  --global        Write the client's global config
  --dry-run       Show what would change; write and run nothing
  --force         Replace an existing, different "ctxfile" entry

Clients: ${CLIENTS.map((c) => c.id).join(", ")}
JSON configs are merged (only the "ctxfile" entry changes; the old file is kept as
<file>.ctxfile-backup). Clients with their own "mcp add" command are driven through it.`;

interface ConnectFlags {
  ids: string[];
  root?: string;
  scope?: ConnectScope;
  dryRun: boolean;
  force: boolean;
  all: boolean;
  print?: string;
}

function parseConnectFlags(argv: string[]): ConnectFlags {
  const flags: ConnectFlags = { ids: [], dryRun: false, force: false, all: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === "--root") {
      const value = argv[i + 1];
      if (!value) throw new Error("--root requires a directory");
      flags.root = value;
      i += 1;
    } else if (arg === "--print") {
      const value = argv[i + 1];
      if (!value) throw new Error("--print requires a client id");
      flags.print = value;
      i += 1;
    } else if (arg === "--project") flags.scope = "project";
    else if (arg === "--global") flags.scope = "global";
    else if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--force") flags.force = true;
    else if (arg === "--all") flags.all = true;
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${CONNECT_USAGE}\n`);
      process.exit(0);
    } else if (arg.startsWith("--")) throw new Error(`unknown option ${arg} (see ctxfile connect --help)`);
    else flags.ids.push(arg);
  }
  return flags;
}

export function connectContext(root: string | undefined): ConnectContext {
  return {
    root: path.resolve(root ?? process.cwd()),
    home: os.homedir(),
    platform: process.platform,
    appData: process.env.APPDATA ?? null,
    launch: resolveLaunch(process.argv[1] ?? "ctxfile", process.execPath, process.platform),
  };
}

function resolveClients(ids: string[]): ClientSpec[] {
  return ids.map((id) => {
    const spec = findClient(id);
    if (!spec) throw new Error(`unknown client "${id}"; known: ${CLIENTS.map((c) => c.id).join(", ")}`);
    return spec;
  });
}

const MARK: Record<ConnectResult["action"], string> = {
  added: "added",
  already: "already connected",
  "exists-different": "left as is",
  ran: "added",
  printed: "do this by hand",
  failed: "FAILED",
};

export async function runConnect(argv: string[]): Promise<void> {
  const flags = parseConnectFlags(argv);
  const ctx = connectContext(flags.root);

  if (flags.print) {
    const spec = resolveClients([flags.print])[0] as ClientSpec;
    process.stdout.write(`${spec.name} (${spec.docs})\n`);
    for (const target of spec.targets) {
      process.stdout.write(`\n${target.scope === "project" ? "Project" : "Global"}:\n${describeTarget(spec, target, ctx)}\n`);
    }
    if (spec.installLink) process.stdout.write(`\nOne-click install link:\n${spec.installLink(ctx)}\n`);
    if (spec.manual) process.stdout.write(`\n${spec.manual(ctx)}\n`);
    process.stdout.write(`\nLaunch: ${ctx.launch.why}\n`);
    return;
  }

  if (flags.ids.length === 0 && !flags.all) {
    process.stdout.write(`MCP clients and ctxfile (project: ${ctx.root})\n\n`);
    for (const spec of CLIENTS) {
      const reason = spec.detect(ctx);
      process.stdout.write(`  ${reason ? "found  " : "       "} ${spec.id.padEnd(16)} ${spec.name}${reason ? `  (${reason})` : ""}\n`);
    }
    process.stdout.write(
      "\nConnect one:   ctxfile connect <client>\nConnect all:   ctxfile connect --all\nSee the config: ctxfile connect --print <client>\n" +
        "Web chat apps (ChatGPT, Claude.ai, Grok, Perplexity) connect through Sync: https://ctxfile.dev/docs/webchat\n"
    );
    return;
  }

  const specs = flags.all ? CLIENTS.filter((spec) => spec.detect(ctx) !== null) : resolveClients(flags.ids);
  if (specs.length === 0) {
    process.stdout.write("No MCP clients detected on this machine. Name one: ctxfile connect <client> (see ctxfile connect)\n");
    return;
  }
  let failed = 0;
  for (const spec of specs) {
    const result = connectClient(spec, ctx, { scope: flags.scope, dryRun: flags.dryRun, force: flags.force });
    if (result.action === "failed") failed += 1;
    process.stdout.write(`${spec.name}: ${MARK[result.action]} (${result.scope})\n  ${result.detail.replace(/\n/g, "\n  ")}\n`);
  }
  process.stdout.write(`\nLaunch: ${ctx.launch.why}\nRestart each client (or reload its MCP servers) to pick ctxfile up; the dashboard's Connected agents card shows it once it connects.\n`);
  if (failed > 0) process.exitCode = 1;
}
