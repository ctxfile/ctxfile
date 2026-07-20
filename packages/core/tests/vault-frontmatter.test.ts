import { describe, expect, it } from "vitest";
import { parseFrontmatterHead, tokenizeTitle } from "../src/connectors/vault-frontmatter.js";

describe("parseFrontmatterHead", () => {
  it("returns empty defaults without frontmatter", () => {
    expect(parseFrontmatterHead("# Just a note\nbody")).toEqual({ title: null, tags: [], pinned: false });
  });

  it("parses title, inline tags, and pin", () => {
    const head = '---\ntitle: "Q3 Launch"\ntags: [Launch, marketing]\nctxfile: pin\n---\nbody';
    expect(parseFrontmatterHead(head)).toEqual({ title: "Q3 Launch", tags: ["launch", "marketing"], pinned: true });
  });

  it("parses dash-list tags and the singular tag key", () => {
    expect(parseFrontmatterHead("---\ntags:\n  - alpha\n  - '#beta'\n---\n").tags).toEqual(["alpha", "beta"]);
    expect(parseFrontmatterHead("---\ntag: gamma, delta\n---\n").tags).toEqual(["gamma", "delta"]);
  });

  it("degrades per-key: a malformed line does not drop a later ctxfile: pin", () => {
    const head = "---\n:::not yaml at all\nctxfile: pin\n---\n";
    expect(parseFrontmatterHead(head).pinned).toBe(true);
  });

  it("treats an unclosed fence within the head as no frontmatter", () => {
    expect(parseFrontmatterHead("---\ntitle: x\nno closing fence")).toEqual({ title: null, tags: [], pinned: false });
  });

  it("ignores nested/unknown ctxfile values", () => {
    expect(parseFrontmatterHead("---\nctxfile: something-else\n---\n").pinned).toBe(false);
  });

  it("normalizes CRLF line endings in frontmatter", () => {
    const head = "---\r\ntitle: Q3 Launch\r\ntags: [Launch, marketing]\r\nctxfile: pin\r\n---\r\nbody";
    expect(parseFrontmatterHead(head)).toEqual({ title: "Q3 Launch", tags: ["launch", "marketing"], pinned: true });
  });

  it("unquotes wholly-quoted comma-separated tags", () => {
    expect(parseFrontmatterHead('---\ntags: "a, b"\n---\n').tags).toEqual(["a", "b"]);
  });

  it("treats ctxfile: PIN (uppercase) as pinned", () => {
    expect(parseFrontmatterHead("---\nctxfile: PIN\n---\n").pinned).toBe(true);
  });
});

describe("tokenizeTitle", () => {
  it("case-folds, drops short tokens and stopwords", () => {
    expect(tokenizeTitle("The Q3 Campaign for EU-Launch")).toEqual(["campaign", "launch"]);
  });
});
