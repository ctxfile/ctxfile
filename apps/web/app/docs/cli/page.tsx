import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "CLI reference",
  description:
    "Every ctxfile command, flag, and environment variable: server, serve, ui, export, hooks, ingest, threads, activate.",
};

export default function Cli() {
  return (
    <>
      <h1>CLI reference</h1>
      <p className="lede">
        One binary. The default command is the MCP server itself; everything else is tooling around it. All
        diagnostics go to stderr; stdout is reserved for MCP JSON-RPC (default command), listings, or the
        export payload (<code>export --stdout</code>).
      </p>

      <h2>ctxfile (default: the MCP server)</h2>
      <pre>
        <code>ctxfile [--root &lt;dir&gt;] [--config &lt;path&gt;]</code>
      </pre>
      <p>
        Starts the stdio MCP server. Your client (Claude Code, Cursor, Claude Desktop) spawns this process,
        talks JSON-RPC over stdin/stdout, and stops it when done. Nothing listens on the network. See{" "}
        <Link href="/docs/mcp">MCP surface</Link> for what it exposes.
      </p>

      <h2>ctxfile init / pause / resume</h2>
      <pre>
        <code>{`ctxfile init              # consent prompt, then installs the behavior pack per detected harness
ctxfile init --yes        # non-interactive consent
ctxfile init --no-auto    # record that auto-capture stays off
ctxfile init --uninstall  # reverse init: remove the behavior files + consent
ctxfile init --print <h>  # print one render: claude-code|cursor|agents-md|codex|generic
ctxfile pause             # refuse all automatic checkpoints (manual saves unaffected)
ctxfile resume            # re-enable`}</code>
      </pre>
      <p>
        The <Link href="/docs/automatic">Behavior Layer</Link>: agents checkpoint on their own, announced
        every time. <code>ctxfile threads private &lt;id&gt;</code> excludes a single thread from
        auto-capture.
      </p>

      <h2>ctxfile serve (Pro)</h2>
      <pre>
        <code>ctxfile serve [--port &lt;n&gt;] [--host &lt;h&gt;] [--root &lt;dir&gt;] [--config &lt;path&gt;]</code>
      </pre>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Flag</th>
              <th>Default</th>
              <th>Effect</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>--port</td>
              <td>4949 (or <code>serve.port</code>)</td>
              <td>Port for the Streamable HTTP endpoint at <code>/mcp</code>.</td>
            </tr>
            <tr>
              <td>--host</td>
              <td>127.0.0.1 (or <code>serve.host</code>)</td>
              <td>
                Bind address. Anything beyond loopback is refused unless <code>serve.tokens</code> is
                configured.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The HTTP door: the same five core tools over Streamable HTTP, one MCP session per client, each session
        bound to the bearer token that opened it. Tokens are named env vars with{" "}
        <code>read:context</code>/<code>write:sessions</code> scopes; without tokens the server is
        loopback-only and DNS-rebinding-protected. Pro tools stay on stdio. See{" "}
        <Link href="/docs/sync">Sync &amp; roaming</Link> for the config shape and where this door leads.
      </p>

      <h2>ctxfile ui</h2>
      <pre>
        <code>ctxfile ui [--port &lt;n&gt;] [--no-open] [--root &lt;dir&gt;] [--config &lt;path&gt;]</code>
      </pre>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Flag</th>
              <th>Default</th>
              <th>Effect</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>--port</td>
              <td>4747</td>
              <td>Dashboard port; if busy, the next 10 ports are tried automatically.</td>
            </tr>
            <tr>
              <td>--no-open</td>
              <td>off</td>
              <td>Print the URL instead of opening the browser.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The server binds to <code>127.0.0.1</code> only and prints a URL carrying a one-time access token in
        the fragment (<code>#token=...</code>), which never appears in HTTP requests or logs. See{" "}
        <Link href="/docs/dashboard">Dashboard</Link>.
      </p>

      <h2>ctxfile export</h2>
      <pre>
        <code>ctxfile export [--profile repo-safe|full|custom] [--stdout] [--root &lt;dir&gt;] [--config &lt;path&gt;]</code>
      </pre>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Flag</th>
              <th>Default</th>
              <th>Effect</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>--profile</td>
              <td>repo-safe (or <code>export.profile</code> from config)</td>
              <td>
                Redaction profile. <code>full</code> prints a loud warning; <code>custom</code> uses the{" "}
                <code>export.include</code> allowlist.
              </td>
            </tr>
            <tr>
              <td>--stdout</td>
              <td>off</td>
              <td>
                Write the JSON envelope to stdout for piping, instead of{" "}
                <code>.ctxfile/context.&#123;json,md&#125;</code>.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Export always rebuilds the snapshot first; it never serves a cached one, so the artifact reflects the
        working tree as it is now. Details and the file format: <Link href="/docs/export">Cloud agents</Link>{" "}
        and the <Link href="/convention">.ctxfile convention</Link>.
      </p>

      <h2>ctxfile hooks</h2>
      <pre>
        <code>{`ctxfile hooks install     # add the managed pre-commit block
ctxfile hooks uninstall   # remove it`}</code>
      </pre>
      <p>
        Installs a managed block in <code>.git/hooks/pre-commit</code> that regenerates the repo-safe export
        and stages it, so every commit carries fresh context. It is idempotent (reinstalling updates the block
        in place), appends politely to a hook you already have, and is guarded so a failed export never blocks
        a commit. Worktrees and custom <code>core.hooksPath</code> setups are resolved through git itself.
      </p>

      <h2>ctxfile ingest</h2>
      <pre>
        <code>{`ctxfile ingest list       # this project's agent-reported sessions
ctxfile ingest rm <id>    # delete one record by its listed id`}</code>
      </pre>
      <p>
        Reviews what agents pushed through <code>ingest_context</code> or <code>save_session</code>: id,
        harness, session id, revision, last update, thread (when attached), and the summary head. Provenance
        and the full flow: <Link href="/docs/ingest">Agent-assisted sessions</Link>.
      </p>

      <h2>ctxfile threads</h2>
      <pre>
        <code>ctxfile threads           # id, title, session count, last active, last surface</code>
      </pre>
      <p>
        The durable work identities sessions attach to, most recently active first. Threads are created by
        saving a session with a thread name; there is deliberately no create/delete ceremony here. See{" "}
        <Link href="/docs/threads">Threads &amp; handoff</Link>.
      </p>

      <h2>ctxfile activate</h2>
      <pre>
        <code>ctxfile activate &lt;license-key&gt;</code>
      </pre>
      <p>
        Stores a Pro license key under <code>~/.ctxfile/</code>. The Ed25519 signature is verified locally when
        the server starts; there is no activation server and no network call. See{" "}
        <Link href="/docs/pro">Pro</Link>.
      </p>

      <h2>Global flags</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Flag</th>
              <th>Default</th>
              <th>Effect</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>--root &lt;dir&gt;</td>
              <td>current directory</td>
              <td>Project root to snapshot. All file access is scoped to it.</td>
            </tr>
            <tr>
              <td>--config &lt;path&gt;</td>
              <td>&lt;root&gt;/.ctxfile.json</td>
              <td>Explicit config file location.</td>
            </tr>
            <tr>
              <td>--version, -v</td>
              <td></td>
              <td>Print the version and exit.</td>
            </tr>
            <tr>
              <td>--help, -h</td>
              <td></td>
              <td>Print usage and exit.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Environment variables</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Variable</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>NOTION_TOKEN</td>
              <td>
                Notion integration token; activates the Notion connector together with{" "}
                <code>notion.pageIds</code>.
              </td>
            </tr>
            <tr>
              <td>OLLAMA_BASE_URL</td>
              <td>
                Overrides <code>ollama.baseUrl</code> (default <code>http://localhost:11434</code>).
              </td>
            </tr>
            <tr>
              <td>Consult API keys</td>
              <td>
                Read from whichever env vars you name in <code>consult.providers[].apiKeyEnv</code>. Keys never
                live in config files.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Exit behavior</h2>
      <p>
        Errors print a single <code>ctxfile: ...</code> line to stderr and exit non-zero. The default command
        runs until the client closes stdio.
      </p>
    </>
  );
}
