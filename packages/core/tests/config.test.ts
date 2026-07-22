import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("vaults config", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cb-vaultcfg-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeConfig(vaults: unknown): void {
    writeFileSync(path.join(dir, ".ctxfile.json"), JSON.stringify({ vaults }));
  }

  it("defaults to no vaults", () => {
    const config = loadConfig({ root: dir, env: {} });
    expect(config.vaults).toEqual([]);
  });

  it("resolves ~ to the home directory and defaults name to the basename", () => {
    writeConfig([{ path: "~/SomeVault/" }]);
    const config = loadConfig({ root: dir, env: {} });
    expect(config.vaults).toHaveLength(1);
    expect(config.vaults[0]!.path).toBe(path.join(os.homedir(), "SomeVault"));
    expect(config.vaults[0]!.name).toBe("SomeVault");
    expect(config.vaults[0]!.include).toEqual([]);
    expect(config.vaults[0]!.exclude).toEqual([]);
  });

  it("rejects duplicate resolved vault names", () => {
    writeConfig([{ path: "~/A/Vault" }, { path: "~/B/Vault" }]);
    expect(() => loadConfig({ root: dir, env: {} })).toThrow(/duplicate vault name/i);
  });

  it("auto-excludes a vault that lies inside the project root from the file walk", () => {
    mkdirSync(path.join(dir, "notes"));
    writeConfig([{ path: path.join(dir, "notes") }]);
    const config = loadConfig({ root: dir, env: {} });
    expect(config.exclude).toContain("notes/**");
  });

  it("keeps vaults outside the root out of the exclude list", () => {
    writeConfig([{ path: "~/ElsewhereVault" }]);
    const config = loadConfig({ root: dir, env: {} });
    expect(config.exclude).toEqual([]);
  });

  it("carves the project subtree out of a vault's own exclude when the root is nested inside it", () => {
    // The root is a subdirectory of the vault (e.g. `ctxfile init` detecting
    // a parent Obsidian vault) — the reverse of the already-covered
    // vault-under-root case. Without the carve-out the vault connector
    // would re-walk the whole project and double-read every markdown file.
    const parentVault = mkdtempSync(path.join(os.tmpdir(), "cb-vaultcfg-parent-"));
    const nestedRoot = path.join(parentVault, "projects", "myproj");
    mkdirSync(nestedRoot, { recursive: true });
    try {
      writeFileSync(path.join(nestedRoot, ".ctxfile.json"), JSON.stringify({ vaults: [{ path: parentVault }] }));
      const config = loadConfig({ root: nestedRoot, env: {} });
      expect(config.vaults).toHaveLength(1);
      expect(config.vaults[0]!.exclude).toContain("projects/myproj/**");
    } finally {
      rmSync(parentVault, { recursive: true, force: true });
    }
  });

  it("loads fine (and warns) when a vault path is identical to the project root", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      writeConfig([{ path: dir }]);
      const config = loadConfig({ root: dir, env: {} });
      expect(config.vaults).toHaveLength(1);
      expect(config.vaults[0]!.path).toBe(dir);
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls.some(([msg]) => typeof msg === "string" && /overlap|identical/i.test(msg))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("loads fine (no throw) and warns when a vault path sits under a sensitive root", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      // Use ~/.ssh rather than a hardcoded POSIX /etc: /etc resolves to
      // "D:\etc" on Windows and matches no sensitive entry, whereas the
      // home-relative markers are portable across platforms.
      const sensitive = path.join(os.homedir(), ".ssh", "some-ctxfile-test-vault");
      writeConfig([{ path: sensitive }]);
      const config = loadConfig({ root: dir, env: {} });
      expect(config.vaults).toHaveLength(1);
      expect(config.vaults[0]!.path).toBe(sensitive);
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls.some(([msg]) => typeof msg === "string" && /is under|\.ssh/i.test(msg))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
