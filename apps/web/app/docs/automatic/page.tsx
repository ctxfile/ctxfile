import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Make it automatic",
  description:
    "The Behavior Layer: install the ctxfile skill once and your agents checkpoint context on their own. Announced every time, paused any time, reviewable always.",
};

export default function AutomaticDocs() {
  return (
    <>
      <h1>Make it automatic</h1>
      <p className="lede">
        MCP gives an agent <em>tools</em>; a skill gives it <em>behavior</em>. Install the ctxfile behavior
        pack once and any agent, while doing its normal work, knows when to checkpoint context and how to do
        it well. You stop prompting &ldquo;save this&rdquo;; when you switch providers, the data is simply
        already there. Prompting remains as a manual override.
      </p>

      <h2>Install</h2>
      <pre>{`ctxfile init`}</pre>
      <p>
        <code>init</code> asks for consent first (auto-capture is an explicit choice, never a default you
        discover later), then detects your harnesses and installs the behavior file where each one looks:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Harness</th>
              <th>What init writes</th>
              <th>Manual alternative</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Claude Code</td>
              <td>
                <code>.claude/skills/ctxfile/SKILL.md</code>
              </td>
              <td>
                <code>ctxfile init --print claude-code</code>
              </td>
            </tr>
            <tr>
              <td>Cursor</td>
              <td>
                <code>.cursor/rules/ctxfile.mdc</code> (always applied)
              </td>
              <td>
                <code>ctxfile init --print cursor</code>
              </td>
            </tr>
            <tr>
              <td>AGENTS.md harnesses</td>
              <td>A managed block appended to <code>AGENTS.md</code> (re-install updates it in place)</td>
              <td>
                <code>ctxfile init --print agents-md</code>
              </td>
            </tr>
            <tr>
              <td>Codex</td>
              <td>Printed for pasting into your Codex instructions</td>
              <td>
                <code>ctxfile init --print codex</code>
              </td>
            </tr>
            <tr>
              <td>Anything else</td>
              <td>A generic system-prompt block for any harness or open model</td>
              <td>
                <code>ctxfile init --print generic</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        All five renders come from one canonical spec in the package (<code>behaviors/canonical.md</code>);
        community PRs for new harnesses are markdown, the same cheap-connector dynamic as the{" "}
        <Link href="/docs/ingest">ingest prompt snippets</Link>.
      </p>

      <h2>What the skill teaches the agent</h2>
      <ul>
        <li>
          <strong>Session start:</strong> call <code>get_context</code>, resume the matching thread, and say
          so in one line.
        </li>
        <li>
          <strong>Checkpoint on significance, not on time:</strong> a task completes, a decision with
          rationale is made, the user says goodbye or mentions switching tools, or ~30 minutes of substantive
          work pass. Never on trivial exchanges or unchanged state.
        </li>
        <li>
          <strong>Handoff detection:</strong> &ldquo;hand this off&rdquo; or &ldquo;I&apos;ll continue on my
          phone&rdquo; produces the full enforced <Link href="/docs/threads">handoff package</Link>.
        </li>
        <li>
          <strong>Visibility, non-negotiable:</strong> every automatic save is announced:{" "}
          <code>✓ Checkpointed to ctxfile (thread: Q3 campaign)</code>. Never silent.
        </li>
        <li>
          <strong>Thread hygiene:</strong> distinct work gets a distinct thread; when uncertain, ask once.
        </li>
        <li>
          <strong>The CLI, on request only:</strong> agents with a shell learn the admin commands
          (<code>pause</code>, <code>threads private</code>, <code>ingest list/rm</code>, <code>export</code>,{" "}
          <code>sync</code>) and run them only when you explicitly ask, stating the command; they never touch
          vault setup or your passphrase.
        </li>
      </ul>

      <h2>The guardrails (server-enforced, not just requested)</h2>
      <p>
        Automatic checkpoints carry <code>trigger: &quot;auto&quot;</code> provenance, and the server holds
        the line even if an agent misbehaves:
      </p>
      <ul>
        <li>
          <code>ctxfile pause</code> refuses every automatic checkpoint until <code>ctxfile resume</code>;
          manual saves keep working.
        </li>
        <li>
          <code>ctxfile threads private &lt;id&gt;</code> excludes one thread from auto-capture entirely
          (<code>--off</code> to include it again).
        </li>
        <li>
          <strong>Debounce:</strong> an unchanged checkpoint on the same thread inside the window (default 5
          minutes, <code>behavior.debounceMinutes</code> in config) is skipped; materially different content
          and handoffs always land. No garbage checkpoints.
        </li>
        <li>
          Everything lands in the same reviewable store: <code>ctxfile ingest list</code> shows auto captures
          identically, labeled <code>auto checkpoint</code>, and <code>ingest rm</code> deletes them.
        </li>
      </ul>
      <p>
        A silent ambient recorder would contradict the entire trust story; a narrated one reinforces it. That
        is why the announcement line is a behavior rule AND baked into the tool&apos;s response text.
      </p>

      <h2>Try the loop</h2>
      <pre>{`ctxfile init --yes
# work in Claude Code / Cursor as normal; when a task completes you'll see:
#   ✓ Checkpointed to ctxfile (thread: <your work>)
ctxfile threads          # it's there
ctxfile pause            # and now it isn't captured, until:
ctxfile resume`}</pre>
    </>
  );
}
