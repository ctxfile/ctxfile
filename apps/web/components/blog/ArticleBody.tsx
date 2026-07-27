import Link from "next/link";
import { Fragment, type ReactNode } from "react";

/**
 * Markdown renderer for long-form posts.
 *
 * Deliberately a small hand-rolled subset rather than a markdown dependency:
 * the posts are authored in this repo by us, so the input is trusted and
 * finite, and the output has to land inside the existing `.prose` styles that
 * the docs already use. Supported: `##`/`###` headings, paragraphs, `-` lists,
 * `1.` ordered lists, fenced code blocks, `**bold**`, `` `code` `` and
 * `[label](href)`.
 *
 * Fenced code blocks matter more here than they do on a marketing page — every
 * post ends in a command the reader is meant to run — and they render as the
 * same `<pre>` the docs use, so `CopyBlocks` gives them a copy button for free.
 */

type InlineNode =
  | { kind: "text"; value: string }
  // Holds nodes rather than a string so `**bold with `code` inside**` renders
  // as bold-plus-code instead of printing the backticks literally.
  | { kind: "strong"; nodes: InlineNode[] }
  | { kind: "code"; value: string }
  | { kind: "link"; label: string; href: string };

type Block =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "paragraph"; nodes: InlineNode[] }
  | { kind: "list"; ordered: boolean; items: InlineNode[][] }
  | { kind: "code"; code: string };

const INLINE_PATTERN = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
const UNORDERED_ITEM = /^[-*]\s+(.*)$/;
const ORDERED_ITEM = /^\d+\.\s+(.*)$/;

/** Returns the fence marker a line opens with, or null if it opens none. */
function isFence(line: string): "```" | "~~~" | null {
  if (line.startsWith("```")) return "```";
  if (line.startsWith("~~~")) return "~~~";
  return null;
}

function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index;
    if (index === undefined) continue;
    if (index > cursor) nodes.push({ kind: "text", value: text.slice(cursor, index) });

    const [full, strong, code, linkLabel, linkHref] = match;
    // Recursing terminates because the inner text is strictly shorter and has
    // its delimiters stripped.
    if (strong !== undefined) nodes.push({ kind: "strong", nodes: parseInline(strong) });
    else if (code !== undefined) nodes.push({ kind: "code", value: code });
    else if (linkLabel !== undefined && linkHref !== undefined) {
      nodes.push({ kind: "link", label: linkLabel, href: linkHref });
    }

    cursor = index + full.length;
  }

  if (cursor < text.length) nodes.push({ kind: "text", value: text.slice(cursor) });
  return nodes;
}

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split("\n");

  let paragraph: string[] = [];
  let items: InlineNode[][] = [];
  let ordered = false;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", nodes: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = (): void => {
    if (items.length === 0) return;
    blocks.push({ kind: "list", ordered, items });
    items = [];
  };
  const flushAll = (): void => {
    flushParagraph();
    flushList();
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? "").trimEnd();
    const trimmed = line.trim();

    // Fenced code: consume verbatim to the closing fence so indentation and
    // blank lines inside the block survive. Both CommonMark fences are
    // accepted, and posts use `~~~` because the bodies live in TypeScript
    // template literals where every backtick would otherwise need escaping.
    const fence = isFence(trimmed);
    if (fence) {
      flushAll();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith(fence)) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      blocks.push({ kind: "code", code: body.join("\n") });
      continue;
    }

    if (trimmed === "") {
      flushAll();
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushAll();
      blocks.push({ kind: "heading", level: 3, text: trimmed.slice(4).trim() });
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushAll();
      blocks.push({ kind: "heading", level: 2, text: trimmed.slice(3).trim() });
      continue;
    }

    const unordered = UNORDERED_ITEM.exec(trimmed);
    const numbered = ORDERED_ITEM.exec(trimmed);
    if (unordered?.[1] !== undefined || numbered?.[1] !== undefined) {
      flushParagraph();
      const nextOrdered = numbered?.[1] !== undefined;
      // A switch between list styles starts a new list rather than mixing.
      if (items.length > 0 && nextOrdered !== ordered) flushList();
      ordered = nextOrdered;
      items.push(parseInline((numbered?.[1] ?? unordered?.[1]) as string));
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushAll();
  return blocks;
}

/** Stable slug for heading anchors, so posts are deep-linkable. */
function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function renderInline(nodes: InlineNode[]): ReactNode {
  return nodes.map((node, i) => {
    switch (node.kind) {
      case "strong":
        return <strong key={i}>{renderInline(node.nodes)}</strong>;
      case "code":
        return <code key={i}>{node.value}</code>;
      case "link":
        return node.href.startsWith("/") ? (
          <Link key={i} href={node.href}>
            {node.label}
          </Link>
        ) : (
          <a key={i} href={node.href} rel="noopener">
            {node.label}
          </a>
        );
      default:
        return <Fragment key={i}>{node.value}</Fragment>;
    }
  });
}

export function ArticleBody({ markdown }: { markdown: string }) {
  return (
    <>
      {parseBlocks(markdown).map((block, i) => {
        switch (block.kind) {
          case "heading": {
            const id = slugifyHeading(block.text);
            return block.level === 2 ? (
              <h2 key={i} id={id}>
                {block.text}
              </h2>
            ) : (
              <h3 key={i} id={id}>
                {block.text}
              </h3>
            );
          }
          case "code":
            return (
              <pre key={i}>
                <code>{block.code}</code>
              </pre>
            );
          case "list":
            return block.ordered ? (
              <ol key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ol>
            ) : (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          default:
            return <p key={i}>{renderInline(block.nodes)}</p>;
        }
      })}
    </>
  );
}
