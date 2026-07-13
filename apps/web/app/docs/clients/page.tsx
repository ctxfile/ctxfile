import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Client setup",
  description: "Register ctxfile with Claude Code, Cursor, MCP Inspector, or any stdio MCP client.",
};

export default function Clients() {
  return (
    <>
      <h1>Client setup</h1>
      <p className="lede">
        ctxfile is a standard stdio MCP server, so any MCP client can run it. Install first:{" "}
        <code>npm install -g ctxfile</code>.
      </p>
      <p>
        Requires Node.js 20+ on macOS and Linux, and <strong>Node.js 22+ on Windows</strong> (a native dependency
        ships no Node 20 Windows prebuild). Node 22 and 24 are both current LTS lines.
      </p>

      <h2>Claude Code</h2>
      <pre>
        <code>claude mcp add ctxfile -- ctxfile --root .</code>
      </pre>
      <p>
        Run from your project directory (that&apos;s what <code>--root .</code> points at). Verify with{" "}
        <code>claude mcp list</code>.
      </p>

      <h2>Cursor</h2>
      <p>
        Add to <code>.cursor/mcp.json</code> in the project, or <code>~/.cursor/mcp.json</code> globally:
      </p>
      <pre>
        <code>{`{
  "mcpServers": {
    "ctxfile": {
      "command": "ctxfile",
      "args": ["--root", "."]
    }
  }
}`}</code>
      </pre>
      <p>ctxfile exposes a handful of tools, far under Cursor&apos;s 40-tool cap.</p>

      <h2>OpenCode</h2>
      <p>
        Add to <code>opencode.json</code> in the project (or the global config):
      </p>
      <pre>
        <code>{`{
  "mcp": {
    "ctxfile": {
      "type": "local",
      "command": ["ctxfile", "--root", "."],
      "enabled": true
    }
  }
}`}</code>
      </pre>
      <p>
        Pro also reads OpenCode&apos;s own session history through the session connectors, so context saved
        there follows you to every other client.
      </p>

      <h2>Claude Desktop</h2>
      <p>
        Download <code>ctxfile.mcpb</code> from the releases page and drag it into Settings → Extensions, or add
        the generic stdio JSON below to <code>claude_desktop_config.json</code>.
      </p>

      <h2>MCP Inspector</h2>
      <p>Inspect the server&apos;s tools, resources, and prompts interactively:</p>
      <pre>
        <code>npx @modelcontextprotocol/inspector ctxfile --root .</code>
      </pre>

      <h2>Generic stdio config</h2>
      <p>
        For any other MCP client (Claude Desktop, Cline, Windsurf, custom SDK clients), the shape is always the
        same, a command plus args, spoken to over stdio:
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
