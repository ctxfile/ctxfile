"use client";

import { track } from "@/lib/analytics";
import Link from "next/link";
import { useState, type ReactNode } from "react";

/**
 * The hero's primary call to action: the one step that actually connects
 * ctxfile to an agent. Installing the package alone does nothing — ctxfile is
 * an MCP server, so the client registration IS the activation step. Uses
 * `npx -y ctxfile` so no prior global install is required.
 *
 * Claude Desktop is the one tab that is not a command: it is the only install
 * here that never touches a terminal, which makes it the entry point for
 * everyone who isn't a developer. Browser chatbots deliberately are NOT tabs —
 * they cannot launch a local process and reach ctxfile through Sync instead, so
 * a copy button would promise something it cannot deliver.
 */

interface HeroClient {
  id: string;
  name: string;
  /** Shell command, or a JSON config snippet when `json` is true. */
  code?: string;
  json?: boolean;
  /** Clients that install by downloading a bundle instead of running a command. */
  download?: { href: string; label: string };
  hint?: ReactNode;
}

/**
 * Intentionally unversioned and pointing at `latest`: the packed artifact keeps
 * a stable filename so this link never needs editing at release time.
 */
const MCPB_URL = "https://github.com/ctxfile/ctxfile/releases/latest/download/ctxfile-macos-arm64.mcpb";

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
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    download: { href: MCPB_URL, label: "ctxfile-macos-arm64.mcpb" },
    hint: (
      <>
        No terminal: drag it into Settings → Extensions. macOS (Apple Silicon);{" "}
        <Link href="/docs/clients?tab=claude-desktop">Windows and Intel Macs →</Link>
      </>
    ),
  },
];

export function HeroSetup() {
  const [active, setActive] = useState<HeroClient>(CLIENTS[0]!);
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    if (!active.code) return;
    // Copying the setup command is the closest thing the site has to an
    // install: pageviews say someone read the pitch, this says they meant to
    // act on it. Recorded before the clipboard call so a blocked clipboard
    // (insecure context, denied permission) still counts the intent.
    track("Setup command copied", { client: active.name });
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

      {active.download ? (
        <a
          className="install install-download"
          href={active.download.href}
          rel="noopener"
          onClick={() => track("Extension downloaded", { client: active.name })}
        >
          {/* Plain U+2193: the heavier download glyphs are not in IBM Plex Mono
              and fall back to tofu. */}
          <span className="install-prompt" aria-hidden="true">
            ↓
          </span>
          <code className="install-cmd">{active.download.label}</code>
          <span className="install-copy">download</span>
        </a>
      ) : (
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
      )}

      {active.hint ? <p className="hero-setup-hint">{active.hint}</p> : null}

      <p className="hero-setup-alt">
        Using ChatGPT, Claude, or Grok in the browser? Those reach your context through{" "}
        <Link href="/docs/webchat">Sync →</Link>
      </p>
    </div>
  );
}
