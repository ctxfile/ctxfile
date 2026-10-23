import type { Metadata } from "next";
import { ClientSetup } from "../../../components/ClientSetup";

export const metadata: Metadata = {
  title: "How to add ctxfile to Claude Code, Cursor, Codex, and other MCP clients",
  description:
    "One command (ctxfile connect) or copy-paste setup for Claude Code, Cursor, VS Code, Windsurf, Codex CLI, OpenCode, Gemini CLI, Claude Desktop, and any stdio MCP client, with one-click install links where a client supports them.",
};

export default function Clients() {
  return (
    <>
      <h1>Client setup</h1>
      <p className="lede">
        ctxfile is a standard stdio MCP server, so any MCP client can run it. Pick your client; the same install
        serves all of them.
      </p>
      <p>
        Requires Node.js 20+ on macOS and Linux, and <strong>Node.js 22+ on Windows</strong> (a native dependency
        ships no Node 20 Windows prebuild). Node 22 and 24 are both current LTS lines.
      </p>

      <div className="agent-setup">
        <h2>Fastest: one command, or let your agent do it</h2>
        <p>
          <code>ctxfile connect</code> lists the MCP clients on your machine and registers ctxfile in the ones you
          pick. It drives a client&apos;s own <code>mcp add</code> command where there is one, and otherwise merges
          into its JSON config: only the <code>ctxfile</code> entry changes, every other server stays, and the old
          file is kept as <code>&lt;file&gt;.ctxfile-backup</code>.
        </p>
        <pre>{`npm install -g ctxfile
ctxfile connect              # what is on this machine
ctxfile connect --all        # connect every client found
ctxfile connect --print cursor   # just show the config and one-click link`}</pre>
        <p>
          Or paste this into any coding agent (Claude Code, Cursor, Codex, Gemini CLI) and it does the steps for
          you, asking before it changes anything:
        </p>
        <pre>{`Set up ctxfile for me by following https://ctxfile.dev/setup.md`}</pre>
      </div>

      <ClientSetup />

      <h2>Pro reads the other side too</h2>
      <p>
        Registering the server gets every client the same tools. Pro&apos;s session connectors additionally read
        each agent&apos;s own session history (Claude Code, Cursor, Codex, OpenCode, Gemini, Aider, OpenClaw,
        Hermes), so work done in one client shows up in <code>get_context</code> in all the others.
      </p>

      <h2>MCP Inspector</h2>
      <p>Inspect the server&apos;s tools, resources, and prompts interactively:</p>
      <pre>
        <code>npx @modelcontextprotocol/inspector ctxfile --root .</code>
      </pre>

      <h2>Generic stdio config</h2>
      <p>
        For any client not listed above (Cline, Windsurf, custom SDK clients), the shape is always the same, a
        command plus args, spoken to over stdio:
      </p>
      <pre>
        <code>{`{
  "command": "ctxfile",
  "args": ["--root", "/absolute/path/to/project"]
}`}</code>
      </pre>
      <p>
        Prefer an absolute <code>--root</code> when the client doesn&apos;t guarantee a working directory. Add{" "}
        <code>--config &lt;path&gt;</code> to point at a config file outside the project root.
      </p>

      <h2>Troubleshooting: &ldquo;command not found&rdquo; (nvm / version managers)</h2>
      <p>
        If the client reports the server failed to start, discovered no tools, or shows only an auth item, the
        usual cause is not ctxfile but your <strong>Node install</strong>: desktop MCP clients (Cursor, Claude
        Desktop) are GUI apps that don&apos;t always inherit your shell&apos;s <code>PATH</code>, so a{" "}
        <code>node</code>, <code>npx</code>, or <code>ctxfile</code> managed by <strong>nvm</strong> (or a
        non-standard Homebrew prefix) isn&apos;t found. This affects every stdio MCP server, not just ctxfile.
      </p>
      <p>The reliable fix is to use absolute paths in the config. Find yours:</p>
      <pre>
        <code>{`which node        # e.g. /Users/you/.nvm/versions/node/v24.11.0/bin/node
npm root -g       # e.g. /Users/you/.nvm/versions/node/v24.11.0/lib/node_modules`}</code>
      </pre>
      <p>Then point the client at the absolute Node binary running ctxfile&apos;s entry file:</p>
      <pre>
        <code>{`{
  "mcpServers": {
    "ctxfile": {
      "command": "/Users/you/.nvm/versions/node/v24.11.0/bin/node",
      "args": [
        "/Users/you/.nvm/versions/node/v24.11.0/lib/node_modules/ctxfile/dist/cli.js",
        "--root", "."
      ]
    }
  }
}`}</code>
      </pre>
      <p>
        Give the absolute <code>node</code> path directly rather than the <code>ctxfile</code> command, because
        the <code>ctxfile</code> launcher&apos;s <code>#!/usr/bin/env node</code> line would still need{" "}
        <code>node</code> on the client&apos;s <code>PATH</code>. Restarting the client from a terminal that has
        your <code>PATH</code> loaded also works, but the absolute-path config survives restarts.
      </p>
    </>
  );
}
