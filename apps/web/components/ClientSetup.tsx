"use client";

import { useEffect, useState, type ReactNode } from "react";

/* Simplified brand marks, nominative use only ("works with"). Sized 20x20. */

function ClaudeMark() {
  const rays = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <svg viewBox="-8 -8 16 16" width="18" height="18" aria-hidden="true">
      {rays.map((r) => (
        <path key={r} d="M0 -6.4 L1.5 -1.5 L0 0 L-1.5 -1.5 Z" fill="#d97757" transform={`rotate(${r})`} />
      ))}
    </svg>
  );
}

function CursorMark() {
  return (
    <svg viewBox="-8 -8 16 16" width="18" height="18" aria-hidden="true" stroke="currentColor" strokeWidth={1.1} fill="none">
      <path d="M0 -6 L5.2 -3 V3 L0 6 L-5.2 3 V-3 Z" />
      <path d="M-5.2 -3 L0 0 L5.2 -3 M0 0 V6" />
    </svg>
  );
}

function OpenAIMark() {
  const arms = Array.from({ length: 6 }, (_, i) => i * 60);
  return (
    <svg viewBox="-8 -8 16 16" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.2}>
      {arms.map((r) => (
        <path key={r} d="M0 -6.2 A 6.2 6.2 0 0 1 5.37 -3.1 L 2.55 -1.47 A 2.95 2.95 0 0 0 0 -2.95 Z" transform={`rotate(${r})`} />
      ))}
    </svg>
  );
}

function GeminiMark() {
  return (
    <svg viewBox="-8 -8 16 16" width="18" height="18" aria-hidden="true">
      <defs>
        <linearGradient id="cs-gem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4796e3" />
          <stop offset="1" stopColor="#9177c7" />
        </linearGradient>
      </defs>
      <path
        d="M0 -6.6 C 0.8 -2.2 2.2 -0.8 6.6 0 C 2.2 0.8 0.8 2.2 0 6.6 C -0.8 2.2 -2.2 0.8 -6.6 0 C -2.2 -0.8 -0.8 -2.2 0 -6.6 Z"
        fill="url(#cs-gem)"
      />
    </svg>
  );
}

function GrokMark() {
  return (
    <svg viewBox="-8 -8 16 16" width="18" height="18" aria-hidden="true" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" fill="none">
      <path d="M3.6 -5.6 L-3.6 5.6" />
      <path d="M-3.6 -5.6 L-0.6 -1.2" />
      <path d="M3.6 5.6 L0.6 1.2" />
    </svg>
  );
}

function OpenCodeMark() {
  return (
    <svg viewBox="-8 -8 16 16" width="18" height="18" aria-hidden="true" stroke="currentColor" strokeWidth={1.3} fill="none" strokeLinecap="round">
      <rect x="-6.4" y="-6.4" width="12.8" height="12.8" rx="2.6" />
      <path d="M-3.4 -1.6 L-1 0.6 L-3.4 2.8" />
      <path d="M0.6 2.8 H3.8" />
    </svg>
  );
}

function AiderMark() {
  return (
    <svg viewBox="-8 -8 16 16" width="18" height="18" aria-hidden="true" stroke="currentColor" strokeWidth={1.3} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M-6 3.4 V-2.2 A 2.4 2.4 0 0 1 -3.6 -4.6 H3.6 A 2.4 2.4 0 0 1 6 -2.2 V0.8 A 2.4 2.4 0 0 1 3.6 3.2 H-2.4 L-6 6 Z" />
      <path d="M-2.4 -0.8 L0 -3 L2.4 -0.8" />
    </svg>
  );
}

function OpenClawMark() {
  return (
    <svg viewBox="-8 -8 16 16" width="18" height="18" aria-hidden="true" stroke="currentColor" strokeWidth={1.4} fill="none" strokeLinecap="round">
      <path d="M-4.6 5.4 C -5.8 1.2 -4.6 -3.4 -1.6 -5.8" />
      <path d="M0 5.8 C -0.6 1.6 0.2 -2.4 2.4 -5" />
      <path d="M4.4 5 C 4.2 1.6 5 -1.6 6.4 -3.6" />
    </svg>
  );
}

function HermesMark() {
  return (
    <svg viewBox="-8 -8 16 16" width="18" height="18" aria-hidden="true" stroke="currentColor" strokeWidth={1.3} fill="none" strokeLinecap="round">
      <path d="M-6.4 4.8 C -2.4 4.4 1.6 2.6 5.2 -1 " />
      <path d="M-5 1.6 C -1.6 1.2 1.8 -0.4 4.6 -3.4" />
      <path d="M-3.4 -1.6 C -0.6 -1.8 2 -3 4 -5.4" />
      <path d="M5.2 -1 L6.6 -5.8 L2.2 -4.4" />
    </svg>
  );
}

/* ---- data ---- */

interface Step {
  title: string;
  body?: ReactNode;
  code?: string;
}

interface Client {
  id: string;
  name: string;
  mark: ReactNode;
  note?: ReactNode;
  steps: Step[];
}

const INSTALL: Step = {
  title: "Install ctxfile",
  body: "One global install serves every client on the machine.",
  code: "npm install -g ctxfile",
};

const CLIENTS: Client[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    mark: <ClaudeMark />,
    steps: [
      INSTALL,
      {
        title: "Register the server",
        body: (
          <>
            Run from your project directory; that is what <code>--root .</code> points at. Defaults to{" "}
            <code>local</code> scope (just you, this project). Add <code>--scope project</code> to commit it to
            the repo for your team, or <code>--scope user</code> for all your projects.
          </>
        ),
        code: "claude mcp add ctxfile -- ctxfile --root .",
      },
      {
        title: "Verify",
        body: (
          <>
            The ctxfile tools appear in the list, or run <code>/mcp</code> inside a session.
          </>
        ),
        code: "claude mcp list",
      },
    ],
  },
  {
    id: "cursor",
    name: "Cursor",
    mark: <CursorMark />,
    steps: [
      INSTALL,
      {
        title: "Add the server",
        body: (
          <>
            In <code>.cursor/mcp.json</code> in the project, or <code>~/.cursor/mcp.json</code> globally:
          </>
        ),
        code: `{
  "mcpServers": {
    "ctxfile": {
      "command": "ctxfile",
      "args": ["--root", "."]
    }
  }
}`,
      },
      {
        title: "Verify",
        body: "Settings, MCP: ctxfile shows a green dot. Its handful of tools sit far under Cursor's 40-tool cap.",
      },
    ],
  },
  {
    id: "codex",
    name: "Codex CLI",
    mark: <OpenAIMark />,
    steps: [
      INSTALL,
      {
        title: "Register the server",
        body: (
          <>
            One command; it writes <code>~/.codex/config.toml</code> for you. Codex config is global, so pin an
            absolute <code>--root</code> if you do not always launch codex from the project.
          </>
        ),
        code: "codex mcp add ctxfile -- ctxfile --root .",
      },
      { title: "Verify", code: "codex mcp list" },
    ],
  },
  {
    id: "opencode",
    name: "OpenCode",
    mark: <OpenCodeMark />,
    steps: [
      INSTALL,
      {
        title: "Add the server",
        body: (
          <>
            In <code>opencode.json</code> in the project (or the global config):
          </>
        ),
        code: `{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "ctxfile": {
      "type": "local",
      "command": ["ctxfile", "--root", "."],
      "enabled": true
    }
  }
}`,
      },
      {
        title: "Local model? Check tool support",
        body: (
          <>
            The agent model must support tool calling to invoke ctxfile (qwen3 and llama3.1 do; gemma3 does not).
            Details in <a href="/docs/local-models">Local models</a>.
          </>
        ),
      },
    ],
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    mark: <GeminiMark />,
    steps: [
      INSTALL,
      {
        title: "Register the server",
        body: "Recent Gemini CLI has a one-command shortcut that writes settings.json for you:",
        code: "gemini mcp add ctxfile ctxfile --root .",
      },
      {
        title: "Or edit settings.json directly",
        body: (
          <>
            In <code>~/.gemini/settings.json</code> (global) or the project&apos;s{" "}
            <code>.gemini/settings.json</code>:
          </>
        ),
        code: `{
  "mcpServers": {
    "ctxfile": {
      "command": "ctxfile",
      "args": ["--root", "."]
    }
  }
}`,
      },
      { title: "Verify", code: "gemini mcp list" },
    ],
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    mark: <OpenClawMark />,
    steps: [
      INSTALL,
      {
        title: "Register the server",
        body: (
          <>
            OpenClaw&apos;s gateway does not run from your project directory, so give it an absolute{" "}
            <code>--root</code>:
          </>
        ),
        code: `openclaw mcp add ctxfile --command ctxfile --arg --root --arg /absolute/path/to/project`,
      },
      {
        title: "Verify",
        body: "ctxfile's tools are listed and callable from any connected channel.",
        code: "openclaw mcp list",
      },
    ],
  },
  {
    id: "hermes",
    name: "Hermes",
    mark: <HermesMark />,
    steps: [
      INSTALL,
      {
        title: "Add the server",
        body: (
          <>
            In <code>~/.hermes/config.yaml</code>. Hermes runs as a resident agent, so use an absolute{" "}
            <code>--root</code>:
          </>
        ),
        code: `mcp_servers:
  ctxfile:
    command: "ctxfile"
    args: ["--root", "/absolute/path/to/project"]`,
      },
      {
        title: "Verify",
        body: (
          <>
            Hermes namespaces MCP tools as <code>mcp_&lt;server&gt;_&lt;tool&gt;</code>, so ctxfile&apos;s appear as{" "}
            <code>mcp_ctxfile_get_context</code> and friends. <code>hermes mcp list</code> shows them.
          </>
        ),
      },
    ],
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    mark: <ClaudeMark />,
    steps: [
      {
        title: "Install the extension",
        body: (
          <>
            Download <code>ctxfile.mcpb</code> from the{" "}
            <a href="https://github.com/ctxfile/ctxfile/releases" rel="noopener">
              releases page
            </a>{" "}
            and drag it into Settings, Extensions. Or add the generic stdio JSON to{" "}
            <code>claude_desktop_config.json</code>.
          </>
        ),
      },
      {
        title: "Point it at your project",
        body: "Set the project root in the extension's settings pane. Desktop apps do not inherit your shell PATH; if the server fails to start, see the nvm note below.",
      },
    ],
  },
  {
    id: "aider",
    name: "Aider",
    mark: <AiderMark />,
    steps: [
      INSTALL,
      {
        title: "Load context by file",
        body: (
          <>
            Aider has no MCP client yet, so use the exported artifact instead. Run this and add the file to the
            chat with <code>/read .ctxfile/context.json</code>:
          </>
        ),
        code: "ctxfile export",
      },
      {
        title: "Your aider history still travels",
        body: (
          <>
            Pro&apos;s session connectors read aider&apos;s history file, so work done in aider shows up in{" "}
            <code>get_context</code> everywhere else.
          </>
        ),
      },
    ],
  },
  {
    id: "web",
    name: "Grok / ChatGPT / Claude web",
    mark: <GrokMark />,
    steps: [
      {
        title: "Web chatbots connect through Sync",
        body: (
          <>
            Browser chatbots cannot launch a local process; they connect to your encrypted Sync vault through the
            relay&apos;s connector URL instead. The full walkthrough for each surface is on the{" "}
            <a href="/docs/webchat">web chatbots page</a>.
          </>
        ),
      },
    ],
  },
];

export function ClientSetup() {
  const [active, setActive] = useState(CLIENTS[0]!.id);

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (wanted && CLIENTS.some((c) => c.id === wanted)) setActive(wanted);
  }, []);

  function select(id: string) {
    setActive(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
  }

  const client = CLIENTS.find((c) => c.id === active) ?? CLIENTS[0]!;

  return (
    <div className="cs">
      <div className="cs-tabs" role="tablist" aria-label="Choose your client">
        {CLIENTS.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={c.id === active}
            className="cs-tab"
            data-active={c.id === active}
            onClick={() => select(c.id)}
          >
            <span className="cs-tab-mark">{c.mark}</span>
            {c.name}
          </button>
        ))}
      </div>
      <div className="cs-panel" role="tabpanel">
        {client.steps.map((step, i) => (
          <div className="cs-step" key={i}>
            <div className="cs-step-head">
              <span className="cs-step-num">{i + 1}</span>
              <h3>{step.title}</h3>
            </div>
            {step.body ? <p>{step.body}</p> : null}
            {step.code ? <StepCode code={step.code} /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function StepCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable; the snippet is selectable text either way.
    }
  }

  return (
    <div className="cs-code">
      <pre>
        <code>{code}</code>
      </pre>
      <button className="cs-copy" onClick={copy} data-copied={copied} aria-label="Copy snippet">
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
