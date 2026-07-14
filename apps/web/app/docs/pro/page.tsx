import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pro",
  description: "Session connectors, encrypted memory, multi-provider consult, voice, and offline licensing.",
};

export default function Pro() {
  return (
    <>
      <h1>Pro</h1>
      <p className="lede">
        The free core snapshots your project. Pro gives your agents continuity (memory, session history, and
        cross-model judgment) while keeping everything as local as the core.
      </p>

      <h2>What Pro adds</h2>
      <h3>Session connectors</h3>
      <p>
        Digests of your recent sessions from eight tools (Claude Code, Cursor, Codex CLI, OpenCode, Gemini CLI,
        Aider, OpenClaw, and Hermes Agent) flow into the snapshot automatically, so a fresh agent picks up
        where the previous one left off, even when that was a different tool entirely. Best-effort, read-only,
        reads a copy; see <Link href="/docs/connectors">Connectors</Link> for exactly what each one reads.
      </p>
      <p>
        Pro sells the <em>invisible</em> version of this. The universal fallback, agent-assisted ingest via
        the <code>ingest_context</code> tool, is <Link href="/docs/ingest">free core</Link> and covers any
        harness with one pasted prompt.
      </p>
      <h3>Encrypted memory</h3>
      <p>
        Cross-session memory your agents can write to and recall from, exposed as the <code>remember</code>,{" "}
        <code>recall</code>, and <code>forget</code> MCP tools. Content is AES-256-GCM encrypted at rest under{" "}
        <code>~/.ctxfile/</code>, the key lives in your OS keychain, and every entry carries provenance: what
        wrote it, when, from what source. The dashboard&apos;s Memory view lists and deletes entries.
      </p>
      <h3>Playbooks</h3>
      <p>
        Reusable prompts <em>distilled by an AI from your own sessions</em>: ask any agent to{" "}
        <code>distill_playbook</code> from a thread and the method you already proved becomes a prompt you
        can run anywhere, stored encrypted with provenance and served as native MCP prompts. See{" "}
        <Link href="/docs/playbooks">Playbooks</Link>.
      </p>
      <h3>Multi-provider consult</h3>
      <p>
        The <code>consult</code> tool asks the same question to several models at once (Anthropic, any
        OpenAI-compatible endpoint, or local Ollama) over your live project context, and streams their answers
        side by side. Providers come from your <code>consult.providers</code> config; API keys are read from env
        vars you name, never stored.
      </p>
      <h3>Voice notes</h3>
      <p>
        The <code>transcribe_voice</code> tool runs whisper.cpp entirely on your machine, with a vocabulary
        built from your repo. Say the function name, get the function name, not a phonetic guess.
      </p>
      <p>
        The exact tool registrations, feature gating, and schemas are on{" "}
        <Link href="/docs/mcp">MCP surface</Link>.
      </p>

      <h2>Offline licensing</h2>
      <p>
        Your license is an Ed25519-signed key. Activation verifies the signature locally against a public key
        embedded in the binary. <strong>No phone-home, no activation server, no license check traffic, ever</strong>.
        If a license expires, a 14-day grace period keeps Pro features working while you renew.
      </p>
      <pre>
        <code>ctxfile activate &lt;key&gt;</code>
      </pre>

      <h2>Purchase and billing</h2>
      <p>
        Checkout, receipts, and cancellation are handled by Polar as merchant of record. Cancel any time from
        Polar&apos;s customer portal; your data stays on your machine because it never left. See{" "}
        <Link href="/pricing">Pricing</Link>.
      </p>
    </>
  );
}
