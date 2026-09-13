import { useMemo, type ReactNode } from "react";
import { inlineToText, parseMarkdown, type Block, type Inline } from "../lib/markdown";
import { CodeBlock } from "./CodeBlock";

export interface MarkdownProps {
  source: string;
  /** Compact spacing for cards and list rows. */
  compact?: boolean;
  className?: string;
}

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "text":
        return node.text;
      case "code":
        return (
          <code key={i} className="md-code">
            {node.text}
          </code>
        );
      case "strong":
        return <strong key={i}>{renderInline(node.children)}</strong>;
      case "em":
        return <em key={i}>{renderInline(node.children)}</em>;
      case "del":
        return <del key={i}>{renderInline(node.children)}</del>;
      case "link":
        return (
          <a key={i} href={node.href} target="_blank" rel="noopener noreferrer" className="md-link">
            {renderInline(node.children)}
          </a>
        );
      case "placeholder":
        return (
          <span key={i} className="md-placeholder" title="Fill this in when you run the prompt">
            {node.text}
          </span>
        );
      case "redacted":
        return (
          <span key={i} className="md-redacted" title="Removed by redaction before storage">
            {node.text}
          </span>
        );
      case "br":
        return <br key={i} />;
    }
  });
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

function renderBlocks(blocks: Block[], keyPrefix = ""): ReactNode[] {
  return blocks.map((block, i) => {
    const key = `${keyPrefix}${i}`;
    switch (block.type) {
      case "heading": {
        const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
        return (
          <Tag key={key} id={slug(inlineToText(block.children))}>
            {renderInline(block.children)}
          </Tag>
        );
      }
      case "paragraph":
        return <p key={key}>{renderInline(block.children)}</p>;
      case "code":
        return <CodeBlock key={key} code={block.code} language={block.lang} lineNumbers={block.code.split("\n").length > 4} bare={block.code.split("\n").length <= 2} title={block.lang !== "" ? block.lang : undefined} collapseAfter={40} />;
      case "quote":
        return <blockquote key={key}>{renderBlocks(block.children, `${key}-`)}</blockquote>;
      case "hr":
        return <hr key={key} />;
      case "list": {
        const Tag = block.ordered ? "ol" : "ul";
        return (
          <Tag key={key} start={block.ordered && block.start !== 1 ? block.start : undefined}>
            {block.items.map((item, j) => (
              <li key={j} className={item.checked !== undefined ? "md-task" : undefined}>
                {item.checked !== undefined && (
                  <input type="checkbox" checked={item.checked} readOnly tabIndex={-1} aria-label={item.checked ? "done" : "open"} />
                )}
                <span>{renderInline(item.children)}</span>
                {item.sublist !== undefined && renderBlocks([item.sublist], `${key}-${j}-`)}
              </li>
            ))}
          </Tag>
        );
      }
      case "table":
        return (
          <div key={key} className="md-table-wrap">
            <table>
              <thead>
                <tr>
                  {block.header.map((cell, j) => (
                    <th key={j}>{renderInline(cell)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c}>{renderInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
}

/** Renders trusted-shape Markdown (untrusted content) without ever emitting HTML. */
export function Markdown({ source, compact = false, className }: MarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <div className={`md${compact ? " md-compact" : ""}${className !== undefined ? ` ${className}` : ""}`}>
      {renderBlocks(blocks)}
    </div>
  );
}

/** Inline-only rendering (no block structure), for one-line digests and titles. */
export function MarkdownInline({ source }: { source: string }) {
  const nodes = useMemo(() => {
    const blocks = parseMarkdown(source);
    const first = blocks[0];
    if (first !== undefined && first.type === "paragraph") return first.children;
    return [{ type: "text" as const, text: source }];
  }, [source]);
  return <span className="md-inline">{renderInline(nodes)}</span>;
}
