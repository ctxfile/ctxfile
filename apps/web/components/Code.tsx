"use client";

import { Fragment, useState, type ReactNode } from "react";

/**
 * Small, dependency-free syntax colouring for the handful of languages the
 * site actually shows: JSON payloads, shell commands, TypeScript-ish snippets,
 * and YAML/TOML client configs. Tokens map to `.tok-*` classes in globals.css
 * so both themes are covered by the design tokens.
 *
 * `highlight()` is pure and safe to call from server components; `CodeWindow`
 * adds the glass chrome (language label, optional title, copy key).
 */

export type Lang = "json" | "bash" | "ts" | "yaml" | "toml" | "text";

interface Rule {
  cls: string;
  re: RegExp;
}

const JSON_RULES: Rule[] = [
  { cls: "tok-key", re: /"(?:[^"\\]|\\.)*"(?=\s*:)/y },
  { cls: "tok-str", re: /"(?:[^"\\]|\\.)*"/y },
  { cls: "tok-num", re: /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y },
  { cls: "tok-kw", re: /\b(?:true|false|null)\b/y },
  { cls: "tok-punct", re: /[{}[\]:,]/y },
];

const BASH_RULES: Rule[] = [
  { cls: "tok-cmt", re: /#[^\n]*/y },
  { cls: "tok-str", re: /"(?:[^"\\]|\\.)*"|'[^']*'/y },
  { cls: "tok-flag", re: /(?<=\s|^)--?[A-Za-z][\w-]*/y },
  { cls: "tok-punct", re: /\|\||&&|[|;>]/y },
  { cls: "tok-num", re: /(?<=\s|^)\d+(?=\s|$)/y },
];

const TS_KEYWORDS =
  /\b(?:const|let|var|function|return|import|export|from|if|else|for|while|new|await|async|type|interface|extends|class|default|null|true|false|undefined)\b/y;

const TS_RULES: Rule[] = [
  { cls: "tok-cmt", re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y },
  { cls: "tok-str", re: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/y },
  { cls: "tok-kw", re: TS_KEYWORDS },
  { cls: "tok-num", re: /\b\d+(?:\.\d+)?\b/y },
  { cls: "tok-punct", re: /[{}()[\];,.:=<>]/y },
];

const YAML_RULES: Rule[] = [
  { cls: "tok-cmt", re: /#[^\n]*/y },
  { cls: "tok-key", re: /(?<=^|\n)[ \t-]*[\w."-]+(?=\s*:)/y },
  { cls: "tok-str", re: /"(?:[^"\\]|\\.)*"|'[^']*'/y },
  { cls: "tok-kw", re: /\b(?:true|false|null|yes|no)\b/y },
  { cls: "tok-num", re: /\b\d+(?:\.\d+)?\b/y },
  { cls: "tok-punct", re: /[[\]{}:,|>-]/y },
];

const TOML_RULES: Rule[] = [
  { cls: "tok-cmt", re: /#[^\n]*/y },
  { cls: "tok-tag", re: /\[[^\]\n]+\]/y },
  { cls: "tok-key", re: /(?<=^|\n)[ \t]*[\w."-]+(?=\s*=)/y },
  { cls: "tok-str", re: /"(?:[^"\\]|\\.)*"|'[^']*'/y },
  { cls: "tok-kw", re: /\b(?:true|false)\b/y },
  { cls: "tok-num", re: /\b\d+(?:\.\d+)?\b/y },
  { cls: "tok-punct", re: /[=,[\]]/y },
];

const RULES: Record<Lang, Rule[]> = {
  json: JSON_RULES,
  bash: BASH_RULES,
  ts: TS_RULES,
  yaml: YAML_RULES,
  toml: TOML_RULES,
  text: [],
};

/** Words that start a shell command (line start, or after `|`, `&&`, `;`). */
const BASH_CMD = /(?:^|(?<=[|;&]\s*))([A-Za-z][\w.-]*)/y;

function tokenizeLine(line: string, lang: Lang, key: number): ReactNode[] {
  const rules = RULES[lang];
  const out: ReactNode[] = [];
  let i = 0;
  let plain = "";
  let n = 0;
  const flush = (): void => {
    if (plain !== "") {
      out.push(<Fragment key={`${key}-${n++}`}>{plain}</Fragment>);
      plain = "";
    }
  };
  let atCommandStart = lang === "bash";

  while (i < line.length) {
    let matched = false;

    if (lang === "bash" && atCommandStart && /\S/.test(line[i] ?? "")) {
      BASH_CMD.lastIndex = i;
      const m = BASH_CMD.exec(line);
      if (m && m.index === i && m[1] !== undefined && !m[1].startsWith("-")) {
        flush();
        out.push(
          <span key={`${key}-${n++}`} className="tok-cmd">
            {m[1]}
          </span>
        );
        i += m[1].length;
        atCommandStart = false;
        continue;
      }
      atCommandStart = false;
    }

    for (const rule of rules) {
      rule.re.lastIndex = i;
      const m = rule.re.exec(line);
      if (m && m.index === i && m[0].length > 0) {
        flush();
        out.push(
          <span key={`${key}-${n++}`} className={rule.cls}>
            {m[0]}
          </span>
        );
        i += m[0].length;
        if (lang === "bash" && rule.cls === "tok-punct") atCommandStart = true;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    plain += line[i];
    i += 1;
  }
  flush();
  return out;
}

/** Highlights `code`, returning one `<span class="code-line">` per line. */
export function highlight(code: string, lang: Lang, lineNumbers = false): ReactNode[] {
  const lines = code.replace(/\n$/, "").split("\n");
  return lines.map((line, index) => (
    <span key={index} className="code-line">
      {lineNumbers && <span className="code-ln">{index + 1}</span>}
      {line === "" ? "​" : tokenizeLine(line, lang, index)}
    </span>
  ));
}

export interface CodeWindowProps {
  code: string;
  lang?: Lang;
  /** Optional filename or command context shown in the title bar. */
  title?: string;
  lineNumbers?: boolean;
  className?: string;
}

export function CodeWindow({ code, lang = "text", title, lineNumbers = false, className }: CodeWindowProps) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (permissions/insecure context). The text is selectable.
    }
  }

  return (
    <div className={className ? `code ${className}` : "code"}>
      <div className="code-bar">
        <span className="code-title">{title ?? ""}</span>
        <span className="code-lang">{lang}</span>
        <button type="button" className="code-copy" onClick={copy} data-copied={copied} aria-label="Copy code">
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="code-body">{highlight(code, lang, lineNumbers)}</pre>
    </div>
  );
}
