import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * `ctxfile hooks install`: a managed pre-commit block that regenerates the
 * repo-safe export and stages it, so every commit carries fresh context.
 * Pre-commit, not pre-push: a pre-push hook cannot change what is being
 * pushed, so regenerating there would always ship a stale artifact.
 * The block is guarded and best-effort; it must never break a commit.
 */

const BLOCK_START = "# >>> ctxfile export (managed block) >>>";
const BLOCK_END = "# <<< ctxfile export <<<";

const HOOK_BLOCK = `${BLOCK_START}
# Regenerates .ctxfile/context.{json,md} (repo-safe profile) and stages them.
# Best-effort by design: a failed export never blocks the commit.
if command -v ctxfile >/dev/null 2>&1; then
  ctxfile export --profile repo-safe --root "$(git rev-parse --show-toplevel)" 2>/dev/null \\
    && git add .ctxfile/context.json .ctxfile/context.md 2>/dev/null \\
    || echo "ctxfile: export skipped (non-fatal)" >&2
fi
${BLOCK_END}`;

export type HookInstallAction = "created" | "updated" | "appended";

export interface HookInstallResult {
  hookPath: string;
  action: HookInstallAction;
}

/** Resolves the hooks directory via git itself, so worktrees and custom
    core.hooksPath layouts are handled correctly. */
export function resolveHooksDir(root: string): string {
  let out: string;
  try {
    out = execFileSync("git", ["-C", root, "rev-parse", "--git-path", "hooks"], {
      encoding: "utf8",
    }).trim();
  } catch {
    throw new Error(`"${root}" is not a git repository (hooks need one)`);
  }
  return path.isAbsolute(out) ? out : path.resolve(root, out);
}

export function installHook(root: string): HookInstallResult {
  const hooksDir = resolveHooksDir(root);
  mkdirSync(hooksDir, { recursive: true });
  const hookPath = path.join(hooksDir, "pre-commit");

  if (!existsSync(hookPath)) {
    writeFileSync(hookPath, `#!/bin/sh\n\n${HOOK_BLOCK}\n`, "utf8");
    chmodSync(hookPath, 0o755);
    return { hookPath, action: "created" };
  }

  const existing = readFileSync(hookPath, "utf8");
  if (existing.includes(BLOCK_START)) {
    const updated = replaceBlock(existing);
    writeFileSync(hookPath, updated, "utf8");
    chmodSync(hookPath, 0o755);
    return { hookPath, action: "updated" };
  }

  writeFileSync(hookPath, `${existing.trimEnd()}\n\n${HOOK_BLOCK}\n`, "utf8");
  chmodSync(hookPath, 0o755);
  return { hookPath, action: "appended" };
}

export interface HookUninstallResult {
  hookPath: string;
  removed: boolean;
}

export function uninstallHook(root: string): HookUninstallResult {
  const hookPath = path.join(resolveHooksDir(root), "pre-commit");
  if (!existsSync(hookPath)) return { hookPath, removed: false };

  const existing = readFileSync(hookPath, "utf8");
  if (!existing.includes(BLOCK_START)) return { hookPath, removed: false };

  const stripped = stripBlock(existing);
  // Nothing left but a shebang and whitespace: remove the file entirely.
  if (/^(#![^\n]*\n?)?\s*$/.test(stripped)) {
    unlinkSync(hookPath);
  } else {
    writeFileSync(hookPath, stripped, "utf8");
  }
  return { hookPath, removed: true };
}

function blockPattern(): RegExp {
  const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\n?\\n?${escape(BLOCK_START)}[\\s\\S]*?${escape(BLOCK_END)}\\n?`);
}

function replaceBlock(content: string): string {
  return content.replace(blockPattern(), (match) => {
    const leading = match.startsWith("\n\n") ? "\n\n" : match.startsWith("\n") ? "\n" : "";
    return `${leading}${HOOK_BLOCK}\n`;
  });
}

function stripBlock(content: string): string {
  return content.replace(blockPattern(), "\n");
}
