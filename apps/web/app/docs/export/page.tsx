import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cloud agents & export",
  description:
    "How agents that don't run on your machine get your context: ctxfile export, redaction profiles, the pre-commit hook, and CI recipes.",
};

export default function ExportDocs() {
  return (
    <>
      <h1>Cloud agents &amp; export</h1>
      <p className="lede">
        The MCP server assumes the agent runs where the context lives. Agents that run elsewhere (hosted coding
        agents, CI bots) get the context as a static artifact instead: <code>ctxfile export</code> writes a
        versioned, self-describing snapshot the repo carries with it. No server, no account, no network.
      </p>

      <h2>Quick start</h2>
      <pre>
        <code>{`ctxfile export            # writes .ctxfile/context.json + context.md
git add .ctxfile && git commit -m "chore: ship agent context"`}</code>
      </pre>
      <p>
        Any agent that clones the repo can now read <code>.ctxfile/context.json</code> before asking you to
        re-explain the project. The formal file format lives at{" "}
        <Link href="/convention">the .ctxfile convention</Link>.
      </p>

      <h2>Redaction profiles</h2>
      <p>
        The leak risk is not your code (the repo already carries that); it is everything else the snapshot
        knows: session digests, Notion pages, private plans. Profiles control exactly what leaves:
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Profile</th>
              <th>Contents</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>repo-safe</td>
              <td>
                Default. Plan, git state, and a key-file manifest (paths, token counts, redaction counts). No
                file bodies, no Notion, no sessions. Safe to commit.
              </td>
            </tr>
            <tr>
              <td>full</td>
              <td>
                Everything: file bodies, Notion content, session digests, session summary. The CLI warns loudly
                and suggests gitignoring <code>.ctxfile/</code>; committing this shares private working notes
                with everyone who can clone.
              </td>
            </tr>
            <tr>
              <td>custom</td>
              <td>
                Your allowlist from config, e.g.{" "}
                <code>{`"export": { "profile": "custom", "include": ["plan", "gitState"] }`}</code>. Sections:{" "}
                <code>plan</code>, <code>gitState</code>, <code>keyFiles</code>, <code>keyFileContent</code>,{" "}
                <code>notionPages</code>, <code>sessions</code>, <code>sessionSummary</code>.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Every profile re-runs secret redaction on every exported text field, and no export ever contains your
        absolute local path (the project appears by directory name only).
      </p>

      <h2>Keeping it fresh</h2>
      <h3>Pre-commit hook</h3>
      <pre>
        <code>ctxfile hooks install</code>
      </pre>
      <p>
        Adds a managed block to <code>.git/hooks/pre-commit</code> that regenerates the repo-safe export and
        stages it, so the artifact in every commit matches that commit. Best-effort by design: if{" "}
        <code>ctxfile</code> is missing or the export fails, the commit proceeds and a one-line note goes to
        stderr. <code>ctxfile hooks uninstall</code> removes exactly the managed block and nothing else.
      </p>
      <h3>CI</h3>
      <p>
        Regenerate on push instead (or as well); the ready-made GitHub Actions recipe is on the{" "}
        <Link href="/convention">convention page</Link>.
      </p>
      <h3>Drift detection</h3>
      <p>
        The envelope stamps <code>git_sha</code> (the commit the snapshot saw) and both generation timestamps.
        Agents should compare <code>git_sha</code> with the checkout&apos;s HEAD and flag stale context instead
        of trusting it silently.
      </p>

      <h2>Piping instead of committing</h2>
      <pre>
        <code>{`ctxfile export --stdout | your-agent-cli --context -
ctxfile export --stdout > /tmp/context.json   # hand to anything`}</code>
      </pre>
      <p>
        <code>--stdout</code> writes the JSON envelope to stdout and nothing to disk, for CI artifacts, upload
        steps you control, or ad-hoc handoffs.
      </p>

      <h2>What export deliberately is not</h2>
      <p>
        A static artifact, not a connection: no scoped queries, no memory recall, no live updates. Interactive
        remote access (an MCP endpoint you can point cloud agents at) is planned as{" "}
        <code>ctxfile serve</code>; its token configuration shape is already reserved in{" "}
        <Link href="/docs/configuration">configuration</Link> but no listener ships yet. Roadmap-wise, the
        always-on multi-machine answer is the self-hosted Team hub. See <Link href="/pricing">Pricing</Link>.
      </p>
    </>
  );
}
