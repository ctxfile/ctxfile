import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cb-config-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("applies defaults when no config file exists", () => {
    const config = loadConfig({ root: dir, env: {} });
    expect(config.root).toBe(dir);
    expect(config.tokenBudget).toBe(50_000);
    expect(config.maxFileTokens).toBe(4_000);
    expect(config.cacheMaxAgeMs).toBe(30_000);
    expect(config.notion.token).toBeNull();
    expect(config.notion.pageIds).toEqual([]);
    expect(config.ollama.baseUrl).toBe("http://localhost:11434");
    expect(config.ollama.summarize).toBe(false);
  });

  it("merges .ctxfile.json from the root", () => {
    writeFileSync(
      path.join(dir, ".ctxfile.json"),
      JSON.stringify({
        tokenBudget: 20_000,
        ollama: { summarize: true, model: "qwen3:4b" },
        notion: { pageIds: ["abc123"] },
      })
    );
    const config = loadConfig({ root: dir, env: {} });
    expect(config.tokenBudget).toBe(20_000);
    expect(config.maxFileTokens).toBe(4_000);
    expect(config.ollama.summarize).toBe(true);
    expect(config.ollama.model).toBe("qwen3:4b");
  });

  it("takes NOTION_TOKEN and OLLAMA_BASE_URL from env", () => {
    writeFileSync(path.join(dir, ".ctxfile.json"), JSON.stringify({ notion: { pageIds: ["p1"] } }));
    const config = loadConfig({
      root: dir,
      env: { NOTION_TOKEN: "ntn_test", OLLAMA_BASE_URL: "http://127.0.0.1:9999" },
    });
    expect(config.notion.token).toBe("ntn_test");
    expect(config.notion.pageIds).toEqual(["p1"]);
    expect(config.ollama.baseUrl).toBe("http://127.0.0.1:9999");
  });

  it("clears pageIds when no token is available", () => {
    writeFileSync(path.join(dir, ".ctxfile.json"), JSON.stringify({ notion: { pageIds: ["p1"] } }));
    const config = loadConfig({ root: dir, env: {} });
    expect(config.notion.pageIds).toEqual([]);
  });

  it("accepts every consult provider type, including openrouter", () => {
    writeFileSync(
      path.join(dir, ".ctxfile.json"),
      JSON.stringify({
        consult: {
          providers: [
            { type: "anthropic", model: "claude-sonnet-5" },
            { type: "openai-compatible", baseUrl: "https://api.example.com/v1", model: "gpt-test" },
            { type: "openrouter", model: "openai/gpt-5.2", apiKeyEnv: "OPENROUTER_API_KEY" },
            { type: "ollama", model: "qwen3:8b" },
          ],
        },
      })
    );
    const config = loadConfig({ root: dir, env: {} });
    expect(config.consult.providers).toHaveLength(4);
    expect(config.consult.providers[2]).toEqual({ type: "openrouter", model: "openai/gpt-5.2", apiKeyEnv: "OPENROUTER_API_KEY" });
  });

  it("rejects an unknown consult provider type", () => {
    writeFileSync(path.join(dir, ".ctxfile.json"), JSON.stringify({ consult: { providers: [{ type: "banana" }] } }));
    expect(() => loadConfig({ root: dir, env: {} })).toThrow(/\.ctxfile\.json/);
  });

  it("throws for a root that is not a directory", () => {
    expect(() => loadConfig({ root: path.join(dir, "nope"), env: {} })).toThrow(/not a directory/i);
  });

  it("throws for an invalid config file", () => {
    writeFileSync(path.join(dir, ".ctxfile.json"), "{not json");
    expect(() => loadConfig({ root: dir, env: {} })).toThrow(/\.ctxfile\.json/);
  });

  it("supports an explicit configPath", () => {
    const custom = path.join(dir, "custom.json");
    writeFileSync(custom, JSON.stringify({ tokenBudget: 123 }));
    const config = loadConfig({ root: dir, configPath: custom, env: {} });
    expect(config.tokenBudget).toBe(123);
  });
});
