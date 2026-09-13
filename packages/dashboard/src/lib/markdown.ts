/**
 * Small, safe Markdown parser producing a block AST.
 *
 * Input is untrusted text captured from files, sessions, and model output, so
 * nothing here ever emits raw HTML: the renderer maps nodes to React elements
 * and links are restricted to http(s)/mailto. Supported: ATX headings,
 * paragraphs, fenced code (``` or ~~~), blockquotes, ordered/unordered lists
 * (one nesting level), horizontal rules, GFM tables, and inline code, strong,
 * emphasis, strikethrough, links, and `<placeholder>` tokens.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "del"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "placeholder"; text: string }
  | { type: "redacted"; text: string }
  | { type: "br" };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "code"; lang: string; code: string }
  | { type: "quote"; children: Block[] }
  | { type: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { type: "hr" }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] };

export interface ListItem {
  children: Inline[];
  /** Task-list state when the item starts with `[ ]` or `[x]`. */
  checked?: boolean;
  sublist?: Block;
}

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

export function isSafeHref(href: string): boolean {
  return SAFE_HREF.test(href.trim());
}

/* ------------------------------------------------------------------ inline */

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = (): void => {
    if (buf !== "") {
      out.push({ type: "text", text: buf });
      buf = "";
    }
  };

  let i = 0;
  while (i < src.length) {
    const ch = src[i] ?? "";
    const rest = src.slice(i);

    // hard break: two trailing spaces before newline, or backslash-newline
    if (rest.startsWith("  \n") || rest.startsWith("\\\n")) {
      flush();
      out.push({ type: "br" });
      i += rest.startsWith("  \n") ? 3 : 2;
      continue;
    }

    // redaction marker
    const red = /^\[REDACTED(?::[A-Za-z0-9_-]+)?\]/.exec(rest);
    if (red) {
      flush();
      out.push({ type: "redacted", text: red[0] });
      i += red[0].length;
      continue;
    }

    // inline code (any run of backticks)
    if (ch === "`") {
      const fence = /^`+/.exec(rest)?.[0] ?? "`";
      const close = rest.indexOf(fence, fence.length);
      if (close !== -1) {
        flush();
        out.push({ type: "code", text: rest.slice(fence.length, close).trim() });
        i += close + fence.length;
        continue;
      }
    }

    // escaped char
    if (ch === "\\" && i + 1 < src.length) {
      buf += src[i + 1] ?? "";
      i += 2;
      continue;
    }

    // link [text](href)
    if (ch === "[") {
      const m = /^\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/.exec(rest);
      if (m && m[1] !== undefined && m[2] !== undefined) {
        flush();
        const children = parseInline(m[1]);
        if (isSafeHref(m[2])) out.push({ type: "link", href: m[2], children });
        else out.push(...children);
        i += m[0].length;
        continue;
      }
    }

    // autolink <https://…>
    if (ch === "<") {
      const auto = /^<(https?:\/\/[^>\s]+)>/.exec(rest);
      if (auto && auto[1] !== undefined) {
        flush();
        out.push({ type: "link", href: auto[1], children: [{ type: "text", text: auto[1] }] });
        i += auto[0].length;
        continue;
      }
      // <placeholder> token: a short identifier-ish word in angle brackets
      const ph = /^<([A-Za-z][A-Za-z0-9 _:/.-]{0,40})>/.exec(rest);
      if (ph && ph[1] !== undefined) {
        flush();
        out.push({ type: "placeholder", text: ph[1] });
        i += ph[0].length;
        continue;
      }
    }

    // strong ** or __
    if (rest.startsWith("**") || rest.startsWith("__")) {
      const mark = rest.slice(0, 2);
      const close = rest.indexOf(mark, 2);
      if (close > 2) {
        flush();
        out.push({ type: "strong", children: parseInline(rest.slice(2, close)) });
        i += close + 2;
        continue;
      }
    }

    // strikethrough ~~
    if (rest.startsWith("~~")) {
      const close = rest.indexOf("~~", 2);
      if (close > 2) {
        flush();
        out.push({ type: "del", children: parseInline(rest.slice(2, close)) });
        i += close + 2;
        continue;
      }
    }

    // emphasis * or _ (not inside words for _)
    if ((ch === "*" || ch === "_") && rest[1] !== ch) {
      const prev = src[i - 1] ?? " ";
      const wordBound = ch === "*" || /[\s(]/.test(prev);
      if (wordBound) {
        const close = rest.indexOf(ch, 1);
        if (close > 1 && !/\s/.test(rest[1] ?? " ") && !/\s/.test(rest[close - 1] ?? " ")) {
          flush();
          out.push({ type: "em", children: parseInline(rest.slice(1, close)) });
          i += close + 1;
          continue;
        }
      }
    }

    buf += ch;
    i += 1;
  }
  flush();
  return mergeText(out);
}

/** Collapse adjacent text nodes so renderers get the fewest spans possible. */
function mergeText(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    const last = out[out.length - 1];
    if (node.type === "text" && last !== undefined && last.type === "text") {
      last.text += node.text;
    } else {
      out.push(node);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ blocks */

const FENCE_RE = /^(\s{0,3})(`{3,}|~{3,})\s*([^\s`]*)\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const HR_RE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const UL_RE = /^(\s*)[-*+]\s+(.*)$/;
const OL_RE = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const TASK_RE = /^\[( |x|X)\]\s+(.*)$/;

function splitTableRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  const cells: string[] = [];
  let buf = "";
  for (let i = 0; i < row.length; i++) {
    const ch = row[i] ?? "";
    if (ch === "\\" && row[i + 1] === "|") {
      buf += "|";
      i += 1;
    } else if (ch === "|") {
      cells.push(buf.trim());
      buf = "";
    } else buf += ch;
  }
  cells.push(buf.trim());
  return cells;
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const paragraph: string[] = [];
  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    const text = paragraph.join("\n").trim();
    if (text !== "") blocks.push({ type: "paragraph", children: parseInline(text) });
    paragraph.length = 0;
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // fenced code
    const fence = FENCE_RE.exec(line);
    if (fence) {
      flushParagraph();
      const marker = fence[2] ?? "```";
      const lang = fence[3] ?? "";
      const body: string[] = [];
      i += 1;
      while (i < lines.length) {
        const l = lines[i] ?? "";
        if (l.trim().startsWith(marker[0] ?? "`") && new RegExp(`^\\s{0,3}${marker[0]}{${marker.length},}\\s*$`).test(l)) {
          break;
        }
        body.push(l);
        i += 1;
      }
      i += 1; // closing fence (or EOF)
      blocks.push({ type: "code", lang, code: body.join("\n") });
      continue;
    }

    // blank line
    if (line.trim() === "") {
      flushParagraph();
      i += 1;
      continue;
    }

    // heading
    const heading = HEADING_RE.exec(line);
    if (heading && heading[1] !== undefined && heading[2] !== undefined) {
      flushParagraph();
      const level = Math.min(6, Math.max(1, heading[1].length)) as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({ type: "heading", level, children: parseInline(heading[2]) });
      i += 1;
      continue;
    }

    // hr
    if (HR_RE.test(line)) {
      flushParagraph();
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    // blockquote
    if (QUOTE_RE.test(line)) {
      flushParagraph();
      const inner: string[] = [];
      while (i < lines.length) {
        const m = QUOTE_RE.exec(lines[i] ?? "");
        if (!m) break;
        inner.push(m[1] ?? "");
        i += 1;
      }
      blocks.push({ type: "quote", children: parseMarkdown(inner.join("\n")) });
      continue;
    }

    // table: header row followed by separator
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1] ?? "")) {
      flushParagraph();
      const header = splitTableRow(line).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && (lines[i] ?? "").includes("|") && (lines[i] ?? "").trim() !== "") {
        rows.push(splitTableRow(lines[i] ?? "").map(parseInline));
        i += 1;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    // lists
    const ul = UL_RE.exec(line);
    const ol = OL_RE.exec(line);
    if (ul || ol) {
      flushParagraph();
      const ordered = ol !== null;
      const baseIndent = ((ordered ? ol?.[1] : ul?.[1]) ?? "").length;
      const start = ordered ? Number(ol?.[2] ?? "1") : 1;
      const items: ListItem[] = [];
      while (i < lines.length) {
        const l = lines[i] ?? "";
        const m = ordered ? OL_RE.exec(l) : UL_RE.exec(l);
        const indent = (m?.[1] ?? "").length;
        if (!m || indent !== baseIndent) {
          // nested list or continuation
          if (l.trim() === "") {
            // blank line inside a list only ends it if the next line is not a list item
            const next = lines[i + 1] ?? "";
            if (UL_RE.test(next) || OL_RE.test(next)) {
              i += 1;
              continue;
            }
            break;
          }
          const nestedUl = UL_RE.exec(l);
          const nestedOl = OL_RE.exec(l);
          const nestedIndent = ((nestedUl ?? nestedOl)?.[1] ?? "").length;
          const lastItem = items[items.length - 1];
          if ((nestedUl || nestedOl) && nestedIndent > baseIndent && lastItem !== undefined) {
            const sub: string[] = [];
            while (i < lines.length) {
              const sl = lines[i] ?? "";
              const sm = UL_RE.exec(sl) ?? OL_RE.exec(sl);
              const sIndent = (sm?.[1] ?? "").length;
              if (sm && sIndent > baseIndent) {
                sub.push(sl.slice(nestedIndent));
                i += 1;
              } else if (sl.trim() !== "" && !sm && /^\s+/.test(sl) && sl.search(/\S/) > baseIndent) {
                sub.push(sl.slice(Math.min(nestedIndent, sl.search(/\S/))));
                i += 1;
              } else break;
            }
            const parsed = parseMarkdown(sub.join("\n"));
            const first = parsed[0];
            if (first !== undefined && first.type === "list") lastItem.sublist = first;
            continue;
          }
          // lazy continuation of the previous item
          if (lastItem !== undefined && /^\s+\S/.test(l)) {
            lastItem.children.push({ type: "text", text: " " }, ...parseInline(l.trim()));
            i += 1;
            continue;
          }
          break;
        }
        const body = (ordered ? m[3] : m[2]) ?? "";
        const task = TASK_RE.exec(body);
        if (task && task[2] !== undefined) {
          items.push({ children: parseInline(task[2]), checked: (task[1] ?? " ").toLowerCase() === "x" });
        } else {
          items.push({ children: parseInline(body) });
        }
        i += 1;
      }
      blocks.push({ type: "list", ordered, start, items });
      continue;
    }

    paragraph.push(line);
    i += 1;
  }
  flushParagraph();
  return blocks;
}

/** Plain-text projection of inline nodes (for headings' ids and search). */
export function inlineToText(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text":
        case "code":
        case "redacted":
          return n.text;
        case "placeholder":
          return `<${n.text}>`;
        case "br":
          return " ";
        default:
          return inlineToText(n.children);
      }
    })
    .join("");
}

/** Heuristic: does this text look like Markdown rather than plain prose/code? */
export function looksLikeMarkdown(text: string): boolean {
  return /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|~~~|\|.*\|)/m.test(text) || /\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(/.test(text);
}
