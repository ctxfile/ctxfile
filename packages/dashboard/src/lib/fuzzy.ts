/**
 * Tiny subsequence fuzzy matcher for the command palette and filters.
 * Scores contiguous runs and word-start hits higher; returns matched indices so
 * the UI can highlight them. No allocations beyond the result.
 */

export interface FuzzyResult {
  score: number;
  indices: number[];
}

export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  const q = query.trim().toLowerCase();
  if (q === "") return { score: 0, indices: [] };
  const t = target.toLowerCase();
  const indices: number[] = [];
  let score = 0;
  let ti = 0;
  let lastMatch = -2;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi] ?? "";
    if (ch === " ") continue;
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    indices.push(found);
    // contiguous bonus
    if (found === lastMatch + 1) score += 8;
    // word-start bonus
    const prev = t[found - 1];
    if (found === 0 || prev === " " || prev === "-" || prev === "_" || prev === "/" || prev === ".") score += 6;
    // penalise distance
    score -= Math.min(5, found - ti);
    lastMatch = found;
    ti = found + 1;
  }
  // shorter targets rank higher for equal hits
  score += Math.max(0, 20 - t.length / 4);
  return { score, indices };
}

/** Rank `items` by fuzzy score against `query`, dropping non-matches. */
export function fuzzyRank<T>(query: string, items: readonly T[], key: (item: T) => string): T[] {
  if (query.trim() === "") return [...items];
  return items
    .map((item) => ({ item, match: fuzzyMatch(query, key(item)) }))
    .filter((e): e is { item: T; match: FuzzyResult } => e.match !== null)
    .sort((a, b) => b.match.score - a.match.score)
    .map((e) => e.item);
}
