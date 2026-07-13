import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import type { ProModule } from "../src/plugin.js";
import { loadProModule } from "../src/plugin.js";
import { createServer } from "../src/server.js";

const dir = mkdtempSync(path.join(os.tmpdir(), "cb-plugin-"));
const config = loadConfig({ root: dir, env: {} });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function connect(pro: ProModule | null) {
  const server = createServer(config, { cache: null, pro });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "plugin-test", version: "0" });
  await client.connect(clientTransport);
  return client;
}

describe("pro plugin seam", () => {
  it("loadProModule returns null without pro, or a valid ProModule when present", async () => {
    // The seam must hold in BOTH worlds: in the open-source repo (and for end
    // users without Pro installed) @ctxfile/pro does not resolve and this
    // returns null; in the monorepo it resolves via the workspace symlink.
    // License state is machine-dependent, so only the contract is asserted.
    const mod = await loadProModule();
    if (mod === null) return; // free tier / open-source build: graceful absence
    expect(mod.name).toBe("ctxfile-pro");
    const status = mod.licenseStatus();
    expect(status === null || typeof status === "string").toBe(true);
  });

  it("runs licensed pro connectors and tools", async () => {
    const pro: ProModule = {
      name: "fake-pro",
      licenseStatus: () => null,
      connectors: [
        {
          name: "fake-sessions",
          isEnabled: () => true,
          snapshot: async () => ({ sessionSummary: "from pro" }),
        },
      ],
      registerTools: (server) => {
        server.registerTool("pro_ping", { description: "pro tool" }, async () => ({
          content: [{ type: "text", text: "pong" }],
        }));
      },
    };
    const client = await connect(pro);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("pro_ping");

    const result = await client.callTool({ name: "get_context", arguments: {} });
    const ctx = JSON.parse((result.structuredContent as { context: string }).context);
    expect(ctx.sessionSummary).toBe("from pro");
    expect(ctx.meta.connectors.map((c: { name: string }) => c.name)).toContain("fake-sessions");
  });

  it("ignores pro connectors and tools when unlicensed", async () => {
    const pro: ProModule = {
      name: "fake-pro",
      licenseStatus: () => "no license activated",
      connectors: [
        {
          name: "fake-sessions",
          isEnabled: () => true,
          snapshot: async () => ({ sessionSummary: "should not appear" }),
        },
      ],
      registerTools: (server) => {
        server.registerTool("pro_ping", { description: "pro tool" }, async () => ({
          content: [{ type: "text", text: "pong" }],
        }));
      },
    };
    const client = await connect(pro);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).not.toContain("pro_ping");

    const result = await client.callTool({ name: "get_context", arguments: {} });
    const ctx = JSON.parse((result.structuredContent as { context: string }).context);
    expect(ctx.sessionSummary).toBeNull();
  });
});
