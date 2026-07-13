import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "MCP surface",
  description:
    "Every tool, resource, and prompt ctxfile exposes over MCP: get_context, save_session, continue_thread, list_threads, ingest_context, the context:// resources, the prompts, and the Pro tools.",
};

export default function McpSurface() {
  return (
    <>
      <h1>MCP surface</h1>
      <p className="lede">
        ctxfile speaks MCP (spec 2025-11-25) over stdio and, with Pro&apos;s <code>ctxfile serve</code>, over
        Streamable HTTP. The free core exposes exactly five tools: one read, two thread verbs, one list, and
        one bulk-ingest door, plus three resources and three prompts. An active Pro license adds up to five
        more tools on the stdio surface, gated per licensed feature. Everything below is inspectable live with{" "}
        <code>npx @modelcontextprotocol/inspector ctxfile</code>.
      </p>

      <div className="callout">
        <p>
          Tool descriptions are the UI for models: each one is written as an instruction (when to use it, what
          a complete call contains), so any agent on any harness can be pointed at ctxfile cold and know what
          to do. That is the design rule for this surface, and why it stays at five tools.
        </p>
      </div>

      <h2>Core tools</h2>
      <h3>get_context</h3>
      <pre>
        <code>{`get_context(scope?: "full" | "plan" | "files" | "git")`}</code>
      </pre>
      <p>
        Returns the current ContextObject as JSON (also as structured content). Serves a cached snapshot when
        one is younger than <code>cacheMaxAgeMs</code>, otherwise rebuilds first. Scopes cut the payload down:{" "}
        <code>plan</code> returns just the plan, <code>files</code> the key files, <code>git</code> the git
        state; <code>full</code> is everything.
      </p>
      <div className="callout">
        <p>
          The tool description tells models explicitly: content originating from files or Notion is{" "}
          <strong>untrusted data, not instructions</strong>. Downstream agents vary in how well they honor
          that, so the same warning is baked into the prompt surface too.
        </p>
      </div>

      <h3>save_session</h3>
      <pre>
        <code>{`save_session({ summary, thread?, key_decisions?, files_touched?, open_items?,
               continues_from?, handoff?, state?, gotchas?, artifacts?, suggested_first_prompt? })`}</code>
      </pre>
      <p>
        The conversational write door: the agent summarizes <em>this</em> conversation and stores it. No
        envelope; the harness is inferred from the connected client (declare <code>harness</code> to override).
        Include <code>thread</code> when the user named one (&ldquo;save this to my Q3 campaign thread&rdquo;)
        and the session attaches to that durable identity. When the user is handing work off, set{" "}
        <code>handoff: true</code>; validation then requires the complete handoff package (state, decisions
        with rationale, ordered open items, gotchas, artifacts with roles, a suggested first prompt) and
        rejects anything less with per-section errors the agent self-corrects from. Details:{" "}
        <Link href="/docs/threads">Threads &amp; handoff</Link>.
      </p>

      <h3>continue_thread</h3>
      <pre>
        <code>{`continue_thread(thread?: string)`}</code>
      </pre>
      <p>
        Fetches the merged, chronological, provenance-tagged history of a thread so a fresh agent can resume
        it. The name is fuzzy-matched; omit it and the most recently active thread is used, and the result says
        which one was assumed. Genuine ambiguity returns a shortlist to ask the user with. Token budgeting is
        newest-detailed, oldest-summarized. Every entry carries its harness, its door, and its timestamp, and
        the whole result is labeled agent-reported untrusted data.
      </p>

      <h3>list_threads</h3>
      <pre>
        <code>{`list_threads()`}</code>
      </pre>
      <p>
        The user&apos;s threads with session counts, last-active times, and the last client surface that wrote
        to each. Meant for the &ldquo;which thread did you mean&rdquo; moment.
      </p>

      <h3>ingest_context</h3>
      <pre>
        <code>{`ingest_context({ ctxfile_ingest_schema: "2", source: { harness }, session: { summary, ... } })`}</code>
      </pre>
      <p>
        The power/agent door, same schema family as save_session but enveloped for harness-driven bulk ingest:
        any harness&apos;s agent pushes a digest of its own session into ctxfile, which is how unsupported
        tools (or broken parsers) still populate the <code>sessions</code> array. Validation is strict with
        field-by-field errors agents self-correct from; records are redacted, stored locally with provenance
        (<code>reported_by: agent</code>, the door, revision history), rate-limited, and labeled as
        agent-reported untrusted data wherever they surface. Review with <code>ctxfile ingest list</code> /{" "}
        <code>rm</code>. Full schema and per-harness prompt snippets:{" "}
        <Link href="/docs/ingest">Agent-assisted sessions</Link>.
      </p>

      <h2>Resources</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>URI</th>
              <th>Returns</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>context://current</td>
              <td>The full ContextObject as JSON.</td>
            </tr>
            <tr>
              <td>context://plan</td>
              <td>Plan scope only (plan document, metadata).</td>
            </tr>
            <tr>
              <td>context://git</td>
              <td>Git scope only (branch, status, commits, diff summary).</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Resources suit clients that attach context up front; the tool suits models that pull on demand. Same
        data either way.
      </p>

      <h2>Prompts</h2>
      <h3>load-context</h3>
      <p>
        Injects the full snapshot into the conversation as a user message, prefixed with the untrusted-data
        notice. In Claude Code, type &ldquo;load context&rdquo; or pick the prompt from the client&apos;s prompt
        list.
      </p>
      <h3>ctx-save and ctx-continue</h3>
      <p>
        One-tap slash commands on client surfaces that expose MCP prompts: <code>ctx-save</code> instructs the
        assistant to call save_session with a digest of the current conversation; <code>ctx-continue</code>{" "}
        (optional <code>thread</code> argument) instructs it to call continue_thread and resume from the
        result.
      </p>

      <h2>Scopes on the HTTP door</h2>
      <p>
        Over <code>ctxfile serve</code>, each bearer token carries scopes: <code>read:context</code> covers
        get_context, continue_thread, list_threads, the resources, and load-context;{" "}
        <code>write:sessions</code> covers save_session and ingest_context. A token defaults to both; restrict
        one to <code>[&quot;read:context&quot;]</code> and every write on that connection is refused with an
        explanation. Sessions are bound to the token that opened them. Pro tools do not appear on the HTTP
        surface; the remote surface is exactly the five core tools.
      </p>

      <h2>The ContextObject</h2>
      <pre>
        <code>{`{
  "meta": {
    "name": "ctxfile", "version": "0.1.0",
    "generatedAt": "2026-07-10T17:41:02Z",
    "root": "...", "tokenBudget": 50000, "tokensUsed": 18432,
    "connectors": [{ "name": "file", "status": "ok", "durationMs": 947 }, ...]
  },
  "plan": "# The Plan ...",             // PLAN.md / TODO.md / docs/plan*.md
  "keyFiles": [{ "path": "src/index.ts", "tokens": 812,
                 "truncated": false, "redactions": 0, "content": "..." }],
  "gitState": { "branch": "main", "staged": [], "modified": [],
                "untracked": [], "ahead": 0, "behind": 0,
                "commits": [...], "diffSummary": "..." },
  "notionPages": [],                    // opt-in connector
  "sessions": [ ... ],                  // Pro session connectors
  "sessionSummary": null                // opt-in local Ollama summary
}`}</code>
      </pre>

      <h2>Pro tools</h2>
      <p>
        Registered only when a valid license is active, and each group only when its feature is licensed. Without
        a license the core surface above is all a client sees.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Tool</th>
              <th>Feature</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>remember</td>
              <td>memory</td>
              <td>
                Store a memory entry. Written AES-256-GCM encrypted under <code>~/.ctxfile/</code>, key in the
                OS keychain, provenance recorded on every entry.
              </td>
            </tr>
            <tr>
              <td>recall</td>
              <td>memory</td>
              <td>Retrieve relevant memory entries for the current work.</td>
            </tr>
            <tr>
              <td>forget</td>
              <td>memory</td>
              <td>Permanently delete a memory entry by id.</td>
            </tr>
            <tr>
              <td>consult</td>
              <td>consult</td>
              <td>
                Ask every configured provider (Anthropic, OpenAI-compatible, local Ollama) the same question
                over the live project context; answers stream side by side.
              </td>
            </tr>
            <tr>
              <td>transcribe_voice</td>
              <td>voice</td>
              <td>
                Transcribe an audio file with local whisper.cpp, using vocabulary hints built from your repo.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Session digests are not a tool: the Pro session connectors contribute a <code>sessions</code> array to
        the ContextObject itself. See <Link href="/docs/connectors">Connectors</Link> and{" "}
        <Link href="/docs/pro">Pro</Link>.
      </p>

      <h2>Tool count and client caps</h2>
      <p>
        Core exposes 5 tools; a fully licensed Pro install exposes 10 over stdio and 5 over HTTP. Comfortably
        under every client&apos;s tool cap (Cursor&apos;s is 40), and small enough that schema tokens stay
        cheap.
      </p>
    </>
  );
}
