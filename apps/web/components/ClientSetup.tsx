"use client";

import { useEffect, useState, type ReactNode } from "react";
import { highlight, type Lang } from "@/components/Code";

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

/** A neutral monogram for clients without a mark here (nominative use only). */
function LetterMark({ letter }: { letter: string }) {
  return (
    <svg viewBox="-8 -8 16 16" width="18" height="18" aria-hidden="true">
      <rect x="-7" y="-7" width="14" height="14" rx="3.4" fill="none" stroke="currentColor" strokeWidth={1.2} />
      <text x="0" y="3.4" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor" fontFamily="inherit">
        {letter}
      </text>
    </svg>
  );
}

/* ---- data ---- */

/** Snippets and links that need the project's absolute path take it as an
    argument; the panel fills in what the reader typed. */
type WithRoot = string | ((root: string) => string);

interface Step {
  title: string;
  body?: ReactNode;
  code?: WithRoot;
  /** One-click install links (each client's own deeplink scheme). */
  links?: { label: string; href: WithRoot }[];
}

interface Client {
  id: string;
  name: string;
  mark: ReactNode;
  /** True when this client needs an absolute project path. */
  needsRoot?: boolean;
  steps: Step[];
}

const PLACEHOLDER_ROOT = "/absolute/path/to/project";
const WORKSPACE = "${workspaceFolder}";

const INSTALL: Step = {
  title: "Install ctxfile",
  body: "One global install serves every client on the machine.",
  code: "npm install -g ctxfile",
};

function connectStep(id: string): Step {
  return {
    title: "Or let ctxfile write it",
    body: (
      <>
        Fills in this project&apos;s path, keeps a backup of the old file, and leaves every other server alone.
      </>
    ),
    code: `ctxfile connect ${id}`,
  };
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function servers(key: string, entry: Record<string, unknown>): string {
  return json({ [key]: { ctxfile: entry } });
}

function stdio(root: string): { command: string; args: string[] } {
  return { command: "ctxfile", args: ["--root", root] };
}

function base64(text: string): string {
  // Snippets are ASCII except for paths the reader types; encode UTF-8 safely.
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const CURSOR_LINK = `cursor://anysphere.cursor-deeplink/mcp/install?name=ctxfile&config=${encodeURIComponent(
  base64(JSON.stringify(stdio(WORKSPACE)))
)}`;
const VSCODE_CONFIG = JSON.stringify({ name: "ctxfile", type: "stdio", ...stdio(WORKSPACE) });

const CLIENTS: Client[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    mark: <ClaudeMark />,
    steps: [
      INSTALL,
      {
        title: "Register it once, for every project",
        body: (
          <>
            Claude Code tells ctxfile which project is open (<code>CLAUDE_PROJECT_DIR</code>), so one user-scope entry
            serves them all. For a team, <code>--scope project</code> writes <code>.mcp.json</code> to commit; each
            teammate approves it once.
          </>
        ),
        code: "claude mcp add --scope user ctxfile -- ctxfile",
      },
      {
        title: "Or install the plugin",
        body: "Inside Claude Code (2.1.275 or later). It runs ctxfile through npx, so no global install is needed.",
        code: "/plugin install ctxfile --marketplace ctxfile/ctxfile",
      },
      {
        title: "Verify",
        body: (
          <>
            The list shows ctxfile as connected, or run <code>/mcp</code> inside a session.
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
      { title: "Add it in one click", links: [{ label: "Add to Cursor", href: CURSOR_LINK }] },
      {
        title: "Or add it by hand",
        body: (
          <>
            In <code>~/.cursor/mcp.json</code> (every project) or <code>.cursor/mcp.json</code> (this one). Cursor
            fills in <code>{WORKSPACE}</code> with the open project.
          </>
        ),
        code: servers("mcpServers", stdio(WORKSPACE)),
      },
      { title: "Verify", body: "Settings, MCP: ctxfile shows a green dot. From the Cursor CLI: agent mcp list." },
    ],
  },
  {
    id: "vscode",
    name: "VS Code",
    mark: <LetterMark letter="V" />,
    steps: [
      INSTALL,
      {
        title: "Add it in one click",
        body: "Needs GitHub Copilot's agent mode.",
        links: [
          { label: "Install in VS Code", href: `vscode:mcp/install?${encodeURIComponent(VSCODE_CONFIG)}` },
          { label: "Install in VS Code Insiders", href: `vscode-insiders:mcp/install?${encodeURIComponent(VSCODE_CONFIG)}` },
        ],
      },
      {
        title: "Or from the terminal",
        body: "Adds it to your user profile; VS Code fills in the open folder.",
        code: `code --add-mcp '${VSCODE_CONFIG}'`,
      },
      {
        title: "Or per project",
        body: (
          <>
            In <code>.vscode/mcp.json</code>:
          </>
        ),
        code: servers("servers", { type: "stdio", ...stdio(WORKSPACE) }),
      },
      { title: "Verify", body: "Command Palette, MCP: List Servers, ctxfile, Show Output." },
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
            Writes <code>~/.codex/config.toml</code> for you. Codex starts servers in the folder you run it from, so{" "}
            <code>--root .</code> follows you between projects.
          </>
        ),
        code: "codex mcp add ctxfile -- ctxfile --root .",
      },
      { title: "Verify", code: "codex mcp list" },
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
        body: (
          <>
            <code>-s user</code> for every project; leave it off for this project only. Gemini CLI starts local servers
            only in a trusted folder (<code>gemini trust</code>).
          </>
        ),
        code: "gemini mcp add -s user ctxfile ctxfile --root .",
      },
      {
        title: "Or edit settings.json",
        body: (
          <>
            <code>~/.gemini/settings.json</code> or the project&apos;s <code>.gemini/settings.json</code>:
          </>
        ),
        code: servers("mcpServers", stdio(".")),
      },
      { title: "Verify", code: "gemini mcp list" },
    ],
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    mark: <ClaudeMark />,
    needsRoot: true,
    steps: [
      {
        title: "On an Apple Silicon Mac: install the extension",
        body: (
          <>
            Download{" "}
            <a href="https://github.com/ctxfile/ctxfile/releases/latest/download/ctxfile-macos-arm64.mcpb" rel="noopener">
              <code>ctxfile-macos-arm64.mcpb</code>
            </a>{" "}
            and drag it into Settings, Extensions. It carries its own runtime; set the project folder in its settings.
          </>
        ),
      },
      {
        title: "Anywhere else: add it to the config",
        body: (
          <>
            After <code>npm install -g ctxfile</code>, in <code>claude_desktop_config.json</code> (macOS{" "}
            <code>~/Library/Application Support/Claude/</code>, Windows <code>%APPDATA%\Claude\</code>, Linux{" "}
            <code>~/.config/Claude/</code>). Desktop apps need the absolute path:
          </>
        ),
        code: (root) => servers("mcpServers", stdio(root)),
      },
      connectStep("claude-desktop"),
      { title: "Verify", body: "Quit and reopen Claude Desktop, then +, Connectors: ctxfile is listed." },
    ],
  },
  {
    id: "windsurf",
    name: "Windsurf",
    mark: <LetterMark letter="W" />,
    needsRoot: true,
    steps: [
      INSTALL,
      {
        title: "Add the server",
        body: (
          <>
            In <code>~/.codeium/windsurf/mcp_config.json</code>. Windsurf has no project placeholder, so give the
            absolute path:
          </>
        ),
        code: (root) => servers("mcpServers", stdio(root)),
      },
      connectStep("windsurf"),
      { title: "Verify", body: "Cascade's MCP panel, Refresh: ctxfile is listed with its tools." },
    ],
  },
  {
    id: "zed",
    name: "Zed",
    mark: <LetterMark letter="Z" />,
    steps: [
      INSTALL,
      {
        title: "Add the server",
        body: (
          <>
            In Zed&apos;s settings (<code>~/.config/zed/settings.json</code>, Windows <code>%APPDATA%\Zed\</code>) or the
            project&apos;s <code>.zed/settings.json</code>. Zed starts servers in the open project, so{" "}
            <code>--root .</code> works:
          </>
        ),
        code: servers("context_servers", { ...stdio("."), env: {} }),
      },
      { title: "Verify", body: "Settings, AI, MCP Servers: a green dot and “Server is active”." },
    ],
  },
  {
    id: "cline",
    name: "Cline",
    mark: <LetterMark letter="C" />,
    needsRoot: true,
    steps: [
      INSTALL,
      {
        title: "Add the server",
        body: (
          <>
            Cline&apos;s MCP Servers panel, Configure, opens <code>cline_mcp_settings.json</code>. Cline starts servers
            outside the project, so give the absolute path:
          </>
        ),
        code: (root) => servers("mcpServers", { ...stdio(root), disabled: false, autoApprove: [] }),
      },
      { title: "Or with the Cline CLI", code: (root) => `cline mcp add ctxfile --yes -- ctxfile --root ${quotePath(root)}` },
      connectStep("cline"),
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
            In <code>opencode.json</code> in the project, or <code>~/.config/opencode/opencode.json</code>. OpenCode 2
            also takes <code>opencode mcp add ctxfile -- ctxfile --root .</code>.
          </>
        ),
        code: json({
          $schema: "https://opencode.ai/config.json",
          mcp: { ctxfile: { type: "local", command: ["ctxfile", "--root", "."], enabled: true } },
        }),
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
      { title: "Verify", code: "opencode mcp list" },
    ],
  },
  {
    id: "warp",
    name: "Warp",
    mark: <LetterMark letter="W" />,
    steps: [
      INSTALL,
      {
        title: "Add the server",
        body: (
          <>
            In the project&apos;s <code>.warp/.mcp.json</code>. Warp starts project servers from the repo root, so{" "}
            <code>--root .</code> works; press Start in Settings, Agents, MCP servers. In the global{" "}
            <code>~/.warp/.mcp.json</code>, use an absolute path instead.
          </>
        ),
        code: servers("mcpServers", stdio(".")),
      },
    ],
  },
  {
    id: "copilot-cli",
    name: "Copilot CLI",
    mark: <LetterMark letter="G" />,
    steps: [
      INSTALL,
      {
        title: "Register the server",
        body: (
          <>
            Writes <code>~/.copilot/mcp-config.json</code>.
          </>
        ),
        code: "copilot mcp add ctxfile -- ctxfile --root .",
      },
    ],
  },
  {
    id: "goose",
    name: "Goose",
    mark: <LetterMark letter="G" />,
    needsRoot: true,
    steps: [
      {
        title: "Add it in one click",
        body: "Goose links run ctxfile through npx, so no global install is needed. It loads in your next session.",
        links: [
          {
            label: "Add to Goose",
            href: (root) =>
              `goose://extension?cmd=npx&arg=-y&arg=ctxfile&arg=--root&arg=${encodeURIComponent(root)}&id=ctxfile&name=ctxfile&description=${encodeURIComponent(
                "Project context, threads, and tasks"
              )}&timeout=300`,
          },
        ],
      },
      {
        title: "Or edit config.yaml",
        body: (
          <>
            In <code>~/.config/goose/config.yaml</code>:
          </>
        ),
        code: (root) =>
          `extensions:\n  ctxfile:\n    name: ctxfile\n    type: stdio\n    cmd: npx\n    args: ${JSON.stringify(["-y", "ctxfile", "--root", root])}\n    enabled: true\n    timeout: 300`,
      },
    ],
  },
  {
    id: "lm-studio",
    name: "LM Studio",
    mark: <LetterMark letter="L" />,
    needsRoot: true,
    steps: [
      INSTALL,
      {
        title: "Add it in one click",
        body: "LM Studio 0.3.17 or newer.",
        links: [
          {
            label: "Add to LM Studio",
            href: (root) => `lmstudio://add_mcp?name=ctxfile&config=${encodeURIComponent(base64(JSON.stringify(stdio(root))))}`,
          },
        ],
      },
      {
        title: "Or edit mcp.json",
        body: "Program tab, Install, Edit mcp.json:",
        code: (root) => servers("mcpServers", stdio(root)),
      },
    ],
  },
  {
    id: "kiro",
    name: "Kiro",
    mark: <LetterMark letter="K" />,
    needsRoot: true,
    steps: [
      INSTALL,
      {
        title: "Add it in one click",
        body: "Kiro asks you to confirm, then writes it to your user config.",
        links: [
          {
            label: "Add to Kiro",
            href: (root) => `https://kiro.dev/launch/mcp/add?name=ctxfile&config=${encodeURIComponent(JSON.stringify(stdio(root)))}`,
          },
        ],
      },
      {
        title: "Or edit mcp.json",
        body: (
          <>
            <code>~/.kiro/settings/mcp.json</code>, or the workspace&apos;s <code>.kiro/settings/mcp.json</code>:
          </>
        ),
        code: (root) => servers("mcpServers", stdio(root)),
      },
      connectStep("kiro"),
    ],
  },
  {
    id: "jetbrains",
    name: "JetBrains",
    mark: <LetterMark letter="J" />,
    needsRoot: true,
    steps: [
      INSTALL,
      {
        title: "AI Assistant",
        body: "Settings, Tools, AI Assistant, Model Context Protocol (MCP), Add, then paste:",
        code: (root) => servers("mcpServers", stdio(root)),
      },
      {
        title: "Junie",
        body: (
          <>
            Tools, Junie, MCP Settings, or <code>~/.junie/mcp/mcp.json</code> (project: <code>.junie/mcp/mcp.json</code>)
            with the same JSON. <code>ctxfile connect junie</code> writes it for you.
          </>
        ),
      },
    ],
  },
  {
    id: "visual-studio",
    name: "Visual Studio",
    mark: <LetterMark letter="V" />,
    needsRoot: true,
    steps: [
      INSTALL,
      {
        title: "Add it in one click",
        body: "Visual Studio 2022 17.14 or newer, with GitHub Copilot.",
        links: [
          {
            label: "Install in Visual Studio",
            href: (root) => `https://vs-open.link/mcp-install?${encodeURIComponent(JSON.stringify({ name: "ctxfile", type: "stdio", ...stdio(root) }))}`,
          },
        ],
      },
      {
        title: "Or edit .mcp.json",
        body: (
          <>
            <code>%USERPROFILE%\.mcp.json</code>, or <code>.mcp.json</code> in the solution folder:
          </>
        ),
        code: (root) => servers("servers", { type: "stdio", ...stdio(root) }),
      },
    ],
  },
  {
    id: "amp",
    name: "Amp",
    mark: <LetterMark letter="A" />,
    steps: [
      INSTALL,
      {
        title: "Register the server",
        body: (
          <>
            Add <code>--workspace</code> to keep it in this project&apos;s <code>.amp/settings.json</code> (then{" "}
            <code>amp mcp approve ctxfile</code>).
          </>
        ),
        code: "amp mcp add ctxfile -- ctxfile --root .",
      },
    ],
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    mark: <OpenClawMark />,
    needsRoot: true,
    steps: [
      INSTALL,
      {
        title: "Register the server",
        body: "OpenClaw's gateway does not run from your project, so give the absolute path:",
        code: (root) => `openclaw mcp set ctxfile '${JSON.stringify(stdio(root))}'`,
      },
      { title: "Verify", code: "openclaw mcp probe ctxfile" },
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
            In <code>~/.hermes/config.yaml</code>. Hermes fills in <code>{WORKSPACE}</code> with the session&apos;s
            folder:
          </>
        ),
        code: `mcp_servers:\n  ctxfile:\n    command: "ctxfile"\n    args: ["--root", "${WORKSPACE}"]`,
      },
      {
        title: "Verify",
        body: (
          <>
            Tools show up as <code>mcp_ctxfile_get_context</code> and friends. In a session, run{" "}
            <code>/reload-mcp</code>.
          </>
        ),
        code: "hermes mcp test ctxfile",
      },
    ],
  },
  {
    id: "mistral-vibe",
    name: "Mistral Vibe",
    mark: <LetterMark letter="M" />,
    needsRoot: true,
    steps: [
      INSTALL,
      {
        title: "Add the server",
        body: (
          <>
            In <code>~/.vibe/config.toml</code>:
          </>
        ),
        code: (root) =>
          `[[mcp_servers]]\nname = "ctxfile"\ntransport = "stdio"\ncommand = "ctxfile"\nargs = ${JSON.stringify(["--root", root])}`,
      },
      { title: "Verify", body: "Run /mcp status in a Vibe session." },
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
            Aider has no MCP client, so use the exported artifact instead. Run this and add the file to the chat with{" "}
            <code>/read .ctxfile/context.json</code>:
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
    name: "ChatGPT / Claude.ai / Grok",
    mark: <GrokMark />,
    steps: [
      {
        title: "Web and hosted apps connect through Sync",
        body: (
          <>
            ChatGPT (developer mode), Claude.ai, Grok, Perplexity, Le Chat, and Copilot Studio only reach remote MCP
            servers, so they connect to your encrypted Sync vault through the relay&apos;s connector URL. The
            walkthrough for each is on the <a href="/docs/webchat">web chatbots page</a>.
          </>
        ),
      },
    ],
  },
];

/** Quotes a path for a shell line when it has spaces or quotes. */
function quotePath(root: string): string {
  return /^[\w./:\\-]+$/.test(root) ? root : `'${root.replace(/'/g, "'\\''")}'`;
}

function resolve(value: WithRoot, root: string): string {
  return typeof value === "function" ? value(root) : value;
}

export function ClientSetup() {
  const [active, setActive] = useState(CLIENTS[0]!.id);
  const [root, setRoot] = useState("");

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
  const typedRoot = root.trim();
  const effectiveRoot = typedRoot || PLACEHOLDER_ROOT;

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
        {client.needsRoot ? (
          <label className="cs-root">
            <span>Your project folder (absolute path; it stays in this page)</span>
            <input
              type="text"
              value={root}
              placeholder={PLACEHOLDER_ROOT}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setRoot(event.target.value)}
            />
          </label>
        ) : null}
        {client.steps.map((step, i) => (
          <div className="cs-step" key={i}>
            <div className="cs-step-head">
              <span className="cs-step-num">{i + 1}</span>
              <h3>{step.title}</h3>
            </div>
            {step.body ? <p>{step.body}</p> : null}
            {step.links ? (
              <p className="cs-install-row">
                {step.links.map((link) => {
                  const waiting = client.needsRoot && typeof link.href === "function" && typedRoot === "";
                  return waiting ? (
                    <span key={link.label} className="cs-install" data-disabled="true" title="Enter your project folder above first">
                      {link.label}
                    </span>
                  ) : (
                    <a key={link.label} className="cs-install" href={resolve(link.href, effectiveRoot)}>
                      {link.label}
                    </a>
                  );
                })}
              </p>
            ) : null}
            {step.code ? <StepCode code={resolve(step.code, effectiveRoot)} /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Config snippets are JSON, YAML, or TOML; anything else is a shell line. */
function guessLang(code: string): Lang {
  const t = code.trimStart();
  if (t.startsWith("[[")) return "toml";
  if (t.startsWith("{") || t.startsWith("[")) return "json";
  if (/^[\w-]+:\s*(\n|$)/m.test(t) && !t.includes("=")) return "yaml";
  if (/^\[[^\]]+\]\s*$/m.test(t)) return "toml";
  return "bash";
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
        <code>{highlight(code, guessLang(code))}</code>
      </pre>
      <button className="cs-copy" onClick={copy} data-copied={copied} aria-label="Copy snippet">
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
