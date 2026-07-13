import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Agent-assisted sessions",
  description:
    "The ingest_context tool: any harness pushes its own session digest into ctxfile. The prompt is the adapter — works on every agent tool ever made, free core.",
};

const GENERIC_SNIPPET = `Review this entire session from the beginning. Then call the ctxfile
ingest_context tool with exactly this shape:

- ctxfile_ingest_schema: "2"
- source.harness: "custom:<your-tool-name>"   (lowercase, digits, hyphens)
- session.summary: a concise digest of what this session did and why
- session.key_decisions: the choices that will matter next session
- session.files_touched: paths you created or changed
- session.open_items: what is unfinished or blocked
- session.thread: the thread name, if I gave this work one

If the tool returns a validation error, fix the listed fields and call it
once more with the corrected payload.`;

const CLAUDE_CODE_SNIPPET = `Using our conversation so far, call the ctxfile ingest_context tool:
set ctxfile_ingest_schema to "2", source.harness to "claude-code",
and fill session.summary (what we did and why), session.key_decisions,
session.files_touched, and session.open_items from this session.
Include session.thread if I named this work. If validation fails,
correct the listed fields and retry once.`;

const CURSOR_SNIPPET = `Summarize this Cursor session, then call the ctxfile ingest_context tool:
ctxfile_ingest_schema "2", source.harness "cursor", session.summary with
the digest, plus key_decisions, files_touched, and open_items arrays.
On a validation error, fix the listed fields and call it again.`;

const CODEX_SNIPPET = `Recall what this session accomplished, then call the ctxfile
ingest_context tool: ctxfile_ingest_schema "2", source.harness "codex",
session.summary with a concise digest, and key_decisions / files_touched /
open_items arrays. If the tool rejects the payload, fix the fields it
lists and retry once.`;

export default function IngestDocs() {
  return (
    <>
      <h1>Agent-assisted sessions</h1>
      <p className="lede">
        The session parsers reach into each tool&apos;s internal storage, and internals change.{" "}
        <code>ingest_context</code> inverts the direction: the harness&apos;s own agent formats its session
        against a published schema and pushes it in. The prompt is the adapter, which means every harness that
        speaks MCP is supported, including ones that don&apos;t exist yet. Free core.
      </p>

      <h2>The fallback ladder</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Rung</th>
              <th>Mechanism</th>
              <th>When</th>
              <th>Tier</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>
                <Link href="/docs/connectors">Automatic parsers</Link> (8 tools)
              </td>
              <td>Default on supported harnesses; invisible</td>
              <td>Pro</td>
            </tr>
            <tr>
              <td>2</td>
              <td>
                <strong>ingest_context</strong> + a pasted prompt
              </td>
              <td>Parser unavailable, broken, or stale; any unsupported harness</td>
              <td>Free core</td>
            </tr>
            <tr>
              <td>3</td>
              <td>
                <Link href="/docs/export">Manual export/import</Link>
              </td>
              <td>Everything else</td>
              <td>Free core</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Parsers stay the polished default; ingest is the universal floor. If sessions look empty or stale in
        the dashboard, rung 2 is the fix, and the dashboard hands you the prompt.
      </p>

      <div className="callout">
        <p>
          Two doors, one schema: <code>ingest_context</code> (this page) is the enveloped bulk/agent door;{" "}
          <code>save_session</code> takes the same session fields directly and infers the harness from the
          connected client. Both feed the same store, and both understand threads and handoffs. See{" "}
          <Link href="/docs/threads">Threads &amp; handoff</Link>.
        </p>
      </div>

      <h2>How it works</h2>
      <ol>
        <li>You paste a short prompt into whatever agent you&apos;re using (snippets below).</li>
        <li>The agent summarizes its own session and calls <code>ingest_context</code>.</li>
        <li>
          ctxfile validates strictly, redacts, stamps provenance, and stores the record locally. Malformed
          payloads come back with field-by-field errors the agent fixes itself.
        </li>
        <li>
          The digest appears in the <code>sessions</code> array of the next snapshot, loudly labeled{" "}
          <code>(agent-reported via ingest_context)</code>.
        </li>
      </ol>

      <h2>The schema, version 2</h2>
      <pre>{`{
  "ctxfile_ingest_schema": "2",           // "1" payloads are still accepted
  "source": {
    "harness": "claude-code | cursor | codex | opencode | gemini-cli | aider | openclaw | hermes
              | chatgpt | claude | grok | perplexity | le-chat | custom:<name>",
    "harness_version": "optional"
  },
  "session": {
    "session_id": "harness-native id if available (else ctxfile hashes the content)",
    "started_at": "ISO 8601 or null",
    "ended_at": "ISO 8601 or null",
    "summary": "required: what the session did and why",
    "key_decisions": ["..."],
    "files_touched": ["..."],
    "open_items": ["..."],

    // v2: threads and lineage
    "thread": "durable thread title, e.g. Q3 campaign (optional)",
    "continues_from": "session_id of the predecessor session (optional)",

    // v2: the handoff package; all six enforced when handoff is true
    "handoff": false,
    "state": "done / in progress / not started",
    "gotchas": ["what the next agent would trip on"],
    "artifacts": [{ "ref": "src/api.ts", "role": "endpoint being migrated" }],
    "suggested_first_prompt": "the prompt whoever resumes should start from"
  }
}`}</pre>
      <p>
        Limits: summary up to 8,000 characters, list items up to 500 each, 20 ingests per minute (shared with
        save_session). Unknown fields are rejected, not ignored, so drifted prompts fail loudly instead of
        storing garbage. Version &quot;1&quot; payloads remain valid forever; they are v2 minus the thread and
        handoff fields. Threads, lineage, and the handoff contract are documented in{" "}
        <Link href="/docs/threads">Threads &amp; handoff</Link>.
      </p>

      <h2>Provenance and review</h2>
      <p>
        <code>ingest_context</code> is a write path fed by LLM output, so every record carries provenance from
        day one: which harness, when, <code>reported_by: agent</code>, and a revision history on re-ingest.
        Downstream agents see the content labeled as agent-reported untrusted data, the same posture as
        everything else in a snapshot. Review and prune any time:
      </p>
      <pre>{`ctxfile ingest list        # id, harness, session, revision, updated, summary
ctxfile ingest rm <id>     # delete one record`}</pre>
      <p>
        Dedup: records are identified by the harness&apos;s native session id (or a content hash). Re-ingesting
        the same session updates the record with history rather than duplicating it, and if a Pro parser
        reports the same session, <strong>the parser wins</strong>: higher-fidelity source.
      </p>

      <h2>Prompt snippets</h2>
      <p>
        Copy, paste into the agent, done. These are versioned with the schema; when a new harness ships, the
        &quot;connector&quot; is a markdown snippet, and community PRs for new harnesses are welcome.
      </p>
      <h3>Any MCP agent (generic)</h3>
      <pre>{GENERIC_SNIPPET}</pre>
      <h3>Claude Code</h3>
      <pre>{CLAUDE_CODE_SNIPPET}</pre>
      <h3>Cursor</h3>
      <pre>{CURSOR_SNIPPET}</pre>
      <h3>Codex CLI</h3>
      <pre>{CODEX_SNIPPET}</pre>

      <h2>What this is not</h2>
      <ul>
        <li>
          Not a replacement for the parsers: on supported harnesses the automatic path remains the Pro
          experience and wins conflicts.
        </li>
        <li>
          Not an open write API: ingest accepts session digests against this strict schema only. General
          writable context is the Team tier&apos;s design, behind permissions and audit.
        </li>
        <li>Not hosted anything: ingest is a local MCP tool, same trust boundary as the rest of ctxfile.</li>
      </ul>
    </>
  );
}
