import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Playbooks",
  description:
    "Reusable prompts, distilled by an AI from your own sessions: ctxfile studies what you actually did, writes the prompt that does it again, and serves it to every connected agent.",
};

export default function PlaybooksPage() {
  return (
    <>
      <h1>Playbooks: prompts distilled from what you actually did.</h1>
      <p>
        Every good session leaves a method behind: the order you checked things in, the traps you learned to
        avoid, the framing that finally worked. Normally that knowledge evaporates when the tab closes.
        Playbooks capture it. An AI reads your saved sessions and transcripts and <strong>distills the
        reusable prompt</strong>: the one you would hand a fresh assistant to redo that kind of task for a
        new subject. Nobody writes it by hand; the library is generated from your own work.
      </p>
      <p>
        This is a <a href="/docs/pro">Pro</a> feature: it composes session capture, the encrypted store, and
        multi-provider consult.
      </p>

      <h2>How it works</h2>
      <ol>
        <li>
          Work normally. Sessions accumulate through <code>save_session</code>, threads, and (optionally)
          full <a href="/docs/webchat">transcripts</a>.
        </li>
        <li>
          Ask any connected agent: <em>&quot;distill a playbook from the &lt;thread&gt; thread&quot;</em>.
          The <code>distill_playbook</code> tool runs your sessions through the models configured under{" "}
          <code>consult.providers</code>: a local Ollama model means <strong>nothing leaves your
          machine</strong>; a cloud key is your explicit choice.
        </li>
        <li>
          Candidates land in the playbook library: encrypted at rest (AES-256-GCM, key in your OS keychain),
          provenance on every entry (which model, which sessions), redacted before write like everything
          ctxfile stores.
        </li>
        <li>
          Reuse anywhere: playbooks appear in the <code>ctxfile ui</code> dashboard with one-click copy, and
          they are also served as <strong>native MCP prompts</strong>, so clients with a prompt picker list
          them automatically. No copy-paste between tools.
        </li>
      </ol>

      <h2>A real example</h2>
      <p>
        The first playbook ever distilled came from a real session: hours of university research for a
        student blocked by one grade. The local model (qwen3:8b, on a laptop) produced a general
        &quot;educational pathway planning with constraints&quot; prompt that preserved every hard-won
        gotcha: hidden mandatory fees, conditional credit transfers, checking the department page instead of
        aggregators, even the required neutral tone. That method is now reusable for any student, in any
        chatbot, forever.
      </p>

      <h2>The tools</h2>
      <table>
        <thead>
          <tr>
            <th>Tool</th>
            <th>What it does</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>distill_playbook</code></td>
            <td>Analyze a thread (or the most recent sessions) and store candidate playbooks</td>
          </tr>
          <tr>
            <td><code>list_playbooks</code></td>
            <td>Titles, ids, and provenance</td>
          </tr>
          <tr>
            <td><code>get_playbook</code></td>
            <td>One playbook&apos;s full prompt</td>
          </tr>
          <tr>
            <td><code>rm_playbook</code></td>
            <td>Delete an entry permanently</td>
          </tr>
        </tbody>
      </table>

      <h2>Honest edges</h2>
      <ul>
        <li>
          Distillation quality tracks the model: a local 8B produces genuinely usable playbooks (that is the
          tested floor); frontier models via an API key produce sharper ones. You choose per{" "}
          <code>consult.providers</code>.
        </li>
        <li>
          Playbooks generalize what the sessions show. If the session record is thin, the playbook will be
          too; rich saves (decisions, gotchas, transcripts) distill best.
        </li>
        <li>
          The library is local and encrypted; it does not sync in this release. Distill on the machine where
          you want the prompts.
        </li>
      </ul>
    </>
  );
}
