"use client";

import { useState } from "react";

/**
 * The hero's primary call to action: the one command that actually connects
 * ctxfile to an agent. Installing the package alone does nothing — ctxfile is
 * an MCP server, so the client registration IS the activation step. Uses
 * `npx -y ctxfile` so no prior global install is required.
 */

interface HeroClient {
  id: string;
  name: string;
  /** Shell command, or a JSON config snippet when `json` is true. */
  code: string;
  json?: boolean;
  hint?: string;
}

const CLIENTS: HeroClient[] = [
  { id: "claude-code", name: "Claude Code", code: "claude mcp add ctxfile -- npx -y ctxfile" },
  { id: "codex", name: "Codex CLI", code: "codex mcp add ctxfile -- npx -y ctxfile" },
  {
    id: "cursor",
    name: "Cursor",
    code: '{ "mcpServers": { "ctxfile": { "command": "npx", "args": ["-y", "ctxfile"] } } }',
    json: true,
    hint: "Add to .cursor/mcp.json in your project",
  },
];

export function HeroSetup() {
  const [active, setActive] = useState<HeroClient>(CLIENTS[0]!);
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(active.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (permissions/insecure context). The text stays selectable.
    }
  }

  return (
    <div className="hero-setup">
      <div className="hero-setup-tabs" role="tablist" aria-label="Choose your agent">
        {CLIENTS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === active.id}
            className="hero-setup-tab"
            data-active={c.id === active.id}
            onClick={() => {
              setActive(c);
              setCopied(false);
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="install">
        {!active.json && (
          <span className="install-prompt" aria-hidden="true">
            $
          </span>
        )}
        <code className={active.json ? "install-cmd install-cmd-wrap" : "install-cmd"}>{active.code}</code>
        <button
          className="install-copy"
          onClick={copy}
          data-copied={copied}
          aria-label={`Copy setup command for ${active.name}`}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>

      {active.hint ? <p className="hero-setup-hint">{active.hint}</p> : null}
    </div>
  );
}
