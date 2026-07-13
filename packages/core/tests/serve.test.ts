import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { createRuntime } from "../src/runtime.js";
import { startHttpServer, type RunningHttpServer } from "../src/server.js";
import { IngestStore } from "../src/storage/ingest-store.js";

/**
 * The M1 milestone proof from the sync integration plan: two agents on
 * different client surfaces, connected over Streamable HTTP, sharing one
 * thread. Agent A (chatgpt) saves a session; agent B (claude) resumes it
 * cold from a separate MCP session.
 */
describe("ctxfile serve (the HTTP door)", () => {
  let dir: string;
  let store: IngestStore;
  let running: RunningHttpServer;
  let url: URL;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cb-serve-"));
    writeFileSync(path.join(dir, "README.md"), "# Fixture");
    execFileSync("git", ["init", "-b", "main"], { cwd: dir, stdio: "pipe" });

    const config = loadConfig({ root: dir, env: {} });
    store = new IngestStore(path.join(dir, "ingest.db"));
    const runtime = createRuntime(config, { cache: null, ingest: store, pro: null, summarizer: null });
    running = await startHttpServer(config, runtime, {
      port: 0,
      host: "127.0.0.1",
      tokens: [
        { name: "full", value: "tok-full-secret", scopes: ["read:context", "write:sessions"] },
        { name: "readonly", value: "tok-ro-secret", scopes: ["read:context"] },
      ],
    });
    url = new URL(`http://127.0.0.1:${running.port}/mcp`);
  });

  afterAll(async () => {
    await running.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function connect(token: string, name: string): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    });
    const client = new Client({ name, version: "0.0.0" });
    await client.connect(transport);
    return { client, transport };
  }

  it("two agents share a thread across separate HTTP sessions (M1 proof)", async () => {
    const a = await connect("tok-full-secret", "chatgpt-connector");
    const saved = await a.client.callTool({
      name: "save_session",
      arguments: {
        summary: "Drafted the Q3 campaign brief and picked the launch date.",
        thread: "Q3 campaign",
        key_decisions: ["launch on Sep 3 because the venue is free"],
        open_items: ["draft the social copy"],
        harness: "chatgpt",
      },
    });
    expect(saved.isError ?? false).toBe(false);
    expect(saved.structuredContent).toMatchObject({ stored: true, thread: "Q3 campaign" });
    await a.client.close();

    const b = await connect("tok-full-secret", "claude-connector");
    const resumed = await b.client.callTool({ name: "continue_thread", arguments: { thread: "Q3 campaign" } });
    expect(resumed.isError ?? false).toBe(false);
    const text = (resumed.content as { text: string }[])[0]!.text;
    expect(text).toContain('Resuming "Q3 campaign"');
    expect(text).toContain("chatgpt");
    expect(text).toContain("draft the social copy");
    expect(text).toContain("agent-reported");
    await b.client.close();

    expect(store.listThreads(dir)).toHaveLength(1);
  });

  it("rejects a wrong bearer token at initialize", async () => {
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { authorization: "Bearer wrong-token" } },
    });
    const client = new Client({ name: "intruder", version: "0.0.0" });
    await expect(client.connect(transport)).rejects.toThrow();
  });

  it("binds an MCP session to the token that opened it", async () => {
    const a = await connect("tok-full-secret", "session-owner");
    const sessionId = a.transport.sessionId;
    expect(sessionId).toBeTruthy();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer tok-ro-secret",
        "mcp-session-id": sessionId as string,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/list" }),
    });
    expect(response.status).toBe(401);
    await a.client.close();
  });

  it("read-only scope can list and resume but not write", async () => {
    const ro = await connect("tok-ro-secret", "readonly-surface");
    const denied = await ro.client.callTool({
      name: "save_session",
      arguments: { summary: "should not be stored" },
    });
    expect(denied.isError).toBe(true);
    expect((denied.content as { text: string }[])[0]!.text).toContain("write:sessions");

    const listed = await ro.client.callTool({ name: "list_threads", arguments: {} });
    expect(listed.isError ?? false).toBe(false);
    expect((listed.content as { text: string }[])[0]!.text).toContain("Q3 campaign");
    await ro.client.close();
  });

  it("keeps Pro off the HTTP surface: exactly the five-tool remote surface", async () => {
    const c = await connect("tok-full-secret", "surface-check");
    const { tools } = await c.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "continue_thread",
      "get_context",
      "ingest_context",
      "list_threads",
      "save_session",
    ]);
    await c.client.close();
  });
});
