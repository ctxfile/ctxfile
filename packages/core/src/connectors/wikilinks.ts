/** Obsidian wikilink grammar, v1 subset (spec §4.5): [[note]], [[note|alias]],
    [[note#heading]], [[note^block]], ![[embed]], [[folder/note]]. Resolution
    happens against the POST-FILTER candidate set only — an excluded or denied
    note can never become a stub. */

const WIKILINK = /!?\[\[([^\[\]]+)\]\]/g;

export function extractWikilinks(content: string): string[] {
  const targets: string[] = [];
  for (const match of content.matchAll(WIKILINK)) {
    let target = match[1]!;
    const pipe = target.indexOf("|");
    if (pipe !== -1) target = target.slice(0, pipe);
    const anchor = target.search(/[#^]/);
    if (anchor !== -1) target = target.slice(0, anchor);
    target = target.trim();
    if (target.length > 0 && !targets.includes(target)) targets.push(target);
  }
  return targets;
}

const MD_EXT = /\.(md|markdown)$/i;

export class WikilinkResolver {
  private readonly byPath = new Map<string, string>();
  private readonly byBasename = new Map<string, string[]>();

  constructor(relPaths: string[]) {
    for (const rel of relPaths) {
      const key = rel.replace(MD_EXT, "").toLowerCase();
      this.byPath.set(key, rel);
      const base = key.split("/").pop()!;
      const bucket = this.byBasename.get(base);
      if (bucket) bucket.push(rel);
      else this.byBasename.set(base, [rel]);
    }
  }

  resolve(target: string): string | null {
    const clean = target.replace(MD_EXT, "").toLowerCase();
    if (clean.includes("/")) return this.byPath.get(clean) ?? null;
    const matches = this.byBasename.get(clean) ?? [];
    return matches.length === 1 ? matches[0]! : null;
  }
}
