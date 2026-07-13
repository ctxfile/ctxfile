import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import type { ContextObject } from "../src/engine/types.js";
import { createServer } from "../src/server.js";

describe("MCP server", () => {
  let dir: string;
  let client: Client;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cb-server-"));
    writeFileSync(path.join(dir, "PLAN.md"), "# Plan\nBuild the thing.");
    writeFileSync(path.join(dir, "README.md"), "# Fixture");
    mkdirSync(path.join(dir, "src"));
    writeFileSync(path.join(dir, "src", "index.ts"), "export const one = 1;\n");
    execFileSync("git", ["init", "-b", "main"], { cwd: dir, stdio: "pipe" });
    execFileSync("git", ["config", "user.email", "t@e.st"], { cwd: dir, stdio: "pipe" });
    execFileSync("git", ["config", "user.name", "T"], { cwd: dir, stdio: "pipe" });
    execFileSync("git", ["add", "-A"], { cwd: dir, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "fixture commit"], { cwd: dir, stdio: "pipe" });

    const config = loadConfig({ root: dir, env: {} });
    const server = createServer(config, { cache: null });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(clientTransport);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists the context resources", async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain("context://current");
    expect(uris).toContain("context://plan");
    expect(uris).toContain("context://git");
  });

  it("serves a valid full ContextObject at context://current", async () => {
    const result = await client.readResource({ uri: "context://current" });
    const content = result.contents[0]!;
    expect(content.mimeType).toBe("application/json");
    if (!("text" in content)) throw new Error("expected text resource contents");
    const ctx = JSON.parse(content.text) as ContextObject;
    expect(ctx.meta.name).toBe("ctxfile");
    expect(ctx.meta.root).toBe(dir);
    expect(ctx.plan).toContain("Build the thing");
    expect(ctx.keyFiles.length).toBeGreaterThan(0);
    expect(ctx.gitState?.branch).toBe("main");
    expect(ctx.gitState?.commits[0]?.message).toBe("fixture commit");
    const statuses = Object.fromEntries(ctx.meta.connectors.map((c) => [c.name, c.status]));
    expect(statuses["file"]).toBe("ok");
    expect(statuses["git"]).toBe("ok");
    expect(statuses["notion"]).toBe("skipped");
    expect(statuses["ollama"]).toBe("skipped");
  });

  it("filters to git scope via the get_context tool with structured output", async () => {
    const result = await client.callTool({ name: "get_context", arguments: { scope: "git" } });
    expect(result.isError ?? false).toBe(false);
    const structured = result.structuredContent as { context: string };
    const ctx = JSON.parse(structured.context) as ContextObject;
    expect(ctx.gitState?.branch).toBe("main");
    expect(ctx.keyFiles).toEqual([]);
    expect(ctx.plan).toBeNull();
  });

  it("rejects an invalid scope", async () => {
    const result = await client.callTool({ name: "get_context", arguments: { scope: "everything" } });
    expect(result.isError).toBe(true);
  });

  it("exposes the load-context prompt", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain("load-context");
    const prompt = await client.getPrompt({ name: "load-context" });
    const first = prompt.messages[0]!;
    expect(first.role).toBe("user");
    expect((first.content as { text: string }).text).toContain("ctxfile");
  });
});
