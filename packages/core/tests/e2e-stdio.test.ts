import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ContextObject } from "../src/engine/types.js";

// End-to-end over the real transport: spawns the BUILT cli (dist/cli.js) as a
// child process and talks MCP over stdio, exactly like Claude Code would.
const CLI_PATH = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const CLI_BUILT = existsSync(CLI_PATH);
const E2E_TIMEOUT = 30_000;

if (!CLI_BUILT) {
  console.error(
    `e2e-stdio: SKIPPED — built cli not found at ${CLI_PATH}; run "npm run build" first (unit CI may run pre-build)`
  );
}

describe.skipIf(!CLI_BUILT)("stdio E2E (built cli.js over a real transport)", () => {
  let dir: string;
  let client: Client;

  beforeAll(async () => {
    // Temp-dir git fixture repo — same pattern as server.test.ts; never the real repo.
    dir = mkdtempSync(path.join(os.tmpdir(), "cb-e2e-"));
    writeFileSync(path.join(dir, "PLAN.md"), "# Plan\nBuild the thing.");
    writeFileSync(path.join(dir, "README.md"), "# Fixture");
    mkdirSync(path.join(dir, "src"));
    writeFileSync(path.join(dir, "src", "index.ts"), "export const one = 1;\n");
    execFileSync("git", ["init", "-b", "main"], { cwd: dir, stdio: "pipe" });
    execFileSync("git", ["config", "user.email", "t@e.st"], { cwd: dir, stdio: "pipe" });
    execFileSync("git", ["config", "user.name", "T"], { cwd: dir, stdio: "pipe" });
    execFileSync("git", ["add", "-A"], { cwd: dir, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "fixture commit"], { cwd: dir, stdio: "pipe" });

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI_PATH, "--root", dir],
    });
    client = new Client({ name: "e2e-stdio-client", version: "0.0.0" });
    await client.connect(transport);
  }, E2E_TIMEOUT);

  afterAll(async () => {
    await client?.close();
    rmSync(dir, { recursive: true, force: true });
  }, E2E_TIMEOUT);

  it(
    "lists the get_context tool",
    async () => {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain("get_context");
    },
    E2E_TIMEOUT
  );

  it(
    "lists the context://current resource",
    async () => {
      const { resources } = await client.listResources();
      expect(resources.map((r) => r.uri)).toContain("context://current");
    },
    E2E_TIMEOUT
  );

  it(
    "callTool get_context scope=git returns parseable context with meta.name ctxfile",
    async () => {
      const result = await client.callTool({ name: "get_context", arguments: { scope: "git" } });
      expect(result.isError ?? false).toBe(false);
      const structured = result.structuredContent as { context: string };
      expect(typeof structured.context).toBe("string");
      const ctx = JSON.parse(structured.context) as ContextObject;
      expect(ctx.meta.name).toBe("ctxfile");
      expect(ctx.gitState?.branch).toBe("main");
      expect(ctx.gitState?.commits[0]?.message).toBe("fixture commit");
    },
    E2E_TIMEOUT
  );
});
