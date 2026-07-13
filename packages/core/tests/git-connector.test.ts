import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { gitConnector } from "../src/connectors/git.js";
import { TokenBudget } from "../src/engine/tokens.js";

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

describe("gitConnector", () => {
  let repo: string;
  let nonRepo: string;

  beforeAll(() => {
    repo = mkdtempSync(path.join(os.tmpdir(), "cb-git-"));
    nonRepo = mkdtempSync(path.join(os.tmpdir(), "cb-nogit-"));

    git(repo, "init", "-b", "main");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "Test User");
    writeFileSync(path.join(repo, "a.txt"), "first\n");
    git(repo, "add", "a.txt");
    git(repo, "commit", "-m", "first commit");
    writeFileSync(path.join(repo, "b.txt"), "second\n");
    git(repo, "add", "b.txt");
    git(repo, "commit", "-m", "second commit");
    // working tree state: one modified, one staged, one untracked
    writeFileSync(path.join(repo, "a.txt"), "first modified\n");
    writeFileSync(path.join(repo, "b.txt"), "second modified staged\n");
    git(repo, "add", "b.txt");
    writeFileSync(path.join(repo, "new.txt"), "untracked\n");
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(nonRepo, { recursive: true, force: true });
  });

  it("is disabled outside a git repository", () => {
    const config = loadConfig({ root: nonRepo, env: {} });
    expect(gitConnector.isEnabled(config)).toBe(false);
  });

  it("is enabled inside a git repository", () => {
    const config = loadConfig({ root: repo, env: {} });
    expect(gitConnector.isEnabled(config)).toBe(true);
  });

  it("captures branch, status buckets, commits, and diff summary", async () => {
    const config = loadConfig({ root: repo, env: {} });
    const result = await gitConnector.snapshot({ config, budget: new TokenBudget(50_000) });
    const state = result.gitState!;

    expect(state.branch).toBe("main");
    expect(state.staged).toContain("b.txt");
    expect(state.modified).toContain("a.txt");
    expect(state.untracked).toContain("new.txt");
    expect(state.ahead).toBe(0);
    expect(state.behind).toBe(0);

    expect(state.commits).toHaveLength(2);
    expect(state.commits[0]!.message).toBe("second commit");
    expect(state.commits[0]!.author).toBe("Test User");
    expect(state.commits[0]!.hash).toMatch(/^[0-9a-f]{7,40}$/);

    expect(state.diffSummary).toContain("a.txt");
  });

  it("redacts secrets in commit messages", async () => {
    git(repo, "commit", "--allow-empty", "-m", "chore: rotate ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    const config = loadConfig({ root: repo, env: {} });
    const result = await gitConnector.snapshot({ config, budget: new TokenBudget(50_000) });
    const messages = result.gitState!.commits.map((c) => c.message).join("\n");
    expect(messages).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(messages).toContain("[REDACTED:");
  });
});
