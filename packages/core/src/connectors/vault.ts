import { closeSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import path from "node:path";
import ignore, { type Ignore } from "ignore";
import type { ResolvedConfig, VaultSpec } from "../config.js";
import { estimateTokens, truncateToTokens } from "../engine/tokens.js";
import type { VaultNote } from "../engine/types.js";
import { isDeniedPath, redactContent } from "../redact.js";
import type { Connector, SnapshotHints, SnapshotInput } from "./types.js";
import { parseFrontmatterHead, tokenizeTitle, type NoteFrontmatter } from "./vault-frontmatter.js";
import { extractWikilinks, WikilinkResolver } from "./wikilinks.js";

const MAX_FILE_BYTES = 512 * 1024;
const HEAD_BYTES = 4096;
const SELECTION_POOL_CAP = 300;
const STUBS_PER_NOTE = 10;
const STUBS_PER_VAULT = 50;
const STUB_FIRSTLINE_TOKENS = 200;
const MD_FILE = /\.(md|markdown)$/i;
// Skipped case-insensitively at ANY depth (Obsidian users capitalize freely).
const SKIPPED_DIRS = new Set([".obsidian", "templates"]);

interface Candidate {
  relPath: string;
  mtimeMs: number;
  front: NoteFrontmatter;
  relevance: number;
  boosted: boolean;
}

function collectCandidateFiles(vault: VaultSpec): { relPath: string; mtimeMs: number }[] {
  const includeMatcher: Ignore | null = vault.include.length > 0 ? ignore().add(vault.include) : null;
  const excludeMatcher: Ignore | null = vault.exclude.length > 0 ? ignore().add(vault.exclude) : null;
  const results: { relPath: string; mtimeMs: number }[] = [];
  const walk = (dirRel: string): void => {
    let entries;
    try {
      entries = readdirSync(path.join(vault.path, dirRel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
      // Never follow symlinks: they could point outside the configured vault.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (SKIPPED_DIRS.has(entry.name.toLowerCase())) continue;
        if (excludeMatcher?.ignores(`${rel}/`)) continue;
        walk(rel);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!MD_FILE.test(entry.name)) continue;
      if (excludeMatcher?.ignores(rel)) continue;
      if (includeMatcher && !includeMatcher.ignores(rel)) continue;
      if (isDeniedPath(rel)) continue;
      try {
        const stat = statSync(path.join(vault.path, rel));
        if (stat.size > MAX_FILE_BYTES) continue;
        results.push({ relPath: rel, mtimeMs: stat.mtimeMs });
      } catch {
        // unreadable: skip
      }
    }
  };
  walk("");
  return results;
}

function readHead(absPath: string): string {
  const fd = openSync(absPath, "r");
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const bytes = readSync(fd, buf, 0, HEAD_BYTES, 0);
    return buf.subarray(0, bytes).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function hintTokenSet(hints: SnapshotHints | undefined): Set<string> {
  const set = new Set<string>();
  for (const tag of hints?.threadTags ?? []) set.add(tag.toLowerCase());
  for (const token of hints?.threadTitleTokens ?? []) set.add(token.toLowerCase());
  return set;
}

function titleOf(front: NoteFrontmatter, relPath: string): string {
  return front.title ?? path.basename(relPath).replace(MD_FILE, "");
}

function relevanceOf(front: NoteFrontmatter, relPath: string, hintTokens: Set<string>): number {
  if (hintTokens.size === 0) return 0;
  const noteTokens = new Set<string>([...front.tags, ...tokenizeTitle(titleOf(front, relPath))]);
  let score = 0;
  for (const token of noteTokens) if (hintTokens.has(token)) score += 1;
  return score;
}

/** Lower sorts first. Tier 0 pins, 1 relevant, 1.5 wikilink-boosted, 2 rest;
    relevance then recency break ties (spec §4.4). */
function sortQueue(queue: Candidate[]): void {
  const tierOf = (c: Candidate): number => {
    if (c.front.pinned) return 0;
    if (c.relevance > 0) return 1;
    return c.boosted ? 1.5 : 2;
  };
  queue.sort((a, b) => {
    const tier = tierOf(a) - tierOf(b);
    if (tier !== 0) return tier;
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    return b.mtimeMs - a.mtimeMs;
  });
}

/** Body after the closing frontmatter fence (whole file when no frontmatter). */
function stripFrontmatter(raw: string): string {
  if (!raw.startsWith("---")) return raw;
  const close = /\n(?:---|\.\.\.)\s*(?:\n|$)/.exec(raw.slice(3));
  if (!close) return raw;
  return raw.slice(3 + close.index + close[0].length);
}

/** First non-empty body line of a note, for link stubs: head-read only,
    frontmatter skipped, redacted, hard-capped (spec §4.5). */
function stubFirstLine(absPath: string): string | null {
  let head: string;
  try {
    head = readHead(absPath);
  } catch {
    return null;
  }
  const body = stripFrontmatter(head);
  const line = body.split("\n").find((l) => l.trim().length > 0);
  if (line === undefined) return null;
  const redacted = redactContent(line.trim()).text;
  return truncateToTokens(redacted, STUB_FIRSTLINE_TOKENS).text;
}

interface SelectedNote {
  note: VaultNote;
  bodyForLinks: string;
}

function selectNotes(vault: VaultSpec, input: SnapshotInput): { selected: SelectedNote[]; allRelPaths: string[] } {
  const files = collectCandidateFiles(vault);
  const hintTokens = hintTokenSet(input.hints);
  const candidates: Candidate[] = [];
  for (const file of files) {
    let front: NoteFrontmatter;
    try {
      front = parseFrontmatterHead(readHead(path.join(vault.path, file.relPath)));
    } catch {
      front = { title: null, tags: [], pinned: false };
    }
    candidates.push({
      relPath: file.relPath,
      mtimeMs: file.mtimeMs,
      front,
      relevance: relevanceOf(front, file.relPath, hintTokens),
      boosted: false,
    });
  }
  sortQueue(candidates);
  const queue = candidates.slice(0, SELECTION_POOL_CAP);

  const selected: SelectedNote[] = [];
  while (queue.length > 0) {
    const candidate = queue.shift()!;
    let raw: string;
    try {
      raw = readFileSync(path.join(vault.path, candidate.relPath), "utf8");
    } catch {
      continue;
    }
    const body = stripFrontmatter(raw);
    const redacted = redactContent(body);
    const capped = truncateToTokens(redacted.text, input.config.maxFileTokens);
    const tokens = estimateTokens(capped.text);
    if (!input.budget.take(tokens)) continue;

    const title = redactContent(titleOf(candidate.front, candidate.relPath)).text;
    const tags = candidate.front.tags.map((t) => redactContent(t).text);
    selected.push({
      note: {
        source: "obsidian",
        vault: vault.name,
        path: candidate.relPath,
        title,
        tags,
        modifiedAt: new Date(candidate.mtimeMs).toISOString(),
        pinned: candidate.front.pinned,
        tokens,
        truncated: capped.truncated,
        redactions: redacted.redactions,
        content: capped.text,
        links: [],
      },
      bodyForLinks: body,
    });

    // Wikilink-proximity boost (spec §4.4): tier-2 pool candidates linked from
    // the note just selected move ahead of the rest of tier 2.
    const resolver = new WikilinkResolver(queue.map((c) => c.relPath));
    let promoted = false;
    for (const target of extractWikilinks(body)) {
      const rel = resolver.resolve(target);
      if (rel === null) continue;
      const linked = queue.find((c) => c.relPath === rel);
      if (linked && !linked.boosted) {
        linked.boosted = true;
        promoted = true;
      }
    }
    if (promoted) sortQueue(queue);
  }
  return { selected, allRelPaths: candidates.map((c) => c.relPath) };
}

function createVaultConnector(vault: VaultSpec): Connector {
  return {
    name: `vault:${vault.name}`,

    isEnabled(): boolean {
      return true;
    },

    async snapshot(input: SnapshotInput) {
      const stat = statSync(vault.path); // throws → connector status "error"
      if (!stat.isDirectory()) throw new Error(`vault path is not a directory: ${vault.path}`);
      const { selected, allRelPaths } = selectNotes(vault, input);
      // Stubs resolve against the POST-FILTER candidate set and are attached
      // after selection completes, so already-selected notes are never
      // duplicated as stubs (spec §4.5).
      const resolver = new WikilinkResolver(allRelPaths);
      const selectedPaths = new Set(selected.map((s) => s.note.path));
      let stubsRemaining = STUBS_PER_VAULT;
      for (const entry of selected) {
        if (stubsRemaining <= 0) break;
        const seenRels = new Set<string>();
        for (const target of extractWikilinks(entry.bodyForLinks)) {
          if (entry.note.links.length >= STUBS_PER_NOTE || stubsRemaining <= 0) break;
          const rel = resolver.resolve(target);
          if (rel === null || selectedPaths.has(rel)) continue;
          if (seenRels.has(rel)) continue;
          const firstLine = stubFirstLine(path.join(vault.path, rel));
          if (firstLine === null) continue;
          const title = redactContent(path.basename(rel).replace(MD_FILE, "")).text;
          const tokens = estimateTokens(title) + estimateTokens(firstLine);
          if (!input.budget.take(tokens)) {
            stubsRemaining = 0;
            break;
          }
          entry.note.links.push({ title, firstLine });
          seenRels.add(rel);
          stubsRemaining -= 1;
        }
      }
      return { notes: selected.map((s) => s.note) };
    },
  };
}

export function createVaultConnectors(config: ResolvedConfig): Connector[] {
  return config.vaults.map((vault) => createVaultConnector(vault));
}
