import path from "node:path";

const DENIED_BASENAME_PATTERNS: RegExp[] = [
  /^\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /^id_rsa(\..*)?$/i,
  /^id_ed25519(\..*)?$/i,
  /^id_ecdsa(\..*)?$/i,
  /^id_dsa(\..*)?$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.p8$/i,
  /\.ppk$/i,
  /^\.npmrc$/i,
  /^\.netrc$/i,
  /credentials/i,
  /\.keystore$/i,
];

export function isDeniedPath(relPath: string): boolean {
  const base = path.basename(relPath);
  return DENIED_BASENAME_PATTERNS.some((re) => re.test(base));
}

interface SecretPattern {
  kind: string;
  pattern: RegExp;
}

// Order matters: specific token formats first, then structural blocks,
// then the generic quoted-assignment catch-all.
const SECRET_PATTERNS: SecretPattern[] = [
  { kind: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { kind: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "aws-secret-key", pattern: /\baws_secret_access_key\s*[:=]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/gi },
  { kind: "github-token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { kind: "api-key", pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { kind: "notion-token", pattern: /\b(?:ntn|secret)_[A-Za-z0-9]{20,}\b/g },
  { kind: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{8,}\b/g },
  { kind: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  {
    kind: "assignment",
    pattern: /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|token)\s*[:=]\s*(['"])[^'"]{8,}\1/gi,
  },
];

export function redactContent(text: string): { text: string; redactions: number } {
  let redactions = 0;
  let output = text;
  for (const { kind, pattern } of SECRET_PATTERNS) {
    output = output.replace(pattern, () => {
      redactions += 1;
      return `[REDACTED:${kind}]`;
    });
  }
  return { text: output, redactions };
}
