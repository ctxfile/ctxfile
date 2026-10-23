import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLIENTS, connectClient, findClient, resolveLaunch, type ClientSpec, type ConnectContext } from "../src/connect.js";

let home: string;
let root: string;
let ctx: ConnectContext;

beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), "ctxfile-connect-home-"));
  root = mkdtempSync(path.join(os.tmpdir(), "ctxfile-connect-root-"));
  ctx = {
    root,
    home,
    platform: "linux",
    appData: null,
    launch: { command: "ctxfile", prefix: [], why: "test", portable: { command: "ctxfile", prefix: [] } },
  };
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});

const cursor = findClient("cursor") as ClientSpec;
const claudeCode = findClient("claude-code") as ClientSpec;
const cursorGlobal = (): string => path.join(home, ".cursor", "mcp.json");

describe("ctxfile connect: JSON configs", () => {
  it("creates the config when there is none", () => {
    const result = connectClient(cursor, ctx);
    expect(result.action).toBe("added");
    // One global entry serves whichever project is open: Cursor expands the placeholder.
    expect(JSON.parse(readFileSync(cursorGlobal(), "utf8"))).toEqual({
      mcpServers: { ctxfile: { command: "ctxfile", args: ["--root", "${workspaceFolder}"] } },
    });
  });

  it("merges into an existing config, keeps every other server, and backs the old file up", () => {
    mkdirSync(path.dirname(cursorGlobal()), { recursive: true });
    const before = { mcpServers: { github: { command: "gh-mcp", args: [] } }, other: { keep: true } };
    writeFileSync(cursorGlobal(), JSON.stringify(before));
    expect(connectClient(cursor, ctx).action).toBe("added");
    const after = JSON.parse(readFileSync(cursorGlobal(), "utf8")) as { mcpServers: Record<string, unknown>; other: unknown };
    expect(after.mcpServers.github).toEqual(before.mcpServers.github);
    expect(after.other).toEqual({ keep: true });
    expect(after.mcpServers.ctxfile).toBeDefined();
    expect(JSON.parse(readFileSync(`${cursorGlobal()}.ctxfile-backup`, "utf8"))).toEqual(before);
  });

  it("is idempotent, and leaves a different ctxfile entry alone unless forced", () => {
    connectClient(cursor, ctx);
    expect(connectClient(cursor, ctx).action).toBe("already");
    const custom = { mcpServers: { ctxfile: { command: "ctxfile", args: ["--root", "/elsewhere"] } } };
    writeFileSync(cursorGlobal(), JSON.stringify(custom));
    expect(connectClient(cursor, ctx).action).toBe("exists-different");
    expect(JSON.parse(readFileSync(cursorGlobal(), "utf8"))).toEqual(custom);
    expect(connectClient(cursor, ctx, { force: true }).action).toBe("added");
    expect(JSON.parse(readFileSync(cursorGlobal(), "utf8")).mcpServers.ctxfile.args).toEqual(["--root", "${workspaceFolder}"]);
  });

  it("never rewrites a file that is not plain JSON", () => {
    mkdirSync(path.dirname(cursorGlobal()), { recursive: true });
    const jsonc = '{\n  // my servers\n  "mcpServers": {},\n}\n';
    writeFileSync(cursorGlobal(), jsonc);
    const result = connectClient(cursor, ctx);
    expect(result.action).toBe("printed");
    expect(result.detail).toContain('"ctxfile"');
    expect(readFileSync(cursorGlobal(), "utf8")).toBe(jsonc);
  });

  it("writes nothing on a dry run", () => {
    const result = connectClient(cursor, ctx, { dryRun: true });
    expect(result.action).toBe("printed");
    expect(existsSync(cursorGlobal())).toBe(false);
  });

  it("keeps project configs portable: no machine paths in a file that gets committed", () => {
    const machine: ConnectContext = {
      ...ctx,
      launch: { command: "/opt/node/bin/node", prefix: ["/opt/node/lib/ctxfile/cli.js"], why: "abs", portable: { command: "ctxfile", prefix: [] } },
    };
    connectClient(cursor, machine, { scope: "project" });
    const project = JSON.parse(readFileSync(path.join(root, ".cursor", "mcp.json"), "utf8"));
    expect(project.mcpServers.ctxfile).toEqual({ command: "ctxfile", args: ["--root", "${workspaceFolder}"] });
    connectClient(cursor, machine, { scope: "global" });
    expect(JSON.parse(readFileSync(cursorGlobal(), "utf8")).mcpServers.ctxfile).toEqual({
      command: "/opt/node/bin/node",
      args: ["/opt/node/lib/ctxfile/cli.js", "--root", "${workspaceFolder}"],
    });
  });

  it("passes each client the project the way that client can use it", () => {
    const entryOf = (id: string, file: string, container: string[]): unknown => {
      connectClient(findClient(id) as ClientSpec, ctx);
      let value: unknown = JSON.parse(readFileSync(file, "utf8"));
      for (const key of container) value = (value as Record<string, unknown>)[key];
      return (value as Record<string, unknown>).ctxfile;
    };
    // No placeholder support and no project working directory: absolute.
    expect(entryOf("windsurf", path.join(home, ".codeium", "windsurf", "mcp_config.json"), ["mcpServers"])).toEqual({
      command: "ctxfile",
      args: ["--root", root],
    });
    expect(entryOf("claude-desktop", path.join(home, ".config", "Claude", "claude_desktop_config.json"), ["mcpServers"])).toEqual({
      command: "ctxfile",
      args: ["--root", root],
    });
    // Started in the project: relative.
    expect(entryOf("zed", path.join(home, ".config", "zed", "settings.json"), ["context_servers"])).toEqual({
      command: "ctxfile",
      args: ["--root", "."],
      env: {},
    });
    expect(entryOf("opencode", path.join(home, ".config", "opencode", "opencode.json"), ["mcp"])).toEqual({
      type: "local",
      command: ["ctxfile", "--root", "."],
      enabled: true,
    });
  });
});

describe("ctxfile connect: clients with their own CLI", () => {
  it("drives `claude mcp add` with an argument array, never a shell", () => {
    const calls: [string, string[]][] = [];
    const result = connectClient(claudeCode, ctx, {
      run: (bin, args) => {
        calls.push([bin, args]);
        return { status: 0, stdout: "Added", stderr: "", missing: false };
      },
    });
    expect(result.action).toBe("ran");
    // No --root: Claude Code sets CLAUDE_PROJECT_DIR for the servers it starts.
    expect(calls).toEqual([["claude", ["mcp", "add", "--scope", "user", "ctxfile", "--", "ctxfile"]]]);
  });

  it("treats 'already exists' as done, and a missing CLI as a command to run by hand", () => {
    const exists = connectClient(claudeCode, ctx, {
      run: () => ({ status: 1, stdout: "", stderr: "MCP server ctxfile already exists in user config", missing: false }),
    });
    expect(exists.action).toBe("already");
    const missing = connectClient(claudeCode, ctx, { run: () => ({ status: null, stdout: "", stderr: "", missing: true }) });
    expect(missing.action).toBe("printed");
    expect(missing.detail).toContain("claude mcp add --scope user ctxfile -- ctxfile");
  });
});

describe("ctxfile connect: launch and links", () => {
  it("uses npx when running from the npx cache", () => {
    const launch = resolveLaunch("/home/u/.npm/_npx/abc/node_modules/ctxfile/dist/cli.js", "/usr/bin/node", "linux");
    expect(launch).toMatchObject({ command: "npx", prefix: ["-y", "ctxfile"] });
  });

  it("builds a Cursor install link that decodes to the same config", () => {
    const link = (cursor.installLink as (c: ConnectContext) => string)(ctx);
    expect(link.startsWith("cursor://anysphere.cursor-deeplink/mcp/install?name=ctxfile&config=")).toBe(true);
    const config = decodeURIComponent(new URL(link).searchParams.get("config") ?? "");
    expect(JSON.parse(Buffer.from(config, "base64").toString("utf8"))).toEqual({ command: "ctxfile", args: ["--root", "${workspaceFolder}"] });
  });

  it("builds VS Code, LM Studio, and Goose links in each client's own format", () => {
    const link = (id: string): string => ((findClient(id) as ClientSpec).installLink as (c: ConnectContext) => string)(ctx);
    const vscode = link("vscode");
    expect(vscode.startsWith("vscode:mcp/install?")).toBe(true);
    expect(JSON.parse(decodeURIComponent(vscode.slice("vscode:mcp/install?".length)))).toEqual({
      name: "ctxfile",
      type: "stdio",
      command: "ctxfile",
      args: ["--root", "${workspaceFolder}"],
    });
    const lm = new URL(link("lm-studio"));
    expect(JSON.parse(Buffer.from(lm.searchParams.get("config") ?? "", "base64").toString("utf8"))).toEqual({ command: "ctxfile", args: ["--root", root] });
    // Goose only runs a short list of launchers from a link; npx is one.
    const goose = new URL(link("goose"));
    expect(goose.searchParams.get("cmd")).toBe("npx");
    expect(goose.searchParams.getAll("arg")).toEqual(["-y", "ctxfile", "--root", root]);
  });

  it("gives the exact snippet, never a write, for clients configured only by hand", () => {
    const result = connectClient(findClient("jetbrains-ai") as ClientSpec, ctx);
    expect(result.action).toBe("printed");
    expect(result.detail).toContain('"mcpServers"');
    expect(result.detail).toContain(root);
  });

  it("knows every client by a unique id and gives each a docs link", () => {
    const ids = CLIENTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const spec of CLIENTS) expect(spec.docs).toMatch(/^https:\/\/ctxfile\.dev\/docs\/clients\?tab=[a-z-]+$/);
  });
});
