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

/**
 * How a client tells ctxfile which project to serve. Clients start stdio
 * servers in different folders and expand different placeholders, so each
 * target says which of these is true for it:
 * - "workspace": pass `${workspaceFolder}`, which the client expands (Cursor,
 *   VS Code, Hermes). One global entry then serves whatever project is open.
 * - "launch": pass `.`; the client starts servers in the project (Codex,
 *   Gemini CLI, OpenCode, Zed, Warp project configs, CLI agents).
 * - "auto": pass no --root; ctxfile reads CLAUDE_PROJECT_DIR, which Claude
 *   Code sets, then falls back to the working directory.
 * - "absolute": this project's absolute path; the client gives no usable
 *   working directory (Claude Desktop, Windsurf, Cline, Warp global, Kiro).
 */
export type RootStrategy = "workspace" | "launch" | "auto" | "absolute";

interface TargetBase {
  scope: ConnectScope;
  root: RootStrategy;
}

interface JsonTarget extends TargetBase {
  kind: "json";
  file: (ctx: ConnectContext) => string;
  /** Object path to the map of servers, e.g. ["mcpServers"]. */
  container: string[];
  entry: (ctx: ConnectContext, target: TargetBase) => Record<string, unknown>;
}

interface CliTarget extends TargetBase {
  kind: "cli";
  bin: string;
  args: (ctx: ConnectContext, target: TargetBase) => string[];
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
  /** One line on anything the person must do after connecting. */
  note?: string;
  docs: string;
}

/** Project-level configs get committed and shared, so they never hold this
    machine's paths: they use the portable launch. */
function launchFor(ctx: ConnectContext, scope: ConnectScope): { command: string; prefix: string[] } {
  return scope === "project" ? ctx.launch.portable : ctx.launch;
}

function rootArgs(ctx: ConnectContext, root: RootStrategy): string[] {
  if (root === "auto") return [];
  if (root === "launch") return ["--root", "."];
  if (root === "workspace") return ["--root", "${workspaceFolder}"];
  return ["--root", ctx.root];
}

/** The command and its arguments for one target. */
function launchLine(ctx: ConnectContext, target: TargetBase): { command: string; args: string[] } {
  const launch = launchFor(ctx, target.scope);
  return { command: launch.command, args: [...launch.prefix, ...rootArgs(ctx, target.root)] };
}

function stdioEntry(ctx: ConnectContext, target: TargetBase): Record<string, unknown> {
  return launchLine(ctx, target);
}

function typedStdioEntry(ctx: ConnectContext, target: TargetBase): Record<string, unknown> {
  return { type: "stdio", ...launchLine(ctx, target) };
}

/** Arguments for `<client> mcp add ctxfile -- <command> <args...>`. */
function dashDash(ctx: ConnectContext, target: TargetBase): string[] {
  const line = launchLine(ctx, target);
  return ["--", line.command, ...line.args];
}

function homeDir(ctx: ConnectContext, ...parts: string[]): string {
  return path.join(ctx.home, ...parts);
}

function appData(ctx: ConnectContext): string {
  return ctx.appData ?? homeDir(ctx, "AppData", "Roaming");
}

function claudeDesktopConfig(ctx: ConnectContext): string {
  if (ctx.platform === "darwin") return homeDir(ctx, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (ctx.platform === "win32") return path.join(appData(ctx), "Claude", "claude_desktop_config.json");
  return homeDir(ctx, ".config", "Claude", "claude_desktop_config.json");
}

function vscodeUserDir(ctx: ConnectContext): string {
  if (ctx.platform === "darwin") return homeDir(ctx, "Library", "Application Support", "Code", "User");
  if (ctx.platform === "win32") return path.join(appData(ctx), "Code", "User");
  return homeDir(ctx, ".config", "Code", "User");
}

function clineExtensionSettings(ctx: ConnectContext): string {
  return path.join(vscodeUserDir(ctx), "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json");
}

function clineSettings(ctx: ConnectContext): string {
  const extension = clineExtensionSettings(ctx);
  if (existsSync(path.dirname(path.dirname(extension)))) return extension;
  return homeDir(ctx, ".cline", "data", "settings", "cline_mcp_settings.json");
}

function zedSettings(ctx: ConnectContext): string {
  if (ctx.platform === "win32") return path.join(appData(ctx), "Zed", "settings.json");
  return homeDir(ctx, ".config", "zed", "settings.json");
}

function jetbrainsDir(ctx: ConnectContext): string {
  if (ctx.platform === "darwin") return homeDir(ctx, "Library", "Application Support", "JetBrains");
  if (ctx.platform === "win32") return path.join(appData(ctx), "JetBrains");
  return homeDir(ctx, ".config", "JetBrains");
}

function anyExists(...paths: string[]): string | null {
  return paths.find((p) => existsSync(p)) ?? null;
}

function present(reason: string, ...paths: string[]): string | null {
  return anyExists(...paths) ? reason : null;
}

function jsonSnippet(container: string[], entry: Record<string, unknown>): string {
  let value: Record<string, unknown> = { ctxfile: entry };
  for (const key of [...container].reverse()) value = { [key]: value };
  return JSON.stringify(value, null, 2);
}

function base64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

const GLOBAL_WORKSPACE: TargetBase = { scope: "global", root: "workspace" };
const GLOBAL_ABSOLUTE: TargetBase = { scope: "global", root: "absolute" };

function docs(id: string): string {
  return `https://ctxfile.dev/docs/clients?tab=${id}`;
}

export const CLIENTS: ClientSpec[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    detect: (ctx) => present(".claude directory present", homeDir(ctx, ".claude"), path.join(ctx.root, ".claude")),
    targets: [
      // No --root: Claude Code sets CLAUDE_PROJECT_DIR for every server it
      // starts, so one user-scope entry serves each project you open.
      { kind: "cli", scope: "global", root: "auto", bin: "claude", args: (ctx, t) => ["mcp", "add", "--scope", "user", "ctxfile", ...dashDash(ctx, t)] },
      { kind: "cli", scope: "project", root: "auto", bin: "claude", args: (ctx, t) => ["mcp", "add", "--scope", "project", "ctxfile", ...dashDash(ctx, t)] },
    ],
    note: "A project-scope (.mcp.json) server asks each teammate to approve it once.",
    docs: docs("claude-code"),
  },
  {
    id: "cursor",
    name: "Cursor",
    detect: (ctx) => present(".cursor directory present", homeDir(ctx, ".cursor"), path.join(ctx.root, ".cursor")),
    targets: [
      { kind: "json", scope: "global", root: "workspace", file: (ctx) => homeDir(ctx, ".cursor", "mcp.json"), container: ["mcpServers"], entry: stdioEntry },
      { kind: "json", scope: "project", root: "workspace", file: (ctx) => path.join(ctx.root, ".cursor", "mcp.json"), container: ["mcpServers"], entry: stdioEntry },
    ],
    installLink: (ctx) =>
      `cursor://anysphere.cursor-deeplink/mcp/install?name=ctxfile&config=${encodeURIComponent(base64Json(stdioEntry(ctx, GLOBAL_WORKSPACE)))}`,
    docs: docs("cursor"),
  },
  {
    id: "vscode",
    name: "VS Code (GitHub Copilot)",
    detect: (ctx) => present("VS Code settings present", vscodeUserDir(ctx), path.join(ctx.root, ".vscode")),
    targets: [
      {
        kind: "cli",
        scope: "global",
        root: "workspace",
        bin: "code",
        args: (ctx, t) => ["--add-mcp", JSON.stringify({ name: "ctxfile", ...typedStdioEntry(ctx, t) })],
      },
      { kind: "json", scope: "project", root: "workspace", file: (ctx) => path.join(ctx.root, ".vscode", "mcp.json"), container: ["servers"], entry: typedStdioEntry },
    ],
    installLink: (ctx) => `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: "ctxfile", ...typedStdioEntry(ctx, GLOBAL_WORKSPACE) }))}`,
    docs: docs("vscode"),
  },
  {
    id: "copilot-cli",
    name: "GitHub Copilot CLI",
    detect: (ctx) => present("~/.copilot present", homeDir(ctx, ".copilot")),
    targets: [{ kind: "cli", scope: "global", root: "launch", bin: "copilot", args: (ctx, t) => ["mcp", "add", "ctxfile", ...dashDash(ctx, t)] }],
    docs: docs("copilot-cli"),
  },
  {
    id: "windsurf",
    name: "Windsurf",
    detect: (ctx) => present("~/.codeium/windsurf present", homeDir(ctx, ".codeium", "windsurf")),
    targets: [
      { kind: "json", scope: "global", root: "absolute", file: (ctx) => homeDir(ctx, ".codeium", "windsurf", "mcp_config.json"), container: ["mcpServers"], entry: stdioEntry },
    ],
    note: "Windsurf has no project-folder placeholder, so this entry serves this one project.",
    docs: docs("windsurf"),
  },
  {
    id: "zed",
    name: "Zed",
    detect: (ctx) => present("Zed settings present", path.dirname(zedSettings(ctx)), path.join(ctx.root, ".zed")),
    targets: [
      { kind: "json", scope: "global", root: "launch", file: zedSettings, container: ["context_servers"], entry: (ctx, t) => ({ ...launchLine(ctx, t), env: {} }) },
      {
        kind: "json",
        scope: "project",
        root: "launch",
        file: (ctx) => path.join(ctx.root, ".zed", "settings.json"),
        container: ["context_servers"],
        entry: (ctx, t) => ({ ...launchLine(ctx, t), env: {} }),
      },
    ],
    note: "Zed's settings file usually has comments; if so, connect prints the block to paste.",
    docs: docs("zed"),
  },
  {
    id: "cline",
    name: "Cline",
    detect: (ctx) =>
      present("Cline settings present", path.dirname(path.dirname(clineExtensionSettings(ctx))), homeDir(ctx, ".cline")),
    targets: [
      {
        kind: "json",
        scope: "global",
        root: "absolute",
        file: clineSettings,
        container: ["mcpServers"],
        entry: (ctx, t) => ({ ...launchLine(ctx, t), disabled: false, autoApprove: [] }),
      },
    ],
    note: "Cline starts servers outside the project, so this entry serves this one project.",
    docs: docs("cline"),
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    detect: (ctx) => present("Claude Desktop settings folder present", path.dirname(claudeDesktopConfig(ctx))),
    targets: [{ kind: "json", scope: "global", root: "absolute", file: claudeDesktopConfig, container: ["mcpServers"], entry: stdioEntry }],
    note: "Quit and reopen Claude Desktop to load it.",
    docs: docs("claude-desktop"),
  },
  {
    id: "codex",
    name: "Codex CLI",
    detect: (ctx) => present("~/.codex present", homeDir(ctx, ".codex")),
    targets: [{ kind: "cli", scope: "global", root: "launch", bin: "codex", args: (ctx, t) => ["mcp", "add", "ctxfile", ...dashDash(ctx, t)] }],
    docs: docs("codex"),
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    detect: (ctx) => present(".gemini directory present", homeDir(ctx, ".gemini"), path.join(ctx.root, ".gemini")),
    targets: [
      {
        kind: "cli",
        scope: "global",
        root: "launch",
        bin: "gemini",
        args: (ctx, t) => {
          const line = launchLine(ctx, t);
          return ["mcp", "add", "-s", "user", "ctxfile", line.command, ...line.args];
        },
      },
      {
        kind: "cli",
        scope: "project",
        root: "launch",
        bin: "gemini",
        args: (ctx, t) => {
          const line = launchLine(ctx, t);
          return ["mcp", "add", "-s", "project", "ctxfile", line.command, ...line.args];
        },
      },
    ],
    note: "Gemini CLI only starts local servers in a trusted folder (gemini trust).",
    docs: docs("gemini"),
  },
  {
    id: "opencode",
    name: "OpenCode",
    detect: (ctx) =>
      present("OpenCode config present", homeDir(ctx, ".config", "opencode"), path.join(ctx.root, ".opencode"), path.join(ctx.root, "opencode.json")),
    targets: [
      {
        kind: "json",
        scope: "global",
        root: "launch",
        file: (ctx) => homeDir(ctx, ".config", "opencode", "opencode.json"),
        container: ["mcp"],
        entry: (ctx, t) => {
          const line = launchLine(ctx, t);
          return { type: "local", command: [line.command, ...line.args], enabled: true };
        },
      },
      {
        kind: "json",
        scope: "project",
        root: "launch",
        file: (ctx) => path.join(ctx.root, "opencode.json"),
        container: ["mcp"],
        entry: (ctx, t) => {
          const line = launchLine(ctx, t);
          return { type: "local", command: [line.command, ...line.args], enabled: true };
        },
      },
    ],
    docs: docs("opencode"),
  },
  {
    id: "warp",
    name: "Warp",
    detect: (ctx) => present("~/.warp present", homeDir(ctx, ".warp")),
    targets: [
      { kind: "json", scope: "global", root: "absolute", file: (ctx) => homeDir(ctx, ".warp", ".mcp.json"), container: ["mcpServers"], entry: stdioEntry },
      { kind: "json", scope: "project", root: "launch", file: (ctx) => path.join(ctx.root, ".warp", ".mcp.json"), container: ["mcpServers"], entry: stdioEntry },
    ],
    note: "Warp starts project-level servers only when you press Start in Settings, Agents, MCP servers.",
    docs: docs("warp"),
  },
  {
    id: "kiro",
    name: "Kiro",
    detect: (ctx) => present("~/.kiro present", homeDir(ctx, ".kiro")),
    targets: [
      { kind: "json", scope: "global", root: "absolute", file: (ctx) => homeDir(ctx, ".kiro", "settings", "mcp.json"), container: ["mcpServers"], entry: stdioEntry },
    ],
    installLink: (ctx) =>
      `https://kiro.dev/launch/mcp/add?name=ctxfile&config=${encodeURIComponent(JSON.stringify(stdioEntry(ctx, GLOBAL_ABSOLUTE)))}`,
    docs: docs("kiro"),
  },
  {
    id: "junie",
    name: "Junie (JetBrains)",
    detect: (ctx) => present("~/.junie present", homeDir(ctx, ".junie")),
    targets: [
      { kind: "json", scope: "global", root: "absolute", file: (ctx) => homeDir(ctx, ".junie", "mcp", "mcp.json"), container: ["mcpServers"], entry: stdioEntry },
    ],
    docs: docs("jetbrains"),
  },
  {
    id: "jetbrains-ai",
    name: "JetBrains AI Assistant",
    detect: (ctx) => present("JetBrains settings present", jetbrainsDir(ctx)),
    targets: [],
    manual: (ctx) =>
      `In the IDE: Settings, Tools, AI Assistant, Model Context Protocol (MCP), Add, then paste:\n${jsonSnippet(["mcpServers"], stdioEntry(ctx, GLOBAL_ABSOLUTE))}`,
    docs: docs("jetbrains"),
  },
  {
    id: "visual-studio",
    name: "Visual Studio",
    detect: (ctx) => (ctx.platform === "win32" ? present("Visual Studio folder present", path.join(ctx.home, "AppData", "Local", "Microsoft", "VisualStudio")) : null),
    targets: [
      { kind: "json", scope: "global", root: "absolute", file: (ctx) => homeDir(ctx, ".mcp.json"), container: ["servers"], entry: typedStdioEntry },
    ],
    installLink: (ctx) => `https://vs-open.link/mcp-install?${encodeURIComponent(JSON.stringify({ name: "ctxfile", ...typedStdioEntry(ctx, GLOBAL_ABSOLUTE) }))}`,
    docs: docs("visual-studio"),
  },
  {
    id: "goose",
    name: "Goose",
    detect: (ctx) => present("Goose config present", homeDir(ctx, ".config", "goose"), path.join(appData(ctx), "Block", "goose")),
    targets: [],
    // Goose links only run a short list of launchers, npx among them.
    installLink: (ctx) =>
      `goose://extension?cmd=npx&arg=-y&arg=ctxfile&arg=--root&arg=${encodeURIComponent(ctx.root)}&id=ctxfile&name=ctxfile&description=${encodeURIComponent(
        "Project context, threads, and tasks"
      )}&timeout=300`,
    manual: (ctx) =>
      `Open the install link above, or add to ~/.config/goose/config.yaml:\nextensions:\n  ctxfile:\n    name: ctxfile\n    type: stdio\n    cmd: ${launchLine(ctx, GLOBAL_ABSOLUTE).command}\n    args: ${JSON.stringify(launchLine(ctx, GLOBAL_ABSOLUTE).args)}\n    enabled: true\n    timeout: 300`,
    note: "Goose loads a new extension in the next session.",
    docs: docs("goose"),
  },
  {
    id: "lm-studio",
    name: "LM Studio",
    detect: (ctx) => present("LM Studio folder present", homeDir(ctx, ".lmstudio"), homeDir(ctx, ".cache", "lm-studio")),
    targets: [],
    installLink: (ctx) => `lmstudio://add_mcp?name=ctxfile&config=${encodeURIComponent(base64Json(stdioEntry(ctx, GLOBAL_ABSOLUTE)))}`,
    manual: (ctx) => `Or in LM Studio: Program, Install, Edit mcp.json, then add:\n${jsonSnippet(["mcpServers"], stdioEntry(ctx, GLOBAL_ABSOLUTE))}`,
    docs: docs("lm-studio"),
  },
  {
    id: "amp",
    name: "Amp",
    detect: (ctx) => present("Amp settings present", homeDir(ctx, ".config", "amp"), path.join(appData(ctx), "amp")),
    targets: [{ kind: "cli", scope: "global", root: "launch", bin: "amp", args: (ctx, t) => ["mcp", "add", "ctxfile", ...dashDash(ctx, t)] }],
    docs: docs("amp"),
  },
  {
    id: "hermes",
    name: "Hermes",
    detect: (ctx) => present("~/.hermes present", homeDir(ctx, ".hermes")),
    targets: [
      {
        kind: "cli",
        scope: "global",
        root: "workspace",
        bin: "hermes",
        // --args takes the rest of the line, so it goes last.
        args: (ctx, t) => {
          const line = launchLine(ctx, t);
          return ["mcp", "add", "ctxfile", "--command", line.command, "--args", ...line.args];
        },
      },
    ],
    note: "Run /reload-mcp in a Hermes session to pick it up.",
    docs: docs("hermes"),
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    detect: (ctx) => present("~/.openclaw present", homeDir(ctx, ".openclaw")),
    targets: [
      { kind: "cli", scope: "global", root: "absolute", bin: "openclaw", args: (ctx, t) => ["mcp", "set", "ctxfile", JSON.stringify(stdioEntry(ctx, t))] },
    ],
    docs: docs("openclaw"),
  },
  {
    id: "mistral-vibe",
    name: "Mistral Vibe CLI",
    detect: (ctx) => present("~/.vibe present", homeDir(ctx, ".vibe")),
    targets: [],
    manual: (ctx) => {
      const line = launchLine(ctx, GLOBAL_ABSOLUTE);
      return `Add to ~/.vibe/config.toml:\n[[mcp_servers]]\nname = "ctxfile"\ntransport = "stdio"\ncommand = ${JSON.stringify(line.command)}\nargs = ${JSON.stringify(line.args)}`;
    },
    docs: docs("mistral-vibe"),
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
  if (target.kind === "cli") return [target.bin, ...target.args(ctx, target)].map(shellQuote).join(" ");
  return `${target.file(ctx)}:\n${jsonSnippet(target.container, target.entry(ctx, target))}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function connectJson(spec: ClientSpec, target: JsonTarget, ctx: ConnectContext, options: ConnectOptions): ConnectResult {
  const file = target.file(ctx);
  const entry = target.entry(ctx, target);
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
  const args = target.args(ctx, target);
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
    const parts = [
      spec.installLink ? `One-click install link:\n${spec.installLink(ctx)}` : null,
      spec.manual ? spec.manual(ctx) : null,
    ].filter((p): p is string => p !== null);
    return {
      client: spec.id,
      scope: options.scope ?? "global",
      action: "printed",
      target: spec.docs,
      detail: parts.length > 0 ? parts.join("\n") : `no ${options.scope ?? ""} config ctxfile can write for ${spec.name}; see ${spec.docs}`,
    };
  }
  const result = target.kind === "json" ? connectJson(spec, target, ctx, options) : connectCli(spec, target, ctx, options);
  if (spec.note && (result.action === "added" || result.action === "ran")) result.detail = `${result.detail}\n${spec.note}`;
  return result;
}
