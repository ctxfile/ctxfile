import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "Zero network calls by default. The complete list of opt-ins, what each enables, and what never leaves your machine.",
};

export default function Privacy() {
  return (
    <>
      <h1>Privacy</h1>
      <p className="lede">
        These are not policy statements: they are the behavior of the code, which is open source and verifiable.
      </p>

      <div className="callout">
        <p>
          <strong>Default behavior: zero network calls.</strong> A default install snapshots files and git state
          and serves them over stdio to your local MCP client. No request leaves your machine.
        </p>
      </div>

      <h2>The complete list of network opt-ins</h2>
      <p>Exactly four things can cause a network call, and each is off until you explicitly enable it:</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Opt-in</th>
              <th>What enables it</th>
              <th>Where traffic goes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>notion</td>
              <td>
                <code>NOTION_TOKEN</code> env var set <em>and</em> <code>notion.pageIds</code> listed in config
              </td>
              <td>Notion&apos;s API, fetching only the pages you named</td>
            </tr>
            <tr>
              <td>ollama</td>
              <td>
                <code>ollama.summarize: true</code> in config
              </td>
              <td>
                Your local Ollama endpoint (default <code>http://localhost:11434</code>)
              </td>
            </tr>
            <tr>
              <td>consult providers</td>
              <td>
                <code>consult.providers</code> configured (Pro feature)
              </td>
              <td>Only the providers you listed, using API keys from env vars you named</td>
            </tr>
            <tr>
              <td>telemetry ping</td>
              <td>
                <code>telemetry.enabled: true</code> in config
              </td>
              <td>An anonymous install-count ping (see below)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Redaction</h2>
      <p>
        Everything ingested (files, Notion pages, session transcripts) passes redaction before it enters a
        snapshot. Secret-looking content (AWS keys, GitHub/Notion/Slack tokens, private keys, JWTs, quoted{" "}
        <code>password=</code>/<code>api_key=</code> assignments) is replaced, and each redaction is counted in
        the snapshot metadata so you can see it happened.
      </p>
      <p>
        Denied paths go further: <code>.env*</code>, key files, and credential files are <strong>never read at
        all</strong>. They are excluded before ingestion, not redacted after.
      </p>

      <h2>Read-only over your data</h2>
      <p>
        The core never writes to your repository, your Notion workspace, or your git state. File access is scoped
        to the single configured root. Session connectors (Pro) read a copy, read-only. The two deliberate
        exceptions, both actions you invoke yourself: <code>ctxfile export</code> writes{" "}
        <code>.ctxfile/context.&#123;json,md&#125;</code> in your project, and <code>ctxfile hooks install</code>{" "}
        writes a managed block in <code>.git/hooks/pre-commit</code>.
      </p>

      <h2>Exports</h2>
      <p>
        <code>ctxfile export</code> is the one feature whose whole point is moving context somewhere else, so it
        defaults to the least: the <strong>repo-safe</strong> profile ships plan, git state, and a key-file
        manifest, and excludes file bodies, Notion pages, and session digests entirely. The <code>full</code>{" "}
        profile requires an explicit flag and prints a loud warning. Every profile re-runs secret redaction on
        every exported text field, and your absolute local path never appears in an export (directory basename
        only). Details: the <a href="/docs/export">export guide</a> and the{" "}
        <a href="/convention">convention spec</a>.
      </p>

      <h2>Pro memory encryption</h2>
      <p>
        Pro&apos;s cross-session memory is the one place the product writes data, and it writes only to its own
        store under <code>~/.ctxfile/</code>. Memory content is encrypted with AES-256-GCM; the key lives
        in your OS keychain, not on disk next to the data. Every entry records its provenance: which tool wrote
        it, when, and from what source.
      </p>

      <h2>Telemetry, precisely</h2>
      <p>
        <strong>Off by default.</strong> If, and only if, you set <code>telemetry.enabled: true</code>, an
        anonymous ping is sent containing: a random install UUID, the version string, and a coarse OS platform
        name. Never code, never paths, never content, never identity. Its sole purpose is counting active
        installs. Leave the flag unset and no ping ever happens.
      </p>

      <h2>Licensing without phoning home</h2>
      <p>
        Pro licenses are Ed25519-signed keys verified locally against a public key embedded in the binary.
        License checks make no network calls. There is no activation server to contact.
      </p>
    </>
  );
}
