"use client";

import { useState } from "react";
import { highlight } from "@/components/Code";

/**
 * Interactive view of the actual ContextObject an agent receives, per scope.
 * The same payloads `get_context` returns, syntax-coloured by the shared
 * highlighter in components/Code.tsx.
 */

const SCOPES = ["full", "plan", "files", "git"] as const;
type Scope = (typeof SCOPES)[number];

const PAYLOADS: Record<Scope, string> = {
  full: `{
  "meta": {
    "name": "ctxfile",
    "generatedAt": "2026-07-10T17:41:02Z",
    "tokenBudget": 50000,
    "tokensUsed": 18432,
    "connectors": [
      { "name": "file", "status": "ok", "durationMs": 947 },
      { "name": "git", "status": "ok", "durationMs": 512 },
      { "name": "notion", "status": "skipped" }
    ]
  },
  "plan": "Ship checkout flow: webhook handler, then receipt emails.",
  "keyFiles": [
    { "path": "src/payments/webhook.ts", "tokens": 1284, "redactions": 2 },
    { "path": "src/payments/receipt.ts", "tokens": 911, "redactions": 0 }
  ],
  "gitState": { "branch": "feat/checkout", "ahead": 2, "modified": ["src/payments/webhook.ts"] },
  "sessionSummary": "Implemented signature verification; receipt template next."
}`,
  plan: `{
  "meta": { "tokensUsed": 214, "tokenBudget": 50000 },
  "plan": "Ship checkout flow: webhook handler, then receipt emails.",
  "keyFiles": [],
  "gitState": null
}`,
  files: `{
  "meta": { "tokensUsed": 11207, "tokenBudget": 50000 },
  "keyFiles": [
    { "path": "src/payments/webhook.ts", "tokens": 1284, "truncated": false, "redactions": 2 },
    { "path": "src/payments/receipt.ts", "tokens": 911, "truncated": false, "redactions": 0 },
    { "path": "docs/PLAN.md", "tokens": 402, "truncated": false, "redactions": 0 }
  ]
}`,
  git: `{
  "meta": { "tokensUsed": 1830, "tokenBudget": 50000 },
  "gitState": {
    "branch": "feat/checkout",
    "ahead": 2, "behind": 0,
    "staged": [], "modified": ["src/payments/webhook.ts"],
    "commits": [
      { "hash": "9f3a1c2", "message": "feat: verify webhook signatures" },
      { "hash": "b41e770", "message": "chore: checkout scaffolding" }
    ]
  }
}`,
};

export function ContextPreview() {
  const [scope, setScope] = useState<Scope>("full");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(PAYLOADS[scope]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* selectable text remains */
    }
  }

  return (
    <div className="payload">
      <div className="payload-bar">
        <span className="payload-call">
          get_context<span className="tok-punct">(</span>scope<span className="tok-punct">:</span>
        </span>
        <div className="payload-tabs" role="tablist" aria-label="Context scope">
          {SCOPES.map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={scope === s}
              className="payload-tab"
              data-active={scope === s}
              onClick={() => setScope(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="payload-call">
          <span className="tok-punct">)</span>
        </span>
        <button className="code-copy payload-copy" onClick={copy} data-copied={copied} aria-label="Copy payload">
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="payload-json" key={scope}>
        {highlight(PAYLOADS[scope], "json", true)}
      </pre>
    </div>
  );
}
