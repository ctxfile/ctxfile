import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ignore, { type Ignore } from "ignore";
import { estimateTokens, truncateToTokens } from "../engine/tokens.js";
import type { KeyFile } from "../engine/types.js";
import { isDeniedPath, redactContent } from "../redact.js";
import type { Connector, SnapshotInput } from "./types.js";

const ALWAYS_EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "__pycache__",
  ".venv",
  "venv",
]);

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".tar",
  ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp3", ".mp4", ".mov", ".sqlite",
  ".db", ".wasm", ".exe", ".dll", ".so", ".dylib", ".class", ".jar", ".mcpb",
]);

const MAX_FILE_BYTES = 512 * 1024;
const PLAN_PATTERNS = [/^plan\.md$/i, /^todo\.md$/i, /^docs\/plan.*\.md$/i, /^docs\/superpowers\/plans\/.*\.md$/i];
const MANIFEST_NAMES = new Set([
  "package.json", "tsconfig.json", "pyproject.toml", "cargo.toml", "go.mod",
  "requirements.txt", "gemfile", "pom.xml", "build.gradle", "composer.json",
]);
const ENTRY_PATTERNS = [/^(src\/)?(index|main|app|server|cli)\.[cm]?[jt]sx?$/i, /^(src\/)?main\.(py|go|rs)$/i];

interface Candidate {
  relPath: string;
  mtimeMs: number;
  size: number;
}

function rankScore(relPath: string, recencyRank: number): number {
  const base = path.basename(relPath).toLowerCase();
  if (PLAN_PATTERNS.some((re) => re.test(relPath))) return 0;
  if (/^readme(\..+)?$/i.test(base)) return 1;
  if (MANIFEST_NAMES.has(base)) return 2;
  if (ENTRY_PATTERNS.some((re) => re.test(relPath))) return 3;
  return 4 + recencyRank;
}

function looksBinary(absPath: string, relPath: string): boolean {
  if (BINARY_EXTENSIONS.has(path.extname(relPath).toLowerCase())) return true;
  try {
    const fd = readFileSync(absPath);
    const sample = fd.subarray(0, 8192);
    return sample.includes(0);
  } catch {
    return true;
  }
}

function collectCandidates(root: string, ig: Ignore, includeMatcher: Ignore | null): Candidate[] {
  const results: Candidate[] = [];
  const walk = (dirRel: string): void => {
    const dirAbs = path.join(root, dirRel);
    let entries;
    try {
      entries = readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
      // Never follow symlinks: they could point outside the declared root
      // (a symlink's Dirent already reports isFile()/isDirectory() false, so
      // this is an explicit guarantee, not a behavior change).
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (ALWAYS_EXCLUDED_DIRS.has(entry.name)) continue;
        if (ig.ignores(`${rel}/`)) continue;
        walk(rel);
        continue;
      }
      if (!entry.isFile()) continue;
      if (ig.ignores(rel)) continue;
      // When include patterns are set, a file must match at least one.
      if (includeMatcher && !includeMatcher.ignores(rel)) continue;
      if (isDeniedPath(rel)) continue;
      try {
        const stat = statSync(path.join(root, rel));
        if (stat.size > MAX_FILE_BYTES) continue;
        results.push({ relPath: rel, mtimeMs: stat.mtimeMs, size: stat.size });
      } catch {
        // unreadable file: skip
      }
    }
  };
  walk("");
  return results;
}

function loadIgnore(root: string, extraExcludes: string[]): Ignore {
  const ig = ignore();
  try {
    ig.add(readFileSync(path.join(root, ".gitignore"), "utf8"));
  } catch {
    // no .gitignore is fine
  }
  if (extraExcludes.length > 0) ig.add(extraExcludes);
  return ig;
}

export const fileConnector: Connector = {
  name: "file",

  isEnabled(): boolean {
    return true;
  },

  async snapshot({ config, budget }: SnapshotInput) {
    const ig = loadIgnore(config.root, config.exclude);
    // include is an allowlist: when non-empty, only matching files are kept.
    const includeMatcher = config.include.length > 0 ? ignore().add(config.include) : null;
    const candidates = collectCandidates(config.root, ig, includeMatcher);

    const byRecency = [...candidates].sort((a, b) => b.mtimeMs - a.mtimeMs);
    const recencyRank = new Map(byRecency.map((c, i) => [c.relPath, i]));
    candidates.sort(
      (a, b) => rankScore(a.relPath, recencyRank.get(a.relPath) ?? 0) - rankScore(b.relPath, recencyRank.get(b.relPath) ?? 0)
    );

    const keyFiles: KeyFile[] = [];
    let plan: string | null = null;

    for (const candidate of candidates) {
      const absPath = path.join(config.root, candidate.relPath);
      if (looksBinary(absPath, candidate.relPath)) continue;

      let raw: string;
      try {
        raw = readFileSync(absPath, "utf8");
      } catch {
        continue;
      }

      const redacted = redactContent(raw);
      const capped = truncateToTokens(redacted.text, config.maxFileTokens);
      const tokens = estimateTokens(capped.text);
      if (!budget.take(tokens)) continue;

      keyFiles.push({
        path: candidate.relPath,
        tokens,
        truncated: capped.truncated,
        redactions: redacted.redactions,
        content: capped.text,
      });

      if (plan === null && PLAN_PATTERNS.some((re) => re.test(candidate.relPath))) {
        plan = capped.text;
      }
    }

    return { keyFiles, plan };
  },
};
