import { useMemo, useState } from "react";
import { detectLanguage, highlight, type Language } from "../lib/highlight";
import { useCopy } from "../lib/hooks";
import { Icon } from "./Icon";

export interface CodeBlockProps {
  code: string;
  /** Explicit language, or a path / fence info string to detect from. */
  language?: Language | string;
  /** Title shown in the toolbar (usually the file path). */
  title?: string;
  lineNumbers?: boolean;
  /** Start collapsed past this many lines; a button expands. */
  collapseAfter?: number;
  /** Hide the toolbar for embedded use (markdown fences). */
  bare?: boolean;
  className?: string;
}

const LANG_LABEL: Record<Language, string> = {
  json: "JSON",
  ts: "TypeScript",
  js: "JavaScript",
  css: "CSS",
  html: "HTML",
  md: "Markdown",
  yaml: "YAML",
  toml: "TOML",
  shell: "Shell",
  diff: "Diff",
  python: "Python",
  go: "Go",
  rust: "Rust",
  sql: "SQL",
  text: "Text",
};

function resolveLanguage(language: string | undefined): Language {
  if (language === undefined) return "text";
  if (language in LANG_LABEL) return language as Language;
  return detectLanguage(language);
}

/** Syntax-coloured, copyable code window with optional line numbers and wrap. */
export function CodeBlock({
  code,
  language,
  title,
  lineNumbers = true,
  collapseAfter,
  bare = false,
  className,
}: CodeBlockProps) {
  const lang = resolveLanguage(language);
  const lines = useMemo(() => highlight(code.replace(/\n$/, ""), lang), [code, lang]);
  const [wrap, setWrap] = useState(lang === "md" || lang === "text");
  const [expanded, setExpanded] = useState(false);
  const [copiedId, copy] = useCopy();

  const collapsible = collapseAfter !== undefined && lines.length > collapseAfter;
  const visible = collapsible && !expanded ? lines.slice(0, collapseAfter) : lines;
  const gutterWidth = String(lines.length).length;

  return (
    <div
      className={`code${wrap ? " code-wrap" : ""}${bare ? " code-bare" : ""}${className !== undefined ? ` ${className}` : ""}`}
      data-lang={lang}
    >
      {!bare && (
        <div className="code-bar">
          <span className="code-title mono" title={title}>
            {title ?? LANG_LABEL[lang]}
          </span>
          <span className="code-bar-right">
            <span className="code-lang">{LANG_LABEL[lang]}</span>
            <span className="code-lines num">{lines.length.toLocaleString()} lines</span>
            <button
              type="button"
              className={`icon-btn${wrap ? " is-on" : ""}`}
              onClick={() => setWrap((w) => !w)}
              aria-pressed={wrap}
              aria-label={wrap ? "Disable line wrap" : "Enable line wrap"}
              data-tip={wrap ? "Unwrap lines" : "Wrap lines"}
            >
              <Icon name="wrap" size={14} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => copy("code", code)}
              aria-label="Copy code"
              data-tip={copiedId === "code" ? "Copied" : "Copy"}
            >
              <Icon name={copiedId === "code" ? "check" : "copy"} size={14} />
            </button>
          </span>
        </div>
      )}
      <pre className="code-pre" tabIndex={0}>
        <code>
          {visible.map((tokens, index) => (
            <span className="code-line" key={index}>
              {lineNumbers && (
                <span className="code-ln num" aria-hidden="true" style={{ width: `${gutterWidth}ch` }}>
                  {index + 1}
                </span>
              )}
              <span className="code-text">
                {tokens.length === 0 ? "\n" : null}
                {tokens.map((token, ti) =>
                  token.kind === "plain" ? (
                    token.text
                  ) : (
                    <span key={ti} className={`tk tk-${token.kind}`}>
                      {token.text}
                    </span>
                  )
                )}
                {"\n"}
              </span>
            </span>
          ))}
        </code>
      </pre>
      {collapsible && (
        <button type="button" className="code-expand" onClick={() => setExpanded((e) => !e)}>
          <Icon name={expanded ? "chevron-down" : "chevron-right"} size={13} />
          {expanded ? "Show less" : `Show all ${lines.length.toLocaleString()} lines`}
        </button>
      )}
    </div>
  );
}
