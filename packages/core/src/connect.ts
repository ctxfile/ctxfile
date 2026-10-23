import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * `ctxfile connect`: registers ctxfile as an MCP server in the clients a
 * person uses, so "connect to everything" is one command instead of ten
 * config files. The registry below is the single source of truth for how
 * each client wants a stdio server described.
 *
 * Rules, because these are other tools' config files:
 * - A client with its own `mcp add` command is driven through that command
 *   (the client owns its file format); we never hand-edit TOML or YAML.
 * - A JSON config is merged, never replaced: only our one entry changes,
 *   the previous file is kept as `<file>.ctxfile-backup`, and the write is
 *   atomic. A file that is not plain JSON (comments, trailing commas) is
 *   left alone and the snippet is printed instead.
 * - An existing, different `ctxfile` entry is left as it is unless --force.
 * - Nothing is written on a dry run, and nothing here ever runs on its own:
 *   only when the person (or their agent, on their say-so) runs the command.
 */

export interface ConnectContext {
  /** Absolute project directory ctxfile should serve. */
  root: string;
  home: string;
  platform: NodeJS.Platform;
  /** %APPDATA% on Windows. */
  appData: string | null;
  /** How a client should launch ctxfile (see resolveLaunch). */
  launch: Launch;
}

export interface Launch {
  command: string;
  /** Arguments before ctxfile's own (e.g. the script path for an absolute launch). */
  prefix: string[];
  /** Why this launch was chosen, for the person reading the output. */
  why: string;
  /** What a project-level config uses: it gets committed and shared, so it
      never holds this machine's paths. */
  portable: { command: string; prefix: string[] };
}

export type ConnectScope = "project" | "global";

interface JsonTarget {
  kind: "json";
  scope: ConnectScope;
  file: (ctx: ConnectContext) => string;
  /** Object path to the map of servers, e.g. ["mcpServers"]. */
  container: string[];
  entry: (ctx: ConnectContext, scope: ConnectScope) => Record<string, unknown>;
}

interface CliTarget {
  kind: "cli";
  scope: ConnectScope;
  bin: string;
  args: (ctx: ConnectContext, scope: ConnectScope) => string[];
}

type Target = JsonTarget | CliTarget;

export interface ClientSpec {
  id: string;
  name: string;
  /** A reason string when the client looks installed here, else null. */
  detect: (ctx: ConnectContext) => string | null;
  targets: Target[];
  /** Exact text to paste when nothing can be written for the person. */
  manual?: (ctx: ConnectContext) => string;
  /** One-click install link, when the client supports one for stdio servers. */
  installLink?: (ctx: ConnectContext) => string;
  docs: string;
}

/** The args ctxfile itself takes: always an absolute root for global configs
    (a global config has no project to be relative to). */
function launchFor(ctx: ConnectContext, scope: ConnectScope): { command: string; prefix: string[] } {
  return scope === "project" ? ctx.launch.portable : ctx.launch;
}

function launchCommand(ctx: ConnectContext, scope: ConnectScope): string {
  return launchFor(ctx, scope).command;
}

function serveArgs(ctx: ConnectContext, scope: ConnectScope): string[] {
  return [...launchFor(ctx, scope).prefix, "--root", scope === "project" ? "." : ctx.root];
}

function stdioEntry(ctx: ConnectContext, scope: ConnectScope): Record<string, unknown> {
  return { command: launchCommand(ctx, scope), args: serveArgs(ctx, scope) };
}

function homeDir(ctx: ConnectContext, ...parts: string[]): string {
  return path.join(ctx.home, ...parts);
}

function claudeDesktopConfig(ctx: ConnectContext): string {
  if (ctx.platform === "darwin") return homeDir(ctx, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (ctx.platform === "win32") return path.join(ctx.appData ?? homeDir(ctx, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  return homeDir(ctx, ".config", "Claude", "claude_desktop_config.json");
}

function anyExists(...paths: string[]): string | null {
  return paths.find((p) => existsSync(p)) ?? null;
}

function jsonSnippet(container: string[], entry: Record<string, unknown>): string {
  let value: Record<string, unknown> = { ctxfile: entry };
  for (const key of [...container].reverse()) value = { [key]: value };
  return JSON.stringify(value, null, 2);
}

export const CLIENTS: ClientSpec[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    detect: (ctx) => (anyExists(homeDir(ctx, ".claude"), path.join(ctx.root, ".claude")) ? ".claude directory present" : null),
    targets: [
      {
        kind: "cli",
        scope: "global",
        bin: "claude",
        args: (ctx, scope) => ["mcp", "add", "--scope", "user", "ctxfile", "--", launchCommand(ctx, scope), ...serveArgs(ctx, scope)],
      },
      {
        kind: "cli",
        scope: "project",
        bin: "claude",
        args: (ctx, scope) => ["mcp", "add", "--scope", "project", "ctxfile", "--", launchCommand(ctx, scope), ...serveArgs(ctx, scope)],
      },
    ],
    docs: "https://ctxfile.dev/docs/clients#claude-code",
  },
  {
    id: "cursor",
    name: "Cursor",
    detect: (ctx) => (anyExists(homeDir(ctx, ".cursor"), path.join(ctx.root, ".cursor")) ? ".cursor directory present" : null),
    targets: [
      { kind: "json", scope: "project", file: (ctx) => path.join(ctx.root, ".cursor", "mcp.json"), container: ["mcpServers"], entry: stdioEntry },
      { kind: "json", scope: "global", file: (ctx) => homeDir(ctx, ".cursor", "mcp.json"), container: ["mcpServers"], entry: stdioEntry },
    ],
    installLink: (ctx) =>
      `cursor://anysphere.cursor-deeplink/mcp/install?name=ctxfile&config=${encodeURIComponent(
        Buffer.from(JSON.stringify(stdioEntry(ctx, "global"))).toString("base64")
      )}`,
    docs: "https://ctxfile.dev/docs/clients#cursor",
  },
  {
    id: "vscode",
    name: "VS Code (GitHub Copilot)",
    detect: (ctx) =>
      anyExists(
        path.join(ctx.root, ".vscode"),
        homeDir(ctx, ".vscode"),
        homeDir(ctx, "Library", "Application Support", "Code"),
        homeDir(ctx, ".config", "Code"),
        path.join(ctx.appData ?? homeDir(ctx, "AppData", "Roaming"), "Code")
      )
        ? "VS Code settings present"
        : null,
    targets: [
      {
        kind: "json",
        scope: "project",
        file: (ctx) => path.join(ctx.root, ".vscode", "mcp.json"),
        container: ["servers"],
        entry: (ctx) => ({ type: "stdio", command: ctx.launch.portable.command, args: [...ctx.launch.portable.prefix, "--root", "${workspaceFolder}"] }),
      },
      {
        kind: "cli",
        scope: "global",
        bin: "code",
        args: (ctx) => ["--add-mcp", JSON.stringify({ name: "ctxfile", type: "stdio", ...stdioEntry(ctx, "global") })],
      },
    ],
    installLink: (ctx) =>
      `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: "ctxfile", type: "stdio", ...stdioEntry(ctx, "global") }))}`,
    docs: "https://ctxfile.dev/docs/clients#vscode",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    detect: (ctx) => (anyExists(homeDir(ctx, ".codeium", "windsurf")) ? "~/.codeium/windsurf present" : null),
    targets: [
      { kind: "json", scope: "global", file: (ctx) => homeDir(ctx, ".codeium", "windsurf", "mcp_config.json"), container: ["mcpServers"], entry: stdioEntry },
    ],
    docs: "https://ctxfile.dev/docs/clients#windsurf",
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    detect: (ctx) => (existsSync(path.dirname(claudeDesktopConfig(ctx))) ? "Claude Desktop settings folder present" : null),
    targets: [{ kind: "json", scope: "global", file: claudeDesktopConfig, container: ["mcpServers"], entry: stdioEntry }],
    docs: "https://ctxfile.dev/docs/clients#claude-desktop",
  },
  {
    id: "codex",
    name: "Codex CLI",
    detect: (ctx) => (anyExists(homeDir(ctx, ".codex")) ? "~/.codex present" : null),
    targets: [
      {
        kind: "cli",
        scope: "global",
        bin: "codex",
        args: (ctx, scope) => ["mcp", "add", "ctxfile", "--", launchCommand(ctx, scope), ...serveArgs(ctx, scope)],
      },
    ],
    docs: "https://ctxfile.dev/docs/clients#codex",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    detect: (ctx) => (anyExists(homeDir(ctx, ".gemini"), path.join(ctx.root, ".gemini")) ? ".gemini directory present" : null),
    targets: [
      {
        kind: "cli",
        scope: "global",
        bin: "gemini",
        args: (ctx, scope) => ["mcp", "add", "--scope", "user", "ctxfile", launchCommand(ctx, scope), ...serveArgs(ctx, scope)],
      },
      {
        kind: "cli",
        scope: "project",
        bin: "gemini",
        args: (ctx, scope) => ["mcp", "add", "ctxfile", launchCommand(ctx, scope), ...serveArgs(ctx, scope)],
      },
    ],
    docs: "https://ctxfile.dev/docs/clients#gemini",
  },
  {
    id: "opencode",
    name: "OpenCode",
    detect: (ctx) =>
      anyExists(homeDir(ctx, ".config", "opencode"), path.join(ctx.root, ".opencode"), path.join(ctx.root, "opencode.json"))
        ? "OpenCode config present"
        : null,
    targets: [
      {
        kind: "json",
        scope: "project",
        file: (ctx) => path.join(ctx.root, "opencode.json"),
        container: ["mcp"],
        entry: (ctx, scope) => ({ type: "local", command: [launchCommand(ctx, scope), ...serveArgs(ctx, scope)], enabled: true }),
      },
      {
        kind: "json",
        scope: "global",
        file: (ctx) => homeDir(ctx, ".config", "opencode", "opencode.json"),
        container: ["mcp"],
        entry: (ctx, scope) => ({ type: "local", command: [launchCommand(ctx, scope), ...serveArgs(ctx, scope)], enabled: true }),
      },
    ],
    docs: "https://ctxfile.dev/docs/clients#opencode",
  },
];

export function findClient(id: string): ClientSpec | undefined {
  const wanted = id.toLowerCase();
  return CLIENTS.find((c) => c.id === wanted);
}

// ---------------------------------------------------------------------------
// How a client should start ctxfile
// ---------------------------------------------------------------------------

/** Directories a desktop app launched from the dock or start menu usually
    has on its PATH (it does not see nvm, fnm, or volta shims). */
const GUI_PATH = ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin"];

/** Picks the launch command a client can rely on. `ctxfile` on a plain
    PATH is the portable choice. When ctxfile only exists behind a version
    manager (the "command not found" trap for desktop apps), use the absolute
    node binary and script instead. A run from the npx cache uses npx. */
export function resolveLaunch(scriptPath: string, nodePath: string, platform: NodeJS.Platform): Launch {
  let script = scriptPath;
  try {
    script = realpathSync(scriptPath);
  } catch {
    // keep the given path
  }
  if (/[\\/]_npx[\\/]/.test(script)) {
    const npx = { command: "npx", prefix: ["-y", "ctxfile"] };
    return { ...npx, portable: npx, why: "running from npx, so clients start it with npx" };
  }
  const plain = { command: "ctxfile", prefix: [] as string[] };
  if (platform === "win32") {
    return { ...plain, portable: plain, why: "ctxfile from your PATH" };
  }
  if (GUI_PATH.some((dir) => existsSync(path.join(dir, "ctxfile")))) {
    return { ...plain, portable: plain, why: "ctxfile is on the standard PATH" };
  }
  return {
    portable: plain,
    command: nodePath,
    prefix: [script],
    why: "ctxfile is only on a version-manager PATH that desktop apps cannot see, so the absolute node and script paths are used (re-run connect after switching Node versions)",
  };
}

// ---------------------------------------------------------------------------
// Doing it
// ---------------------------------------------------------------------------

export type ConnectAction = "added" | "already" | "exists-different" | "ran" | "printed" | "failed";

export interface ConnectResult {
  client: string;
  scope: ConnectScope;
  action: ConnectAction;
  /** File written or command run. */
  target: string;
  detail: string;
}

export interface ConnectOptions {
  scope?: ConnectScope;
  dryRun?: boolean;
  force?: boolean;
  /** Seam for tests: runs a client's CLI. */
  run?: (bin: string, args: string[]) => { status: number | null; stdout: string; stderr: string; missing: boolean };
}

function defaultRun(bin: string, args: string[]): { status: number | null; stdout: string; stderr: string; missing: boolean } {
  const result = spawnSync(bin, args, { encoding: "utf8", timeout: 30_000, shell: false });
  const missing = (result.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", missing };
}

function pickTarget(spec: ClientSpec, scope: ConnectScope | undefined): Target | undefined {
  if (scope) return spec.targets.find((t) => t.scope === scope);
  return spec.targets.find((t) => t.scope === "global") ?? spec.targets[0];
}

function shellQuote(arg: string): string {
  return /^[A-Za-z0-9_./:=@-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, "'\\''")}'`;
}

export function describeTarget(spec: ClientSpec, target: Target, ctx: ConnectContext): string {
  if (target.kind === "cli") return [target.bin, ...target.args(ctx, target.scope)].map(shellQuote).join(" ");
  return `${target.file(ctx)}:\n${jsonSnippet(target.container, target.entry(ctx, target.scope))}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function connectJson(spec: ClientSpec, target: JsonTarget, ctx: ConnectContext, options: ConnectOptions): ConnectResult {
  const file = target.file(ctx);
  const entry = target.entry(ctx, target.scope);
  const base = { client: spec.id, scope: target.scope, target: file };
  let doc: Record<string, unknown> = {};
  let existed = false;
  if (existsSync(file)) {
    existed = true;
    const raw = readFileSync(file, "utf8");
    if (raw.trim().length > 0) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return {
          ...base,
          action: "printed",
          detail: `${file} is not plain JSON (comments or trailing commas?), so it was left untouched. Add this by hand:\n${jsonSnippet(target.container, entry)}`,
        };
      }
      if (!isPlainObject(parsed)) {
        return { ...base, action: "printed", detail: `${file} does not hold a JSON object; left untouched. Add this by hand:\n${jsonSnippet(target.container, entry)}` };
      }
      doc = parsed;
    }
  }
  let holder: Record<string, unknown> = doc;
  for (const key of target.container) {
    const next = holder[key];
    if (next === undefined) holder[key] = {};
    else if (!isPlainObject(next)) {
      return { ...base, action: "printed", detail: `"${target.container.join(".")}" in ${file} is not an object; left untouched` };
    }
    holder = holder[key] as Record<string, unknown>;
  }
  const current = holder.ctxfile;
  if (current !== undefined && sameJson(current, entry)) return { ...base, action: "already", detail: "already registered" };
  if (current !== undefined && !options.force) {
    return {
      ...base,
      action: "exists-different",
      detail: `a different "ctxfile" entry is already there; left as is (re-run with --force to replace it with):\n${JSON.stringify(entry, null, 2)}`,
    };
  }
  holder.ctxfile = entry;
  if (options.dryRun) return { ...base, action: "printed", detail: `would write ${file}:\n${JSON.stringify(doc, null, 2)}` };
  mkdirSync(path.dirname(file), { recursive: true });
  if (existed) writeFileSync(`${file}.ctxfile-backup`, readFileSync(file));
  const tmp = `${file}.ctxfile-tmp`;
  writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  renameSync(tmp, file);
  return { ...base, action: "added", detail: existed ? `updated (previous file kept at ${file}.ctxfile-backup)` : "created" };
}

function connectCli(spec: ClientSpec, target: CliTarget, ctx: ConnectContext, options: ConnectOptions): ConnectResult {
  const args = target.args(ctx, target.scope);
  const command = [target.bin, ...args].map(shellQuote).join(" ");
  const base = { client: spec.id, scope: target.scope, target: command };
  if (options.dryRun) return { ...base, action: "printed", detail: `would run: ${command}` };
  const run = options.run ?? defaultRun;
  const result = run(target.bin, args);
  if (result.missing) return { ...base, action: "printed", detail: `\`${target.bin}\` is not on your PATH; run this yourself:\n${command}` };
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0) return { ...base, action: "ran", detail: `ran: ${command}` };
  if (/already exists|already configured|already added/i.test(output)) return { ...base, action: "already", detail: "already registered" };
  return { ...base, action: "failed", detail: `\`${command}\` failed: ${output.trim().slice(0, 400)}` };
}

export function connectClient(spec: ClientSpec, ctx: ConnectContext, options: ConnectOptions = {}): ConnectResult {
  const target = pickTarget(spec, options.scope);
  if (!target) {
    return {
      client: spec.id,
      scope: options.scope ?? "global",
      action: "printed",
      target: spec.docs,
      detail: spec.manual ? spec.manual(ctx) : `no ${options.scope ?? ""} config for ${spec.name}; see ${spec.docs}`,
    };
  }
  return target.kind === "json" ? connectJson(spec, target, ctx, options) : connectCli(spec, target, ctx, options);
}
