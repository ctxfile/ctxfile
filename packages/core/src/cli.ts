import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import {
  buildExportEnvelope,
  EXPORT_PROFILES,
  renderExportMarkdown,
  type ExportProfile,
} from "./export.js";
import { installHook, uninstallHook } from "./hooks.js";
import { loadProModule } from "./plugin.js";
import { IngestStore } from "./storage/ingest-store.js";
import {
  BEHAVIOR_HARNESSES,
  clearBehaviorState,
  detectHarnesses,
  installBehavior,
  readBehaviorState,
  renderBehavior,
  uninstallBehavior,
  writeBehaviorState,
  type BehaviorHarness,
} from "./behavior.js";
import { createRuntime } from "./runtime.js";
import { createServer, startHttpServer, type ResolvedServeToken } from "./server.js";
import {
  createVault,
  DEFAULT_VAULT_CONFIG_PATH,
  fetchVaultMeta,
  joinVault,
  loadVaultConfig,
  openVaultSync,
  recoverVault,
} from "./sync/vault.js";
import { sendPingIfDue } from "./telemetry.js";
import { storeLicenseKey } from "./license-store.js";
import { generateToken } from "./ui/security.js";
import { createUiServer, DEFAULT_UI_PORT, listenOnAvailablePort } from "./ui/server.js";
import { VERSION } from "./version.js";

const USAGE = `ctxfile v${VERSION} — local-first MCP context server (stdio)

Usage: ctxfile [options]
       ctxfile init [--yes|--no-auto|--uninstall|--print <harness>] [options]
       ctxfile pause | resume
       ctxfile serve [options]
       ctxfile ui [options]
       ctxfile export [options]
       ctxfile hooks install|uninstall [options]
       ctxfile ingest list|rm <id> [options]
       ctxfile threads [options]
       ctxfile vault create|join|recover|status [options]
       ctxfile sync [options]
       ctxfile activate <license-key>

Options:
  --root <dir>      Project root to snapshot (default: current directory)
  --config <path>   Path to a config file (default: <root>/.ctxfile.json)
  --version         Print version and exit
  --help            Print this help and exit

serve options (Pro; the HTTP door: same tools over Streamable HTTP):
  --port <n>        Port to listen on (default: 4949, or serve.port in .ctxfile.json)
  --host <h>        Bind address (default: 127.0.0.1; non-loopback requires serve.tokens)

ui options:
  --port <n>        Local dashboard port (default: 4747; next 10 tried if busy)
  --no-open         Do not open the browser automatically

export options:
  --profile <p>     repo-safe (default) | full | custom
  --stdout          Write the JSON envelope to stdout instead of .ctxfile/

hooks:
  install           Add a managed pre-commit block that refreshes .ctxfile/ on commit
  uninstall         Remove the managed block

ingest (agent-reported sessions via ingest_context / save_session):
  list              Show this project's ingested session digests
  rm <id>           Delete one record by the id shown in list

init (the behavior layer: agents checkpoint automatically, announced, never silent):
  --yes             Consent to auto-capture and install the skill for detected harnesses
  --no-auto         Record that auto-capture stays OFF (skills not installed)
  --uninstall       Remove the installed behavior files + consent (reverse of init;
                    strips the AGENTS.md managed block, keeps your own content)
  --print <h>       Print one rendered behavior file to stdout:
                    claude-code | cursor | agents-md | codex | generic

pause / resume:
  pause             Refuse all automatic checkpoints until 'resume' (manual saves unaffected)
  resume            Re-enable automatic checkpoints

threads:
  (no subcommand)   List this project's threads: durable work identities that
                    sessions from any client surface attach to and resume from
  private <id>      Exclude a thread from auto-capture ('--off' to include again)

vault (the encrypted Sync vault on a relay; passphrase via CTXFILE_VAULT_PASSPHRASE):
  create            --relay <url> --name <n> [--mode standard|strict]
                    Creates the vault, prints the ONE-TIME recovery code
  join              --relay <url> --token <t>  Adds this device to a vault
  recover           Reset a lost passphrase using the recovery code (device
                    token required; recovery code via CTXFILE_VAULT_RECOVERY_CODE,
                    new passphrase via CTXFILE_VAULT_PASSPHRASE)
  status            Shows the configured vault and checks the relay

sync:
  (no subcommand)   Push/pull this project's sessions and threads through the
                    configured vault (encrypted client-side before upload)

Environment:
  NOTION_TOKEN      Notion internal integration token (enables the Notion connector)
  OLLAMA_BASE_URL   Ollama endpoint (default http://localhost:11434)
`;

interface CliArgs {
  root?: string;
  configPath?: string;
  port?: number;
  host?: string;
  noOpen?: boolean;
  profile?: ExportProfile;
  stdout?: boolean;
  relay?: string;
  name?: string;
  mode?: "standard" | "strict";
  token?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--version":
      case "-v":
        process.stdout.write(`${VERSION}\n`);
        process.exit(0);
        break;
      case "--help":
      case "-h":
        process.stdout.write(USAGE);
        process.exit(0);
        break;
      case "--root": {
        const value = argv[++i];
        if (!value) throw new Error("--root requires a directory argument");
        args.root = value;
        break;
      }
      case "--config": {
        const value = argv[++i];
        if (!value) throw new Error("--config requires a file argument");
        args.configPath = value;
        break;
      }
      case "--port": {
        const value = argv[++i];
        const port = Number(value);
        if (!value || !Number.isInteger(port) || port < 1 || port > 65_535) {
          throw new Error("--port requires an integer between 1 and 65535");
        }
        args.port = port;
        break;
      }
      case "--host": {
        const value = argv[++i];
        if (!value) throw new Error("--host requires an address argument");
        args.host = value;
        break;
      }
      case "--relay": {
        const value = argv[++i];
        if (!value) throw new Error("--relay requires a URL argument");
        args.relay = value;
        break;
      }
      case "--name": {
        const value = argv[++i];
        if (!value) throw new Error("--name requires an argument");
        args.name = value;
        break;
      }
      case "--mode": {
        const value = argv[++i];
        if (value !== "standard" && value !== "strict") {
          throw new Error('--mode must be "standard" or "strict"');
        }
        args.mode = value;
        break;
      }
      case "--token": {
        const value = argv[++i];
        if (!value) throw new Error("--token requires an argument");
        args.token = value;
        break;
      }
      case "--no-open":
        args.noOpen = true;
        break;
      case "--profile": {
        const value = argv[++i];
        if (!value || !(EXPORT_PROFILES as readonly string[]).includes(value)) {
          throw new Error(`--profile must be one of: ${EXPORT_PROFILES.join(", ")}`);
        }
        args.profile = value as ExportProfile;
        break;
      }
      case "--stdout":
        args.stdout = true;
        break;
      default:
        throw new Error(`unknown option "${arg}" (see --help)`);
    }
  }
  return args;
}

function activate(key: string | undefined): void {
  if (!key) throw new Error("activate requires a license key argument");
  const { filePath, detail } = storeLicenseKey(key);
  console.error(`license stored at ${filePath} (${detail}); signature is verified when the server starts`);
}

async function runUi(args: CliArgs): Promise<void> {
  const config = loadConfig({ root: args.root, configPath: args.configPath });
  const pro = await loadProModule();
  const runtime = createRuntime(config, { pro });
  const token = generateToken();
  const staticDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "ui-dist");
  const server = createUiServer({
    config,
    service: runtime.service,
    pro: runtime.pro,
    proActive: runtime.proActive,
    token,
    staticDir: existsSync(staticDir) ? staticDir : undefined,
  });
  const port = await listenOnAvailablePort(server, args.port ?? DEFAULT_UI_PORT);
  // Token travels in the URL FRAGMENT: fragments never appear in logs or Referer headers.
  const url = `http://127.0.0.1:${port}/#token=${token}`;
  console.error(`ctxfile ui v${VERSION} serving ${config.root}`);
  console.error(`  ${url}`);
  if (!args.noOpen) openBrowser(url);
}

/** Best-effort browser launch; failure is not an error (the URL is printed either way). */
function openBrowser(url: string): void {
  const [cmd, cmdArgs] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    spawn(cmd, cmdArgs as string[], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* best-effort */
  }
}

/** The HTTP door: same engine and tools as stdio, served over Streamable
    HTTP so remote-capable client surfaces (and other machines you control)
    can reach this project's context. Loopback-only unless tokens exist. */
async function runServe(args: CliArgs): Promise<void> {
  const config = loadConfig({ root: args.root, configPath: args.configPath });
  const pro = await loadProModule();
  const runtime = createRuntime(config, { pro });
  // The transport lives in the open core (auditable); the convenience of
  // running it is Pro, per the pricing ladder. Everything stays free on stdio.
  if (!runtime.proActive) {
    throw new Error(
      "ctxfile serve requires an active Pro license ('ctxfile activate <key>', https://ctxfile.dev/pricing). " +
        "All five tools, threads included, stay free over stdio."
    );
  }
  const tokens: ResolvedServeToken[] = [];
  for (const spec of config.serve.tokens) {
    const value = process.env[spec.tokenEnv]?.trim();
    if (!value) {
      console.error(`ctxfile serve: token "${spec.name}" skipped: env var ${spec.tokenEnv} is not set`);
      continue;
    }
    tokens.push({ name: spec.name, value, scopes: spec.scopes });
  }
  if (config.serve.tokens.length > 0 && tokens.length === 0) {
    throw new Error("serve.tokens is configured but no token env vars are set; refusing to start unauthenticated");
  }
  const host = args.host ?? config.serve.host;
  const port = args.port ?? config.serve.port;
  const running = await startHttpServer(config, runtime, { port, host, tokens });
  console.error(`ctxfile serve v${VERSION} serving ${config.root}`);
  console.error(`  MCP endpoint: http://${host}:${running.port}/mcp (Streamable HTTP, spec 2025-11-25)`);
  console.error(
    tokens.length > 0
      ? `  auth: bearer tokens (${tokens.map((t) => `${t.name}: ${t.scopes.join("+")}`).join("; ")})`
      : "  auth: none (loopback only; configure serve.tokens before exposing further)"
  );
  console.error("  tools: get_context, save_session, continue_thread, list_threads, ingest_context");
  const shutdown = (): void => {
    void running.close().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/** The Behavior Layer install (design doc 11): explicit consent, then the
    skill/rules files land where each detected harness looks for them. */
async function runInit(argv: string[]): Promise<void> {
  if (argv.includes("--uninstall")) {
    const args = parseArgs(argv.filter((a) => a !== "--uninstall"));
    const config = loadConfig({ root: args.root, configPath: args.configPath });
    // Every file-writing harness, whether or not its directory still exists.
    let removed = 0;
    for (const harness of ["claude-code", "cursor", "agents-md"] as const) {
      const result = uninstallBehavior(harness, config.root);
      if (result.action === "absent") continue;
      removed += 1;
      console.error(`ctxfile: ${harness} behaviors ${result.action}: ${result.target}`);
    }
    const hadState = clearBehaviorState(config.cacheDir);
    if (removed === 0 && !hadState) {
      console.error("ctxfile: nothing to uninstall (no behavior files or consent found for this project).");
      return;
    }
    if (hadState) console.error("ctxfile: consent cleared; auto-capture is off until 'ctxfile init' again.");
    console.error("ctxfile: behavior layer uninstalled. The ctxfile MCP tools stay available; agents just won't checkpoint on their own.");
    return;
  }
  const printIndex = argv.indexOf("--print");
  if (printIndex !== -1) {
    const which = argv[printIndex + 1];
    if (!which || !(BEHAVIOR_HARNESSES as readonly string[]).includes(which)) {
      throw new Error(`--print requires one of: ${BEHAVIOR_HARNESSES.join(", ")}`);
    }
    process.stdout.write(renderBehavior(which as BehaviorHarness).content);
    // To stderr so it never pollutes the piped behavior text: pasted behaviors
    // only auto-checkpoint once auto-capture is enabled for this project.
    console.error(
      "\nctxfile: enable auto-capture for pasted behaviors to take effect — run 'ctxfile init --yes' " +
        "(or 'ctxfile init' and consent) in this project; otherwise auto checkpoints are skipped."
    );
    return;
  }
  const yes = argv.includes("--yes");
  const noAuto = argv.includes("--no-auto");
  const args = parseArgs(argv.filter((a) => a !== "--yes" && a !== "--no-auto"));
  const config = loadConfig({ root: args.root, configPath: args.configPath });

  let consent: boolean;
  if (yes) consent = true;
  else if (noAuto) consent = false;
  else if (process.stdin.isTTY) {
    const readline = await import("node:readline/promises");
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    const answer = await rl.question(
      "ctxfile can make your agents checkpoint context automatically (announced in the\n" +
        "conversation every time, never silent; 'ctxfile pause' turns it off; every\n" +
        "capture is reviewable via 'ctxfile ingest list'). Enable auto-capture? [y/N] "
    );
    rl.close();
    consent = /^y(es)?$/i.test(answer.trim());
  } else {
    throw new Error("non-interactive shell: pass --yes (enable auto-capture) or --no-auto");
  }

  writeBehaviorState(config.cacheDir, {
    autoCapture: consent,
    paused: false,
    consentAt: new Date().toISOString(),
  });
  if (!consent) {
    console.error("ctxfile: auto-capture stays OFF (recorded). Agents save only when you ask.");
    console.error("  Change your mind any time: ctxfile init --yes");
    return;
  }

  const detected = detectHarnesses(config.root, os.homedir());
  if (detected.length === 0) {
    console.error("ctxfile: auto-capture enabled; no harness directories detected in this project.");
  }
  for (const { harness, reason } of detected) {
    const result = installBehavior(harness, config.root);
    if (result.action === "printed") {
      console.error(`ctxfile: ${harness} detected (${reason}); paste block via: ctxfile init --print ${harness}`);
    } else {
      console.error(`ctxfile: ${harness} behaviors ${result.action}: ${result.target} (${reason})`);
    }
  }
  console.error("ctxfile: for any other harness: ctxfile init --print generic");
  console.error("ctxfile: auto-capture ON. Every save is announced; 'ctxfile pause' stops it; 'ctxfile ingest list' reviews it.");
}

function runPauseResume(paused: boolean, argv: string[]): void {
  const args = parseArgs(argv);
  const config = loadConfig({ root: args.root, configPath: args.configPath });
  const state = readBehaviorState(config.cacheDir);
  writeBehaviorState(config.cacheDir, {
    ...state,
    paused,
    pausedAt: paused ? new Date().toISOString() : undefined,
  });
  console.error(
    paused
      ? "ctxfile: auto-capture paused everywhere ('ctxfile resume' to re-enable; manual saves still work)"
      : "ctxfile: auto-capture resumed"
  );
}

function requireVaultPassphrase(): string {
  const passphrase = process.env.CTXFILE_VAULT_PASSPHRASE?.trim();
  if (!passphrase) {
    throw new Error(
      "set CTXFILE_VAULT_PASSPHRASE in the environment (never on the command line; argv leaks into process lists)"
    );
  }
  return passphrase;
}

/** Recovery code from the environment, or an interactive prompt on a TTY.
    Kept off argv for the same reason as the passphrase. */
async function requireRecoveryCode(): Promise<string> {
  const fromEnv = process.env.CTXFILE_VAULT_RECOVERY_CODE?.trim();
  if (fromEnv) return fromEnv;
  if (process.stdin.isTTY) {
    const readline = await import("node:readline/promises");
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    const answer = (await rl.question("Enter your vault recovery code: ")).trim();
    rl.close();
    if (answer) return answer;
  }
  throw new Error("set CTXFILE_VAULT_RECOVERY_CODE (or run interactively) to provide the recovery code");
}

/** The Sync vault client: create/join a vault on a relay, then `ctxfile sync`
    moves this project's sessions and threads through it, encrypted before
    upload. Free to use against a self-hosted relay; the hosted vault at
    sync.ctxfile.dev is the paid Sync tier, enforced server-side. */
async function runVault(argv: string[]): Promise<void> {
  const sub = argv[0];
  const args = parseArgs(argv.slice(1));
  if (sub === "create") {
    if (!args.relay || !args.name) throw new Error("vault create requires --relay <url> and --name <name>");
    const passphrase = requireVaultPassphrase();
    const { config, recoveryCode } = await createVault({
      relayUrl: args.relay,
      name: args.name,
      mode: args.mode ?? "standard",
      passphrase,
    });
    console.error(`ctxfile: vault "${config.name}" created (${config.mode}) at ${config.relayUrl}`);
    console.error(`  config: ${DEFAULT_VAULT_CONFIG_PATH} (mode 600; the token inside is a secret)`);
    console.error(`  MCP connector for chat apps: ${config.relayUrl.replace(/\/+$/, "")}/mcp (bearer: the vault token)`);
    console.error("");
    console.error("  RECOVERY CODE (shown once, write it down; a lost passphrase without it");
    console.error("  cannot be reset, and we mean that):");
    console.error(`    ${recoveryCode}`);
    console.error("");
    console.error("  Next: ctxfile sync   (pushes this project's sessions and threads)");
    return;
  }
  if (sub === "join") {
    if (!args.relay || !args.token) throw new Error("vault join requires --relay <url> and --token <vault-token>");
    const passphrase = requireVaultPassphrase();
    const config = await joinVault({ relayUrl: args.relay, token: args.token, passphrase });
    console.error(`ctxfile: joined vault "${config.name}" (${config.mode}); config at ${DEFAULT_VAULT_CONFIG_PATH}`);
    console.error("  Next: ctxfile sync");
    return;
  }
  if (sub === "recover") {
    const existing = loadVaultConfig();
    const relayUrl = args.relay ?? existing?.relayUrl;
    const token = args.token ?? process.env.CTXFILE_VAULT_TOKEN?.trim() ?? existing?.token;
    if (!relayUrl || !token) {
      throw new Error(
        "vault recover needs a relay and device token: run on a device that has already joined the vault, " +
          "or pass --relay <url> and set CTXFILE_VAULT_TOKEN"
      );
    }
    const recoveryCode = await requireRecoveryCode();
    const newPassphrase = requireVaultPassphrase();
    const { config, recoveryCode: rotated } = await recoverVault({ relayUrl, token, recoveryCode, newPassphrase });
    console.error(`ctxfile: passphrase reset for vault "${config.name}" at ${config.relayUrl}`);
    console.error("  The old passphrase no longer unlocks the vault; the new one is CTXFILE_VAULT_PASSPHRASE.");
    console.error("");
    console.error("  NEW RECOVERY CODE (the previous code is now invalid; write this down):");
    console.error(`    ${rotated}`);
    return;
  }
  if (sub === "status") {
    const config = loadVaultConfig();
    if (!config) {
      console.error("ctxfile: no vault configured (run 'ctxfile vault create' or 'ctxfile vault join')");
      return;
    }
    console.error(`ctxfile: vault "${config.name}" (${config.mode}) at ${config.relayUrl} [${config.vaultId}]`);
    try {
      await fetchVaultMeta(fetch, config.relayUrl, config.token);
      console.error("  relay: reachable, token accepted");
    } catch (error) {
      console.error(`  relay: UNREACHABLE or token rejected (${error instanceof Error ? error.message : String(error)})`);
    }
    return;
  }
  throw new Error('vault requires "create", "join", "recover", or "status" (see --help)');
}

async function runSync(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const config = loadConfig({ root: args.root, configPath: args.configPath });
  const vault = loadVaultConfig();
  if (!vault) throw new Error("no vault configured; run 'ctxfile vault create --relay <url> --name <n>' first");
  const passphrase = requireVaultPassphrase();
  const store = new IngestStore(path.join(config.cacheDir, "ingest.db"));
  try {
    const client = await openVaultSync(vault, passphrase, store, config.root);
    const result = await client.sync();
    console.error(
      `ctxfile: synced with vault "${vault.name}": pushed ${result.pushed}, applied ${result.applied} (client-side encrypted; the relay holds ciphertext only)`
    );
  } finally {
    store.close();
  }
}

/** Threads are the durable identities sessions attach to; this is the
    read-side visibility for them, like `ingest list` is for sessions. */
function runThreads(argv: string[]): void {
  if (argv[0] === "private") {
    const id = Number(argv[1]);
    if (!Number.isInteger(id) || id < 1) throw new Error("threads private requires a numeric id from 'ctxfile threads'");
    const off = argv.includes("--off");
    const args = parseArgs(argv.slice(2).filter((a) => a !== "--off"));
    const config = loadConfig({ root: args.root, configPath: args.configPath });
    const store = new IngestStore(path.join(config.cacheDir, "ingest.db"));
    try {
      const changed = store.setThreadPrivate(config.root, id, !off);
      console.error(
        changed
          ? off
            ? `ctxfile: thread #${id} is public again (auto-capture included)`
            : `ctxfile: thread #${id} is now private (excluded from auto-capture; manual saves still work)`
          : `ctxfile: no thread #${id} for this project`
      );
    } finally {
      store.close();
    }
    return;
  }
  const rest = argv[0] === "list" ? argv.slice(1) : argv;
  const args = parseArgs(rest);
  const config = loadConfig({ root: args.root, configPath: args.configPath });
  const store = new IngestStore(path.join(config.cacheDir, "ingest.db"));
  try {
    const threads = store.listThreads(config.root);
    if (threads.length === 0) {
      console.error("ctxfile: no threads for this project yet (save_session with a thread name starts one)");
      return;
    }
    for (const t of threads) {
      process.stdout.write(
        `#${t.id}  "${t.title}"${t.private ? "  [private]" : ""}  ${t.sessionCount} session${t.sessionCount === 1 ? "" : "s"}  last active ${t.lastActiveAt}${
          t.lastHarness ? `  via ${t.lastHarness}` : ""
        }\n`
      );
    }
  } finally {
    store.close();
  }
}

const FULL_PROFILE_WARNING = `ctxfile: WARNING — profile "full" includes session digests, Notion content,
ctxfile: and file bodies. Committing it to a repository shares private working
ctxfile: notes with everyone who can clone it. Keep it out of version control
ctxfile: unless that is exactly what you intend.`;

async function runExport(args: CliArgs): Promise<void> {
  const config = loadConfig({ root: args.root, configPath: args.configPath });
  const profile = args.profile ?? config.export.profile;
  const pro = await loadProModule();
  const runtime = createRuntime(config, { pro });
  // Always rebuild: an export is an explicit act and must reflect the working
  // tree as it is now, not a cache from up to cacheMaxAgeMs ago.
  const ctx = await runtime.service.rebuild();
  const envelope = buildExportEnvelope(ctx, { profile, customSections: config.export.include });

  if (profile === "full") console.error(FULL_PROFILE_WARNING);

  if (args.stdout) {
    process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
    return;
  }

  const outDir = path.join(config.root, ".ctxfile");
  mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "context.json");
  const mdPath = path.join(outDir, "context.md");
  writeFileSync(jsonPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, renderExportMarkdown(envelope), "utf8");
  console.error(`ctxfile export (${profile}) wrote:`);
  console.error(`  ${jsonPath}`);
  console.error(`  ${mdPath}`);

  if (profile === "full" && !gitignoreCovers(config.root)) {
    console.error(`ctxfile: consider adding ".ctxfile/" to .gitignore before committing.`);
  }
}

/** True when .gitignore already mentions the .ctxfile directory. */
function gitignoreCovers(root: string): boolean {
  try {
    return readFileSync(path.join(root, ".gitignore"), "utf8")
      .split("\n")
      .some((line) => line.trim().replace(/\/$/, "") === ".ctxfile");
  } catch {
    return false;
  }
}

function runHooks(argv: string[]): void {
  const sub = argv[0];
  const args = parseArgs(argv.slice(1));
  const root = path.resolve(args.root ?? process.cwd());
  if (sub === "install") {
    const { hookPath, action } = installHook(root);
    console.error(`ctxfile: pre-commit hook ${action} at ${hookPath}`);
    console.error("ctxfile: each commit now refreshes .ctxfile/context.{json,md} (repo-safe)");
    return;
  }
  if (sub === "uninstall") {
    const { hookPath, removed } = uninstallHook(root);
    console.error(
      removed
        ? `ctxfile: managed block removed from ${hookPath}`
        : `ctxfile: no managed block found at ${hookPath}`
    );
    return;
  }
  throw new Error(`hooks requires "install" or "uninstall" (see --help)`);
}

function runIngest(argv: string[]): void {
  const sub = argv[0];
  const rest = sub === "rm" ? argv.slice(2) : argv.slice(1);
  const args = parseArgs(rest);
  const config = loadConfig({ root: args.root, configPath: args.configPath });
  const store = new IngestStore(path.join(config.cacheDir, "ingest.db"));
  try {
    if (sub === "list") {
      const records = store.list(config.root);
      if (records.length === 0) {
        console.error("ctxfile: no agent-reported sessions for this project");
        return;
      }
      for (const record of records) {
        const head = record.summary.replace(/\s+/g, " ").slice(0, 80);
        const thread = record.threadTitle ? `  ["${record.threadTitle}"]` : "";
        process.stdout.write(
          `#${record.id}  ${record.harness}  ${record.sessionId}  rev${record.revision}  ${record.updatedAt}${thread}  ${head}\n`
        );
      }
      return;
    }
    if (sub === "rm") {
      const id = Number(argv[1]);
      if (!Number.isInteger(id) || id < 1) throw new Error("ingest rm requires a numeric id from 'ingest list'");
      const removed = store.remove(config.root, id);
      console.error(removed ? `ctxfile: removed ingest record #${id}` : `ctxfile: no ingest record #${id}`);
      return;
    }
    throw new Error(`ingest requires "list" or "rm <id>" (see --help)`);
  } finally {
    store.close();
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === "activate") {
    activate(argv[1]);
    return;
  }
  if (argv[0] === "ingest") {
    runIngest(argv.slice(1));
    return;
  }
  if (argv[0] === "init") {
    await runInit(argv.slice(1));
    return;
  }
  if (argv[0] === "pause" || argv[0] === "resume") {
    runPauseResume(argv[0] === "pause", argv.slice(1));
    return;
  }
  if (argv[0] === "threads") {
    runThreads(argv.slice(1));
    return;
  }
  if (argv[0] === "vault") {
    await runVault(argv.slice(1));
    return;
  }
  if (argv[0] === "sync") {
    await runSync(argv.slice(1));
    return;
  }
  if (argv[0] === "serve") {
    await runServe(parseArgs(argv.slice(1)));
    return;
  }
  if (argv[0] === "ui") {
    await runUi(parseArgs(argv.slice(1)));
    return;
  }
  if (argv[0] === "export") {
    await runExport(parseArgs(argv.slice(1)));
    return;
  }
  if (argv[0] === "hooks") {
    runHooks(argv.slice(1));
    return;
  }
  const args = parseArgs(argv);
  const config = loadConfig({ root: args.root, configPath: args.configPath });
  const pro = await loadProModule();
  const server = createServer(config, { pro });
  await server.connect(new StdioServerTransport());
  // stdout is reserved for JSON-RPC; all diagnostics go to stderr.
  console.error(`ctxfile v${VERSION} serving ${config.root} over stdio`);
  // Opt-in only, anonymous, fire-and-forget with internal error swallowing.
  void sendPingIfDue(config);
}

main().catch((error: unknown) => {
  console.error(`ctxfile: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
