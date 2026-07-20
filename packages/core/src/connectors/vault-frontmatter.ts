/** Minimal YAML-subset frontmatter reader for vault notes. Deliberately NOT a
    YAML parser: recognized keys are extracted line-wise so one malformed line
    never drops the rest (best-effort connector law); anything else degrades to
    "no value". Strictly typed; no dependency. */

export interface NoteFrontmatter {
  title: string | null;
  tags: string[];
  pinned: boolean;
}

const KEY_LINE = /^([A-Za-z0-9_-]+):\s*(.*)$/;

const STOPWORDS = new Set(["the", "and", "for", "with", "from", "into", "that", "this", "our", "new"]);

export function tokenizeTitle(title: string): string[] {
  return [
    ...new Set(
      title
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    ),
  ];
}

function unquote(value: string): string {
  const m = /^(['"])(.*)\1$/.exec(value);
  return m ? m[2]! : value;
}

function normalizeTag(raw: string): string {
  return unquote(raw.trim()).replace(/^#/, "").toLowerCase();
}

function parseInlineTags(value: string): string[] {
  const unquotedValue = unquote(value);
  const inner = unquotedValue.startsWith("[") && unquotedValue.endsWith("]") ? unquotedValue.slice(1, -1) : unquotedValue;
  return inner
    .split(",")
    .map((t) => normalizeTag(t))
    .filter((t) => t.length > 0);
}

export function parseFrontmatterHead(head: string): NoteFrontmatter {
  const none: NoteFrontmatter = { title: null, tags: [], pinned: false };
  if (!head.startsWith("---")) return none;
  const lines = head.replace(/\r\n?/g, "\n").split("\n");
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    const t = lines[i]!.trim();
    if (t === "---" || t === "...") {
      end = i;
      break;
    }
  }
  // Frontmatter longer than the head window (or unterminated): degrade to none.
  if (end === -1) return none;

  const result: NoteFrontmatter = { title: null, tags: [], pinned: false };
  for (let i = 1; i < end; i += 1) {
    const m = KEY_LINE.exec(lines[i]!);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === "title" && value.length > 0) {
      result.title = unquote(value);
    } else if (key === "tags" || key === "tag") {
      if (value.length > 0) {
        result.tags.push(...parseInlineTags(value));
      } else {
        let j = i + 1;
        for (; j < end; j += 1) {
          const dm = /^\s*-\s+(.+)$/.exec(lines[j]!);
          if (!dm) break;
          const tag = normalizeTag(dm[1]!);
          if (tag.length > 0) result.tags.push(tag);
        }
        // Explicitly skip consumed dash-list lines on the next iteration
        i = j - 1;
      }
    } else if (key === "ctxfile" && value.toLowerCase() === "pin") {
      result.pinned = true;
    }
  }
  result.tags = [...new Set(result.tags)];
  return result;
}
