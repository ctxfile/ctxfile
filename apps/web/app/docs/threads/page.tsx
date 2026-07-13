import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Threads & handoff",
  description:
    "Threads are durable work identities that outlive any one provider's chat history: save_session, continue_thread, list_threads, and the enforced handoff package.",
};

export default function ThreadsDocs() {
  return (
    <>
      <h1>Threads &amp; handoff</h1>
      <p className="lede">
        A chat history belongs to one provider. A <strong>thread</strong> belongs to you: a durable identity
        (&ldquo;Q3 campaign&rdquo;, &ldquo;billing bug&rdquo;) that sessions from any client surface attach to,
        so work started in one tool resumes in another. Threads are free core and fully local; Sync replicates
        them later without changing the model.
      </p>

      <h2>The model</h2>
      <pre>{`thread   { id, title, status, tags, created_at, last_active }
session  { ..., thread_id, continues_from }   // an ingested digest`}</pre>
      <p>
        Sessions attach to threads by <code>thread</code> title on save. Lineage runs through{" "}
        <code>continues_from</code> (the predecessor&apos;s session id), which also inherits the thread when
        the reporting agent never names one. The result is a provenance chain across providers: a ChatGPT
        digest, a Claude continuation, a local Cursor session, one timeline. Everything lives in the same local
        SQLite as <Link href="/docs/ingest">session ingest</Link>.
      </p>

      <h2>Saving: save_session</h2>
      <pre>{`"Save this session to ctxfile, thread Q3 campaign."`}</pre>
      <p>
        The agent summarizes the conversation and calls <code>save_session</code> with the digest and the
        thread name. No envelope, no harness enum to memorize: the client surface is inferred from the MCP
        client info (declare <code>harness</code> to override). Records are redacted at write,
        provenance-stamped (<code>reported_by: agent</code>, the door, revision history), and reviewable with{" "}
        <code>ctxfile ingest list</code>.
      </p>

      <h2>Resuming: continue_thread</h2>
      <pre>{`"Pick up my Q3 campaign thread. What were we doing?"`}</pre>
      <p>The resolution rules are built for &ldquo;you know what I mean&rdquo;:</p>
      <ul>
        <li>A named thread is fuzzy-matched against titles and tags (exact, containment, token overlap).</li>
        <li>
          No name defaults to the most recently active thread, and the result says so:{" "}
          <em>Resuming &ldquo;Q3 campaign&rdquo; (assumed: most recently active thread)</em>.
        </li>
        <li>Genuine ambiguity returns a shortlist so the agent can ask the user instead of guessing.</li>
      </ul>
      <p>
        The result is the merged, chronological history: every entry labeled with its harness, its door, and
        its timestamp; token budgeting keeps the newest sessions detailed and summarizes the older ones; the
        latest open items ride on top. The whole payload is marked agent-reported untrusted data, and it ends
        by pointing the model at <code>get_context</code> for the full project snapshot.
      </p>

      <h2>The handoff package</h2>
      <p>
        &ldquo;Hand this off so someone else can take over&rdquo; has a defined meaning here. When the agent
        sets <code>handoff: true</code>, validation enforces everything a cold takeover needs, and rejects
        anything less with per-section errors the agent self-corrects from:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Section</th>
              <th>What it must contain</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>state</td>
              <td>What is done, what is in progress, what is not started.</td>
            </tr>
            <tr>
              <td>key_decisions</td>
              <td>The choices made and the rationale, the part chat history loses first.</td>
            </tr>
            <tr>
              <td>open_items</td>
              <td>Next actions, ordered, with blockers named.</td>
            </tr>
            <tr>
              <td>gotchas</td>
              <td>Quirks, constraints, dead ends already tried.</td>
            </tr>
            <tr>
              <td>artifacts</td>
              <td>Files/docs/links that matter, each with a one-line role.</td>
            </tr>
            <tr>
              <td>suggested_first_prompt</td>
              <td>The prompt the next agent should receive to resume cold.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Because the contract lives in the tool description and the validator, any agent on any harness produces
        the same artifact without per-agent training. That is the point: the intelligence lives in the MCP
        surface. A handoff is presented with priority when the thread is resumed, suggested first prompt
        included.
      </p>

      <h2>Person-to-person takeover</h2>
      <p>
        A thread will be shareable via a <strong>handoff grant</strong>: a scoped, revocable, read-only token
        for one thread. The recipient adds the ctxfile connector, redeems the grant, and their agent calls{" "}
        <code>continue_thread</code> on it. Grants respect redaction profiles, expire by default, and every
        redemption is audit-logged. Grants ship with the Sync relay (the second beat of this launch); the
        provenance and token machinery they build on is already in the core you&apos;re reading about. Full
        multi-user shared context stays the Team tier.
      </p>

      <h2>Seeing what you have</h2>
      <pre>{`ctxfile threads            # id, title, sessions, last active, last surface
ctxfile ingest list        # the sessions themselves, thread shown per record
ctxfile ingest rm <id>     # delete one record`}</pre>

      <h2>Slash commands</h2>
      <p>
        Client surfaces that expose MCP prompts get <code>ctx-save</code> and <code>ctx-continue</code> as
        one-tap versions of the two verbs. See the <Link href="/docs/mcp">MCP surface</Link> for the full tool
        contracts.
      </p>
    </>
  );
}
