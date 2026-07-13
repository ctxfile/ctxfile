import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "The ctxfile ui local dashboard: live snapshot runs, context explorer, git, sessions, memory, consult, settings, and how its security works.",
};

export default function Dashboard() {
  return (
    <>
      <h1>Dashboard</h1>
      <p className="lede">
        <code>ctxfile ui</code> starts a local dashboard: a cockpit for snapshots, the captured context, and
        Pro features. It is a viewer and control surface over the same engine the MCP server uses; agents never
        need it.
      </p>

      <h2>Starting it</h2>
      <pre>
        <code>{`ctxfile ui                # opens your browser
ctxfile ui --no-open      # just prints the URL
ctxfile ui --port 5000    # explicit port (default 4747)`}</code>
      </pre>
      <p>
        The printed URL carries a one-time access token in the URL fragment. Open the dashboard through that
        URL; a bare <code>http://127.0.0.1:4747</code> is refused. The server binds to <code>127.0.0.1</code>{" "}
        only, sends a strict Content-Security-Policy, and is never reachable from your network.
      </p>

      <h2>Views</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>View</th>
              <th>What it shows</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Overview</td>
              <td>
                Run snapshots and watch them live: each connector lights up as it starts and finishes (streamed
                over SSE), the token meter fills against the budget, and recent snapshots chart their token
                usage. Stats: tokens used, key files, redactions, snapshot age (flags stale).
              </td>
            </tr>
            <tr>
              <td>Context</td>
              <td>
                The captured ContextObject as a browsable tree: plan, every key file with its token count and
                redactions, git state, Notion pages, sessions. Scope switch (full / plan / files / git), raw
                JSON view, and &ldquo;Copy as agent payload&rdquo;.
              </td>
            </tr>
            <tr>
              <td>Git</td>
              <td>Staged / modified / untracked columns, recent commits, and the diff summary.</td>
            </tr>
            <tr>
              <td>Sessions (Pro)</td>
              <td>Claude Code and Cursor session digests, with source, turn count, and last activity.</td>
            </tr>
            <tr>
              <td>Memory (Pro)</td>
              <td>
                Every memory entry grouped by the agent that wrote it, with provenance and timestamps. Filter,
                and forget (permanently delete) any entry behind a confirmation.
              </td>
            </tr>
            <tr>
              <td>Consult (Pro)</td>
              <td>Ask your configured providers a question; answers stream in side-by-side columns.</td>
            </tr>
            <tr>
              <td>Settings</td>
              <td>
                The network gauge (how many remote opt-ins are enabled; 0 means fully local), resolved
                configuration, connector status, license activation and feature flags, and the privacy
                defaults.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Keyboard</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>R</td>
              <td>Run a snapshot.</td>
            </tr>
            <tr>
              <td>⌘K / Ctrl+K</td>
              <td>Command palette: jump to any view, run a snapshot, switch theme.</td>
            </tr>
            <tr>
              <td>Esc</td>
              <td>Close palettes and dialogs.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>License activation</h2>
      <p>
        Paste a Pro key into Settings → License (or run <code>ctxfile activate &lt;key&gt;</code>). Verification
        is local Ed25519; the tier, expiry, and per-feature flags render immediately. See{" "}
        <Link href="/docs/pro">Pro</Link>.
      </p>

      <h2>Behavior worth knowing</h2>
      <ul>
        <li>
          Snapshot runs are single-flight: pressing R during a run does not queue a second build.
        </li>
        <li>
          If the <code>ctxfile ui</code> process dies, the page shows a &ldquo;server unreachable&rdquo; overlay
          and reconnects automatically when you restart it.
        </li>
        <li>Dark and light themes; the toggle lives in the top bar and persists.</li>
      </ul>
    </>
  );
}
