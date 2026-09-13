import { describe, expect, it } from "vitest";
import { inlineToText, isSafeHref, looksLikeMarkdown, parseInline, parseMarkdown } from "./markdown";

describe("parseInline", () => {
  it("parses code, strong, emphasis, strikethrough", () => {
    const nodes = parseInline("use `x` and **bold** and *em* and ~~gone~~");
    expect(nodes.map((n) => n.type)).toEqual([
      "text", "code", "text", "strong", "text", "em", "text", "del",
    ]);
  });

  it("keeps safe links and drops unsafe ones to text", () => {
    const safe = parseInline("[docs](https://ctxfile.dev/docs)");
    expect(safe[0]).toMatchObject({ type: "link", href: "https://ctxfile.dev/docs" });
    const unsafe = parseInline("[x](javascript:alert(1))");
    expect(unsafe.map((n) => n.type)).toEqual(["text"]);
    expect(inlineToText(unsafe)).toBe("x");
  });

  it("turns <angle> tokens into placeholders and keeps autolinks", () => {
    const nodes = parseInline("Given <feature>, open <https://example.com>");
    expect(nodes.find((n) => n.type === "placeholder")).toMatchObject({ text: "feature" });
    expect(nodes.find((n) => n.type === "link")).toMatchObject({ href: "https://example.com" });
  });

  it("emits redaction nodes", () => {
    const nodes = parseInline("key=[REDACTED:secret]");
    expect(nodes[1]).toEqual({ type: "redacted", text: "[REDACTED:secret]" });
  });

  it("does not treat snake_case as emphasis", () => {
    const nodes = parseInline("call snake_case_name now");
    expect(nodes).toEqual([{ type: "text", text: "call snake_case_name now" }]);
  });

  it("supports escapes and hard breaks", () => {
    expect(parseInline("a \\* b")).toEqual([{ type: "text", text: "a * b" }]);
    expect(parseInline("line  \nnext").map((n) => n.type)).toEqual(["text", "br", "text"]);
  });
});

describe("parseMarkdown", () => {
  it("parses headings, paragraphs, and rules", () => {
    const blocks = parseMarkdown("# Title\n\nSome text\nmore text\n\n---\n\n### Sub");
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "hr", "heading"]);
    expect(blocks[0]).toMatchObject({ level: 1 });
    expect(blocks[3]).toMatchObject({ level: 3 });
  });

  it("parses fenced code with language and preserves content verbatim", () => {
    const blocks = parseMarkdown("```ts\nconst a = 1;\n  indented\n```\nafter");
    expect(blocks[0]).toEqual({ type: "code", lang: "ts", code: "const a = 1;\n  indented" });
    expect(blocks[1]).toMatchObject({ type: "paragraph" });
  });

  it("parses tilde fences and unterminated fences", () => {
    const blocks = parseMarkdown("~~~\nraw **not bold**");
    expect(blocks[0]).toEqual({ type: "code", lang: "", code: "raw **not bold**" });
  });

  it("parses ordered and unordered lists with tasks and nesting", () => {
    const blocks = parseMarkdown("- one\n- [x] done\n  - nested\n- three\n\n1. a\n2. b");
    const ul = blocks[0];
    expect(ul).toMatchObject({ type: "list", ordered: false });
    if (ul?.type !== "list") throw new Error("expected list");
    expect(ul.items).toHaveLength(3);
    expect(ul.items[1]).toMatchObject({ checked: true });
    expect(ul.items[1]?.sublist).toMatchObject({ type: "list" });
    expect(blocks[1]).toMatchObject({ type: "list", ordered: true, start: 1 });
  });

  it("parses blockquotes recursively", () => {
    const blocks = parseMarkdown("> quoted **text**\n> second");
    expect(blocks[0]).toMatchObject({ type: "quote" });
    if (blocks[0]?.type !== "quote") throw new Error("expected quote");
    expect(blocks[0].children[0]).toMatchObject({ type: "paragraph" });
  });

  it("parses GFM tables", () => {
    const blocks = parseMarkdown("| a | b |\n|---|:--:|\n| 1 | 2 |\n| 3 | 4 |");
    expect(blocks[0]).toMatchObject({ type: "table" });
    if (blocks[0]?.type !== "table") throw new Error("expected table");
    expect(blocks[0].header).toHaveLength(2);
    expect(blocks[0].rows).toHaveLength(2);
    expect(inlineToText(blocks[0].rows[1]?.[1] ?? [])).toBe("4");
  });

  it("treats plain text as one paragraph per blank-line-separated chunk", () => {
    const blocks = parseMarkdown("just words\nnext line\n\nsecond");
    expect(blocks).toHaveLength(2);
  });
});

describe("helpers", () => {
  it("isSafeHref", () => {
    expect(isSafeHref("https://x.y")).toBe(true);
    expect(isSafeHref("mailto:a@b.c")).toBe(true);
    expect(isSafeHref("javascript:void(0)")).toBe(false);
    expect(isSafeHref("data:text/html,hi")).toBe(false);
  });

  it("looksLikeMarkdown", () => {
    expect(looksLikeMarkdown("# Plan\n- item")).toBe(true);
    expect(looksLikeMarkdown("call `fn` then **stop**")).toBe(true);
    expect(looksLikeMarkdown("plain sentence with nothing.")).toBe(false);
  });
});
