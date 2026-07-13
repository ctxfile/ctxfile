import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installHook, resolveHooksDir, uninstallHook } from "../src/hooks.js";

const BLOCK_START = "# >>> ctxfile export (managed block) >>>";

describe("hooks install/uninstall", () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(path.join(os.tmpdir(), "cb-hooks-"));
    execFileSync("git", ["-C", repo, "init", "--quiet"]);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  function hookPath(): string {
    return path.join(resolveHooksDir(repo), "pre-commit");
  }

  it("creates an executable pre-commit hook with the managed block", () => {
    const result = installHook(repo);
    expect(result.action).toBe("created");
    expect(result.hookPath).toBe(hookPath());
    const content = readFileSync(hookPath(), "utf8");
    expect(content.startsWith("#!/bin/sh")).toBe(true);
    expect(content).toContain(BLOCK_START);
    expect(content).toContain("ctxfile export --profile repo-safe");
    expect(content).toContain("git add .ctxfile/context.json .ctxfile/context.md");
    // The executable bit is a POSIX concept; on Windows git runs hooks via its
    // bundled shell regardless of file mode, so skip the check there.
    if (process.platform !== "win32") {
      expect(statSync(hookPath()).mode & 0o111).not.toBe(0);
    }
  });

  it("is idempotent: a second install updates in place, one block total", () => {
    installHook(repo);
    const result = installHook(repo);
    expect(result.action).toBe("updated");
    const content = readFileSync(hookPath(), "utf8");
    expect(content.split(BLOCK_START).length - 1).toBe(1);
  });

  it("appends to an existing hook without touching its content", () => {
    writeFileSync(hookPath(), "#!/bin/sh\nnpm run lint\n", "utf8");
    const result = installHook(repo);
    expect(result.action).toBe("appended");
    const content = readFileSync(hookPath(), "utf8");
    expect(content).toContain("npm run lint");
    expect(content).toContain(BLOCK_START);
    expect(content.indexOf("npm run lint")).toBeLessThan(content.indexOf(BLOCK_START));
  });

  it("uninstall removes a hook file we fully own", () => {
    installHook(repo);
    const result = uninstallHook(repo);
    expect(result.removed).toBe(true);
    expect(existsSync(hookPath())).toBe(false);
  });

  it("uninstall strips only the managed block from a shared hook", () => {
    writeFileSync(hookPath(), "#!/bin/sh\nnpm run lint\n", "utf8");
    installHook(repo);
    const result = uninstallHook(repo);
    expect(result.removed).toBe(true);
    const content = readFileSync(hookPath(), "utf8");
    expect(content).toContain("npm run lint");
    expect(content).not.toContain(BLOCK_START);
  });

  it("uninstall reports removed=false when nothing is installed", () => {
    expect(uninstallHook(repo).removed).toBe(false);
    writeFileSync(hookPath(), "#!/bin/sh\nnpm run lint\n", "utf8");
    expect(uninstallHook(repo).removed).toBe(false);
    expect(readFileSync(hookPath(), "utf8")).toContain("npm run lint");
  });

  it("throws a clear error outside a git repository", () => {
    const plain = mkdtempSync(path.join(os.tmpdir(), "cb-plain-"));
    try {
      expect(() => resolveHooksDir(plain)).toThrow(/not a git repository/);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});
