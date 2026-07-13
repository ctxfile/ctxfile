import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Quickstart",
  description: "Install ctxfile, register it with Claude Code or Cursor, and load your first snapshot.",
};

export default function Quickstart() {
  return (
    <>
      <h1>Quickstart</h1>
      <p className="lede">
        ctxfile is a local-first MCP server that snapshots your project&apos;s working state (plan, key
        files, git state, optionally more) into one structured context object any MCP client can load. Install
        to first snapshot takes about a minute.
      </p>

      <h2>Install</h2>
      <pre>
        <code>npm install -g ctxfile</code>
      </pre>
      <p>
        This gives you the <code>ctxfile</code> binary. It runs as an MCP server over stdio. Your client
        starts it, talks to it, and stops it. Nothing listens on the network.
      </p>
      <pre>
        <code>ctxfile --root &lt;dir&gt;</code>
      </pre>
      <p>
        <code>--root</code> defaults to the current working directory. Configuration is optional: see{" "}
        <Link href="/docs/configuration">Configuration</Link>.
      </p>

      <h2>Register with Claude Code</h2>
      <pre>
        <code>claude mcp add ctxfile -- ctxfile --root .</code>
      </pre>

      <h2>Register with Cursor</h2>
      <p>
        Add to <code>.cursor/mcp.json</code> (per-project) or <code>~/.cursor/mcp.json</code> (global):
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

      <h2>What your agent sees</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Surface</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>get_context</td>
              <td>
                Tool the model calls to pull the snapshot. Optional <code>scope</code>:{" "}
                <code>full</code> | <code>plan</code> | <code>files</code> | <code>git</code>.
              </td>
            </tr>
            <tr>
              <td>ingest_context</td>
              <td>
                Any agent pushes its own session digest in: the universal session capture for unsupported
                harnesses. See <Link href="/docs/ingest">Agent-assisted sessions</Link>.
              </td>
            </tr>
            <tr>
              <td>context://current</td>
              <td>Resource returning the full ContextObject as JSON.</td>
            </tr>
            <tr>
              <td>context://plan · context://git</td>
              <td>Scoped resources: just the plan, just the git state.</td>
            </tr>
            <tr>
              <td>load-context</td>
              <td>Prompt that injects the snapshot into the conversation.</td>
            </tr>
            <tr>
              <td>remember · recall · forget · consult · transcribe_voice</td>
              <td>
                Pro tools, registered per licensed feature. See <Link href="/docs/mcp">MCP surface</Link>.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        In practice: open your agent, say &ldquo;load context&rdquo; or let it call <code>get_context</code>, and
        it starts working with your plan, key files, and git state already in hand. No re-explaining. The full
        reference is on <Link href="/docs/mcp">MCP surface</Link>.
      </p>

      <h2>Cloud agents</h2>
      <pre>
        <code>ctxfile export</code>
      </pre>
      <p>
        Agents that don&apos;t run on your machine (hosted coding agents, CI bots) read a committed{" "}
        <code>.ctxfile/context.json</code> instead of talking MCP. The default profile is repo-safe. See{" "}
        <Link href="/docs/export">Cloud agents &amp; export</Link>.
      </p>

      <h2>Local dashboard</h2>
      <pre>
        <code>ctxfile ui</code>
      </pre>
      <p>
        Opens a dashboard bound to <code>127.0.0.1</code>. It is never exposed to your network. The access token
        is carried in the URL fragment, which never leaves the browser in HTTP requests.
      </p>

      <h2>Next steps</h2>
      <ul>
        <li>
          The complete <Link href="/docs/cli">CLI reference</Link> and <Link href="/docs/mcp">MCP surface</Link>.
        </li>
        <li>
          <Link href="/docs/configuration">Configure</Link> token budgets, includes/excludes, and opt-in
          connectors.
        </li>
        <li>
          Read the <Link href="/docs/privacy">privacy model</Link>: what runs locally (everything, by default)
          and what each opt-in enables.
        </li>
        <li>
          Tour the <Link href="/docs/dashboard">dashboard</Link>, then see{" "}
          <Link href="/docs/clients">client setup</Link> for Claude Desktop, MCP Inspector, and generic stdio
          clients.
        </li>
      </ul>
    </>
  );
}
