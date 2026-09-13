/**
 * Dependency-free syntax highlighter.
 *
 * Produces a flat token stream per line; the renderer maps `kind` to a CSS
 * class. Coverage is deliberately "good enough for reading captured files":
 * comments, strings, numbers, keywords, punctuation, tags/attributes, and
 * redaction markers. Anything unrecognised stays plain text.
 */

export type TokenKind =
  | "plain"
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "key"
  | "punct"
  | "tag"
  | "attr"
  | "redacted"
  | "add"
  | "del"
  | "meta";

export interface Token {
  kind: TokenKind;
  text: string;
}

export type Language =
  | "json"
  | "ts"
  | "js"
  | "css"
  | "html"
  | "md"
  | "yaml"
  | "toml"
  | "shell"
  | "diff"
  | "python"
  | "go"
  | "rust"
  | "sql"
  | "text";

const EXT_TO_LANG: Record<string, Language> = {
  json: "json",
  jsonc: "json",
  ts: "ts",
  tsx: "ts",
  mts: "ts",
  cts: "ts",
  js: "js",
  jsx: "js",
  mjs: "js",
  cjs: "js",
  css: "css",
  scss: "css",
  less: "css",
  html: "html",
  htm: "html",
  svg: "html",
  xml: "html",
  vue: "html",
  md: "md",
  mdx: "md",
  markdown: "md",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  diff: "diff",
  patch: "diff",
  py: "python",
  go: "go",
  rs: "rust",
  sql: "sql",
};

const FILENAME_TO_LANG: Record<string, Language> = {
  dockerfile: "shell",
  makefile: "shell",
  ".env.example": "shell",
  ".gitignore": "shell",
  ".npmrc": "shell",
};

/** Guess the language from a path or a fenced-code info string. */
export function detectLanguage(pathOrInfo: string): Language {
  const value = pathOrInfo.trim().toLowerCase();
  if (value === "") return "text";
  const base = value.slice(value.lastIndexOf("/") + 1);
  const byName = FILENAME_TO_LANG[base];
  if (byName !== undefined) return byName;
  const dot = base.lastIndexOf(".");
  const ext = dot === -1 ? base : base.slice(dot + 1);
  const lang = EXT_TO_LANG[ext];
  if (lang !== undefined) return lang;
  if (ext === "typescript") return "ts";
  if (ext === "javascript") return "js";
  if (ext === "text" || ext === "txt" || ext === "plain") return "text";
  return "text";
}

const KEYWORDS: Partial<Record<Language, ReadonlySet<string>>> = {
  ts: new Set([
    "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue",
    "debugger", "declare", "default", "delete", "do", "else", "enum", "export", "extends", "false",
    "finally", "for", "from", "function", "if", "implements", "import", "in", "instanceof",
    "interface", "is", "keyof", "let", "namespace", "new", "null", "of", "override", "private",
    "protected", "public", "readonly", "return", "satisfies", "static", "super", "switch", "this",
    "throw", "true", "try", "type", "typeof", "undefined", "var", "void", "while", "yield",
  ]),
  python: new Set([
    "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif",
    "else", "except", "False", "finally", "for", "from", "global", "if", "import", "in", "is",
    "lambda", "None", "nonlocal", "not", "or", "pass", "raise", "return", "True", "try", "while",
    "with", "yield", "self",
  ]),
  go: new Set([
    "break", "case", "chan", "const", "continue", "default", "defer", "else", "fallthrough", "for",
    "func", "go", "goto", "if", "import", "interface", "map", "package", "range", "return", "select",
    "struct", "switch", "type", "var", "nil", "true", "false",
  ]),
  rust: new Set([
    "as", "async", "await", "break", "const", "continue", "crate", "dyn", "else", "enum", "extern",
    "false", "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod", "move", "mut", "pub",
    "ref", "return", "self", "Self", "static", "struct", "super", "trait", "true", "type", "unsafe",
    "use", "where", "while",
  ]),
  sql: new Set([
    "select", "from", "where", "insert", "into", "values", "update", "set", "delete", "create",
    "table", "index", "join", "left", "right", "inner", "outer", "on", "as", "and", "or", "not",
    "null", "primary", "key", "order", "by", "group", "having", "limit", "offset", "distinct",
  ]),
  shell: new Set([
    "if", "then", "else", "elif", "fi", "for", "in", "do", "done", "while", "case", "esac",
    "function", "export", "local", "return", "echo", "cd", "npm", "npx", "node", "git", "set",
  ]),
};
KEYWORDS.js = KEYWORDS.ts;

const REDACTED_RE = /\[REDACTED(?::[A-Za-z0-9_-]+)?\]/y;

function matchAt(re: RegExp, text: string, index: number): RegExpExecArray | null {
  re.lastIndex = index;
  return re.exec(text);
}

const RE = {
  whitespace: /\s+/y,
  lineComment: /\/\/[^\n]*/y,
  hashComment: /#[^\n]*/y,
  dashComment: /--[^\n]*/y,
  blockCommentStart: /\/\*/y,
  dqString: /"(?:[^"\\\n]|\\.)*"?/y,
  sqString: /'(?:[^'\\\n]|\\.)*'?/y,
  btString: /`(?:[^`\\]|\\.)*`?/y,
  number: /-?(?:0x[0-9a-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:e[+-]?\d+)?)\b/y,
  word: /[A-Za-z_$][\w$]*/y,
  punct: /[{}()[\];,.<>=+\-*/%&|^!?:~@]+/y,
  jsonKey: /"(?:[^"\\\n]|\\.)*"(?=\s*:)/y,
  yamlKey: /[A-Za-z_$][\w$\-. ]*(?=\s*:(?:\s|$))/y,
  cssSelectorish: /[.#]?[A-Za-z_-][\w-]*(?=[^{;]*\{)/y,
  cssProp: /[A-Za-z-]+(?=\s*:)/y,
  htmlTag: /<\/?[A-Za-z][\w:-]*|\/?>/y,
  htmlAttr: /[A-Za-z_:][\w:.-]*(?==)/y,
  any: /[^\s]/y,
};

/** Tokenise a single line. `state` carries block-comment continuation across lines. */
function tokenizeLine(line: string, lang: Language, state: { inBlockComment: boolean }): Token[] {
  const out: Token[] = [];
  let i = 0;
  const push = (kind: TokenKind, text: string): void => {
    if (text === "") return;
    const last = out[out.length - 1];
    if (last !== undefined && last.kind === kind && (kind === "plain" || kind === "punct")) {
      last.text += text;
    } else {
      out.push({ kind, text });
    }
  };

  const keywords = KEYWORDS[lang];
  const cLike = lang === "ts" || lang === "js" || lang === "go" || lang === "rust" || lang === "css";

  while (i < line.length) {
    if (state.inBlockComment) {
      const end = line.indexOf("*/", i);
      if (end === -1) {
        push("comment", line.slice(i));
        i = line.length;
      } else {
        push("comment", line.slice(i, end + 2));
        i = end + 2;
        state.inBlockComment = false;
      }
      continue;
    }

    let m: RegExpExecArray | null;

    if ((m = matchAt(REDACTED_RE, line, i)) !== null) {
      push("redacted", m[0]);
      i += m[0].length;
      continue;
    }
    if ((m = matchAt(RE.whitespace, line, i)) !== null) {
      push("plain", m[0]);
      i += m[0].length;
      continue;
    }

    // comments
    if (cLike && (m = matchAt(RE.lineComment, line, i)) !== null) {
      push("comment", m[0]);
      i += m[0].length;
      continue;
    }
    if (cLike && matchAt(RE.blockCommentStart, line, i) !== null) {
      state.inBlockComment = true;
      continue;
    }
    if (
      (lang === "shell" || lang === "yaml" || lang === "toml" || lang === "python") &&
      (m = matchAt(RE.hashComment, line, i)) !== null
    ) {
      push("comment", m[0]);
      i += m[0].length;
      continue;
    }
    if (lang === "sql" && (m = matchAt(RE.dashComment, line, i)) !== null) {
      push("comment", m[0]);
      i += m[0].length;
      continue;
    }

    // language-specific structure
    if (lang === "json" && (m = matchAt(RE.jsonKey, line, i)) !== null) {
      push("key", m[0]);
      i += m[0].length;
      continue;
    }
    if ((lang === "yaml" || lang === "toml") && (m = matchAt(RE.yamlKey, line, i)) !== null) {
      // only at line start (after indentation / list dash) to avoid colouring prose
      const before = line.slice(0, i).trim();
      if (before === "" || before === "-") {
        push("key", m[0]);
        i += m[0].length;
        continue;
      }
    }
    if (lang === "css") {
      if ((m = matchAt(RE.cssProp, line, i)) !== null && line.slice(0, i).includes("{")) {
        push("key", m[0]);
        i += m[0].length;
        continue;
      }
      if ((m = matchAt(RE.cssSelectorish, line, i)) !== null) {
        push("tag", m[0]);
        i += m[0].length;
        continue;
      }
    }
    if (lang === "html") {
      if ((m = matchAt(RE.htmlTag, line, i)) !== null) {
        push("tag", m[0]);
        i += m[0].length;
        continue;
      }
      if ((m = matchAt(RE.htmlAttr, line, i)) !== null) {
        push("attr", m[0]);
        i += m[0].length;
        continue;
      }
    }

    // strings
    if ((m = matchAt(RE.dqString, line, i)) !== null) {
      push("string", m[0]);
      i += m[0].length;
      continue;
    }
    if (lang !== "md" && lang !== "text" && (m = matchAt(RE.sqString, line, i)) !== null) {
      // avoid treating apostrophes in prose-like shell comments as strings
      push("string", m[0]);
      i += m[0].length;
      continue;
    }
    if ((lang === "ts" || lang === "js") && (m = matchAt(RE.btString, line, i)) !== null) {
      push("string", m[0]);
      i += m[0].length;
      continue;
    }

    // numbers
    if ((m = matchAt(RE.number, line, i)) !== null && !/[\w$]/.test(line[i - 1] ?? "")) {
      push("number", m[0]);
      i += m[0].length;
      continue;
    }

    // words
    if ((m = matchAt(RE.word, line, i)) !== null) {
      const word = m[0];
      const isKeyword =
        keywords !== undefined &&
        (keywords.has(word) || (lang === "sql" && keywords.has(word.toLowerCase())));
      if (isKeyword) push("keyword", word);
      else if (lang === "json" && (word === "true" || word === "false" || word === "null")) push("keyword", word);
      else push("plain", word);
      i += word.length;
      continue;
    }

    if ((m = matchAt(RE.punct, line, i)) !== null) {
      push("punct", m[0]);
      i += m[0].length;
      continue;
    }

    if ((m = matchAt(RE.any, line, i)) !== null) {
      push("plain", m[0]);
      i += m[0].length;
      continue;
    }
    // unreachable guard against zero-length loops
    push("plain", line[i] ?? "");
    i += 1;
  }
  return out;
}

function tokenizeDiffLine(line: string): Token[] {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ")) {
    return [{ kind: "meta", text: line }];
  }
  if (line.startsWith("@@")) return [{ kind: "meta", text: line }];
  if (line.startsWith("+")) return [{ kind: "add", text: line }];
  if (line.startsWith("-")) return [{ kind: "del", text: line }];
  return [{ kind: "plain", text: line }];
}

function tokenizeMarkdownLine(line: string): Token[] {
  if (/^#{1,6}\s/.test(line)) return [{ kind: "keyword", text: line }];
  if (/^\s*([-*+]|\d+\.)\s/.test(line)) {
    const m = /^(\s*(?:[-*+]|\d+\.)\s)(.*)$/.exec(line);
    if (m) return [{ kind: "punct", text: m[1] ?? "" }, { kind: "plain", text: m[2] ?? "" }];
  }
  if (/^\s*>/.test(line)) return [{ kind: "comment", text: line }];
  if (/^\s*```/.test(line)) return [{ kind: "meta", text: line }];
  // inline code and links are split roughly
  const out: Token[] = [];
  const re = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push({ kind: "plain", text: line.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: "string", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "key", text: m[2] });
    else if (m[3] !== undefined) out.push({ kind: "keyword", text: m[3] });
    last = re.lastIndex;
  }
  if (last < line.length) out.push({ kind: "plain", text: line.slice(last) });
  return out.length > 0 ? out : [{ kind: "plain", text: line }];
}

/** Highlight a whole source string into lines of tokens. */
export function highlight(source: string, lang: Language): Token[][] {
  const lines = source.split("\n");
  if (lang === "diff") return lines.map(tokenizeDiffLine);
  if (lang === "md") return lines.map((l) => markRedactions(tokenizeMarkdownLine(l)));
  if (lang === "text") return lines.map((l) => markRedactions([{ kind: "plain", text: l }]));
  const state = { inBlockComment: false };
  return lines.map((line) => tokenizeLine(line, lang, state));
}

/** Split any plain tokens on redaction markers so they always light up. */
function markRedactions(tokens: Token[]): Token[] {
  const out: Token[] = [];
  const re = /\[REDACTED(?::[A-Za-z0-9_-]+)?\]/g;
  for (const token of tokens) {
    if (token.kind !== "plain" || !token.text.includes("[REDACTED")) {
      out.push(token);
      continue;
    }
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(token.text)) !== null) {
      if (m.index > last) out.push({ kind: "plain", text: token.text.slice(last, m.index) });
      out.push({ kind: "redacted", text: m[0] });
      last = re.lastIndex;
    }
    if (last < token.text.length) out.push({ kind: "plain", text: token.text.slice(last) });
  }
  return out;
}

/** Count redaction markers in a string (used for badges when the API count is absent). */
export function countRedactions(text: string): number {
  return (text.match(/\[REDACTED(?::[A-Za-z0-9_-]+)?\]/g) ?? []).length;
}
