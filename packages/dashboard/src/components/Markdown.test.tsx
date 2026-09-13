import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown, MarkdownInline } from "./Markdown";

describe("Markdown", () => {
  it("renders headings with ids, lists, quotes and inline styles", () => {
    render(<Markdown source={"## Plan Ahead\n\n- one **bold**\n- [x] done\n\n> note"} />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveAttribute("id", "plan-ahead");
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByText("note").closest("blockquote")).not.toBeNull();
  });

  it("renders fenced code through the syntax highlighter", () => {
    render(<Markdown source={"```json\n{ \"a\": 1 }\n```"} />);
    expect(screen.getByText('"a"')).toHaveClass("tk-key");
  });

  it("never emits raw HTML and drops unsafe links", () => {
    render(<Markdown source={'<script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=alert(1)>'} />);
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("a")).toBeNull();
  });

  it("opens safe links in a new tab with noopener", () => {
    render(<Markdown source="[docs](https://ctxfile.dev)" />);
    const link = screen.getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders placeholders and redaction markers as chips", () => {
    render(<Markdown source="Given <feature> and key=[REDACTED:secret]" />);
    expect(screen.getByText("feature")).toHaveClass("md-placeholder");
    expect(screen.getByText("[REDACTED:secret]")).toHaveClass("md-redacted");
  });

  it("renders tables", () => {
    render(<Markdown source={"| a | b |\n|---|---|\n| 1 | 2 |"} />);
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(screen.getAllByRole("cell")).toHaveLength(2);
  });

  it("MarkdownInline renders only the first paragraph's inline content", () => {
    render(<MarkdownInline source="use `x` now" />);
    expect(screen.getByText("x")).toHaveClass("md-code");
  });
});
