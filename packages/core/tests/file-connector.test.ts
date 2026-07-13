import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { fileConnector } from "../src/connectors/file.js";
import { TokenBudget } from "../src/engine/tokens.js";

describe("fileConnector", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cb-files-"));
    writeFileSync(path.join(dir, ".gitignore"), "ignored.log\nbuild/\n");
    writeFileSync(path.join(dir, "ignored.log"), "should not appear");
    mkdirSync(path.join(dir, "build"));
    writeFileSync(path.join(dir, "build", "artifact.js"), "generated");
    writeFileSync(path.join(dir, ".env"), "SECRET=supersecret");
    writeFileSync(path.join(dir, "PLAN.md"), "# The Plan\nShip ctxfile.");
    writeFileSync(path.join(dir, "README.md"), "# Readme\nHello.");
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "fixture" }));
    mkdirSync(path.join(dir, "src"));
    writeFileSync(
      path.join(dir, "src", "index.ts"),
      'const token = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";\nexport const x = 1;\n'
    );
    writeFileSync(path.join(dir, "binary.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function snapshot(budgetTokens = 50_000) {
    const config = loadConfig({ root: dir, env: {} });
    return fileConnector.snapshot({ config, budget: new TokenBudget(budgetTokens) });
  }

  it("is always enabled", () => {
    const config = loadConfig({ root: dir, env: {} });
    expect(fileConnector.isEnabled(config)).toBe(true);
  });

  it("collects files but respects .gitignore", async () => {
    const result = await snapshot();
    const paths = result.keyFiles!.map((f) => f.path);
    expect(paths).toContain("README.md");
    expect(paths).toContain("src/index.ts");
    expect(paths).not.toContain("ignored.log");
    expect(paths).not.toContain("build/artifact.js");
  });

  it("never reads denied paths like .env", async () => {
    const result = await snapshot();
    const paths = result.keyFiles!.map((f) => f.path);
    expect(paths).not.toContain(".env");
    expect(JSON.stringify(result)).not.toContain("supersecret");
  });

  it("redacts secrets in collected file content", async () => {
    const result = await snapshot();
    const indexFile = result.keyFiles!.find((f) => f.path === "src/index.ts");
    expect(indexFile).toBeDefined();
    expect(indexFile!.content).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(indexFile!.redactions).toBeGreaterThanOrEqual(1);
  });

  it("extracts the plan from PLAN.md and ranks it first", async () => {
    const result = await snapshot();
    expect(result.plan).toContain("Ship ctxfile");
    expect(result.keyFiles![0]!.path).toBe("PLAN.md");
  });

  it("never follows symlinks out of the root", async () => {
    const outside = mkdtempSync(path.join(os.tmpdir(), "cb-files-outside-"));
    writeFileSync(path.join(outside, "secret.txt"), "SECRETLEAK");
    symlinkSync(path.join(outside, "secret.txt"), path.join(dir, "link.txt"));
    symlinkSync(outside, path.join(dir, "linkdir"));
    const result = await snapshot();
    const paths = result.keyFiles!.map((f) => f.path);
    expect(paths).not.toContain("link.txt");
    expect(paths.some((p) => p.startsWith("linkdir"))).toBe(false);
    expect(JSON.stringify(result)).not.toContain("SECRETLEAK");
    rmSync(outside, { recursive: true, force: true });
  });

  it("skips binary files", async () => {
    const result = await snapshot();
    const paths = result.keyFiles!.map((f) => f.path);
    expect(paths).not.toContain("binary.png");
  });

  it("honors include as an allowlist when set", async () => {
    writeFileSync(path.join(dir, ".ctxfile.json"), JSON.stringify({ notion: {}, include: ["src/**"] }));
    const config = loadConfig({ root: dir, env: {} });
    const result = await fileConnector.snapshot({ config, budget: new TokenBudget(50_000) });
    const paths = result.keyFiles!.map((f) => f.path);
    expect(paths).toContain("src/index.ts");
    expect(paths).not.toContain("README.md");
    expect(paths).not.toContain("package.json");
  });

  it("respects the token budget", async () => {
    const budget = new TokenBudget(20);
    const config = loadConfig({ root: dir, env: {} });
    const result = await fileConnector.snapshot({ config, budget });
    const total = result.keyFiles!.reduce((sum, f) => sum + f.tokens, 0);
    expect(total).toBeLessThanOrEqual(20);
  });

  it("truncates files larger than maxFileTokens", async () => {
    writeFileSync(path.join(dir, "big.txt"), "x".repeat(100_000));
    const result = await snapshot();
    const big = result.keyFiles!.find((f) => f.path === "big.txt");
    expect(big).toBeDefined();
    expect(big!.truncated).toBe(true);
    expect(big!.tokens).toBeLessThanOrEqual(4_000);
  });
});
