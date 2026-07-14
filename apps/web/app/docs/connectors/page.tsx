import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Connectors",
  description: "What each connector reads, when it runs, and how it degrades.",
};

export default function Connectors() {
  return (
    <>
      <h1>Connectors</h1>
      <p className="lede">
        A snapshot is assembled by independent connectors. Each one is separately failable: a broken connector
        degrades to an <code>error</code> entry in <code>meta.connectors</code>. It never crashes the snapshot.
      </p>

      <h2>file</h2>
      <p>
        Walks the project from your configured root, <code>.gitignore</code>-aware, honoring your{" "}
        <code>include</code>/<code>exclude</code> patterns. Denied paths (<code>.env*</code>, key files,
        credential files) are never read at all. Files are selected by rank (plan docs → README → manifests →
        entry points → recently modified), capped per file at <code>maxFileTokens</code> with head+tail
        truncation, and greedily fitted to the snapshot&apos;s <code>tokenBudget</code>. Every file&apos;s content
        passes redaction before it enters the snapshot.
      </p>

      <h2>git</h2>
      <p>
        Reads repository state: current branch, staged / modified / untracked files, ahead/behind counts against
        the upstream, recent commits, and a diff summary. Read-only. It never touches your working tree, index,
        or history.
      </p>

      <h2>notion: opt-in</h2>
      <p>
        Off until you set the <code>NOTION_TOKEN</code> environment variable <strong>and</strong> list explicit{" "}
        <code>notion.pageIds</code> in config. It fetches only the pages you named (no workspace crawling) and
        each page is processed in isolation, redacted like everything else.
      </p>

      <h2>ollama summarizer: opt-in</h2>
      <p>
        Off until you set <code>ollama.summarize: true</code>. Produces a digest of the working session using a
        model running on <strong>your</strong> machine via local Ollama (<code>ollama.baseUrl</code>, default{" "}
        <code>http://localhost:11434</code>). No cloud involved. Any installed model works here, tool
        support not required; set <code>ollama.model</code> or the first installed model is used. Note the
        summary rides in <code>get_context</code> and in exports under the <code>full</code> or{" "}
        <code>custom</code> profiles; the default <code>repo-safe</code> export excludes it by design (it is
        derived working state, not repository material).
      </p>

      <h2>Session connectors: Pro</h2>
      <p>
        Eight tools&apos; local session histories flow into the snapshot as redacted digests, so an agent in
        one tool picks up where an agent in another left off. All of them are read-only over the source
        tool&apos;s data, scope a global store down to <em>this</em> project, and cap each digest by filling a
        token budget from the newest turns backwards.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Connector</th>
              <th>Reads</th>
              <th>Scoped by</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>claude-code-sessions</td>
              <td>~/.claude/projects/&lt;encoded-path&gt;/*.jsonl</td>
              <td>Per-project directory; subagent sidechains skipped</td>
            </tr>
            <tr>
              <td>cursor-sessions</td>
              <td>~/.cursor project transcripts, else the global state.vscdb SQLite</td>
              <td>Project slug; SQLite fallback flagged &quot;workspace unverified&quot;</td>
            </tr>
            <tr>
              <td>codex-sessions</td>
              <td>$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl (Codex CLI / ChatGPT&apos;s coding agent)</td>
              <td>Session header cwd; huge rollouts are tail-read, never slurped</td>
            </tr>
            <tr>
              <td>opencode-sessions</td>
              <td>$XDG_DATA_HOME/opencode/opencode.db (SQLite, WAL)</td>
              <td>session.directory or the project worktree row</td>
            </tr>
            <tr>
              <td>gemini-sessions</td>
              <td>~/.gemini/tmp/*/chats/*.jsonl and legacy .json</td>
              <td>Session metadata directories/projectHash (folder naming changed across versions)</td>
            </tr>
            <tr>
              <td>aider-sessions</td>
              <td>.aider.chat.history.md at the repo root</td>
              <td>Already project-local; sessions split on chat headers</td>
            </tr>
            <tr>
              <td>openclaw-sessions</td>
              <td>$OPENCLAW_STATE_DIR/agents/*/sessions/*.jsonl</td>
              <td>Transcript header cwd; backup/reset/deleted variants skipped</td>
            </tr>
            <tr>
              <td>hermes-sessions</td>
              <td>$HERMES_HOME/state.db (Hermes Agent&apos;s SQLite, WAL)</td>
              <td>sessions.git_repo_root / cwd columns; archived and compacted rows skipped</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        SQLite-backed stores (Cursor, OpenCode, Hermes) may be locked by the live tool mid-write, so the
        connector <em>copies the database (with its WAL/SHM sidecars where present), opens the copy read-only,
        and deletes it afterwards</em>. Tool output, reasoning traces, and system/injected turns are excluded
        from digests everywhere; only real user and assistant turns count.
      </p>

      <h2>How session connectors degrade</h2>
      <p>
        Strictly best-effort: unknown formats, unreadable files, and schema drift degrade to an{" "}
        <code>error</code> status in <code>meta.connectors</code> (or an empty result) rather than ever failing
        a snapshot. Session content passes the same redaction as files. See <Link href="/docs/pro">Pro</Link>.
      </p>
      <p>
        And when a parser can&apos;t deliver, or your harness isn&apos;t on the list at all, the fallback is{" "}
        <Link href="/docs/ingest">agent-assisted ingest</Link> (free core): the agent pushes its own session
        digest through the <code>ingest_context</code> tool. Parsers are rung 1 of the ladder; ingest is the
        floor that covers every harness ever made.
      </p>

      <h2>Connector status in the snapshot</h2>
      <pre>
        <code>{`"meta": {
  "connectors": [
    { "name": "file",   "status": "ok",      "ms": 947 },
    { "name": "git",    "status": "ok",      "ms": 512 },
    { "name": "notion", "status": "skipped" }           // not configured
  ]
}`}</code>
      </pre>
      <p>
        <code>skipped</code> means an opt-in wasn&apos;t enabled; <code>error</code> means the connector failed
        and the snapshot proceeded without it.
      </p>
    </>
  );
}
