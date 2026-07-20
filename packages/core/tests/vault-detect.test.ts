import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendVaultToConfig, detectVaultNear, paraDefaultExcludes, tildeRelative } from "../src/vault-detect.js";

describe("vault detection + config write", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cb-detect-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("detects .obsidian in root, child, and parent (in that order); null otherwise", () => {
    expect(detectVaultNear(dir)).toBeNull();
    mkdirSync(path.join(dir, "child", ".obsidian"), { recursive: true });
    expect(detectVaultNear(dir)).toBe(path.join(dir, "child"));
    mkdirSync(path.join(dir, ".obsidian"));
    expect(detectVaultNear(dir)).toBe(dir);
    const project = path.join(dir, "child", "project");
    mkdirSync(project);
    expect(detectVaultNear(project)).toBe(path.join(dir, "child"));
  });

  it("PARA defaults exclude Resources and Archive only when PARA folders exist", () => {
    expect(paraDefaultExcludes(dir)).toEqual([]);
    mkdirSync(path.join(dir, "Projects"));
    mkdirSync(path.join(dir, "Archive"));
    expect(paraDefaultExcludes(dir)).toEqual(["Archive/**"]);
    mkdirSync(path.join(dir, "Resources"));
    expect(paraDefaultExcludes(dir)).toEqual(["Resources/**", "Archive/**"]);
  });

  it("tildeRelative keeps configs username-free", () => {
    expect(tildeRelative(path.join(os.homedir(), "Vaults", "W"))).toBe("~/Vaults/W");
    expect(tildeRelative("/srv/vault")).toBe("/srv/vault");
  });

  it("appendVaultToConfig merges, preserves keys, refuses to clobber", () => {
    const configPath = path.join(dir, ".ctxfile.json");
    writeFileSync(configPath, JSON.stringify({ tokenBudget: 9000 }));
    expect(appendVaultToConfig(configPath, "/v/one", ["Archive/**"])).toBe("written");
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    expect(parsed.tokenBudget).toBe(9000);
    expect(parsed.vaults).toEqual([{ path: "/v/one", exclude: ["Archive/**"] }]);
    expect(appendVaultToConfig(configPath, "/v/two", [])).toBe("exists");
    writeFileSync(configPath, "{not json");
    expect(appendVaultToConfig(configPath, "/v/one", [])).toBe("unparseable");
  });

  it("creates the config file when absent", () => {
    const configPath = path.join(dir, ".ctxfile.json");
    expect(appendVaultToConfig(configPath, "/v/one", [])).toBe("written");
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({ vaults: [{ path: "/v/one" }] });
  });
});
