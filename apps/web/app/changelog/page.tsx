import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Changelog: ctxfile",
  description: "What shipped in each ctxfile release.",
};

export default function Changelog() {
  return (
    <>
      <SiteNav />

      <main className="wrap">
        <div className="pricing-head">
          <p className="eyebrow">Changelog</p>
          <h1>What shipped.</h1>
          <p>Releases of the core and Pro, most recent first.</p>
        </div>

        <div className="log-list">
          <article className="log-entry">
            <span className="log-date">2026-07-15</span>
            <div className="log-body">
              <span className="log-tag">v0.3.1</span>
              <h2>One key for every model, one skill for every agent</h2>
              <p>
                Wider reach and a docs pass that checked every setup instruction against each tool&apos;s current
                documentation.
              </p>
              <ul>
                <li>
                  OpenRouter consult provider: name a model slug, set <code>OPENROUTER_API_KEY</code>, and consult
                  fans one question across hundreds of models on a single key.
                </li>
                <li>
                  Per-client setup tabs in the docs: copy-paste config for Claude Code, Cursor, Codex CLI,
                  OpenCode, Gemini CLI, OpenClaw, Hermes, Claude Desktop, and Aider.
                </li>
                <li>
                  The behavior-layer skill now renders for nine harnesses: one portable <code>SKILL.md</code> for
                  Claude Code, OpenCode, OpenClaw, and Hermes, a Cursor rule, and managed <code>GEMINI.md</code> /{" "}
                  <code>AGENTS.md</code> blocks.
                </li>
                <li>
                  Live-docs audit fixes, including Hermes tool naming (<code>mcp_ctxfile_*</code>) and the Claude
                  Desktop extension manifest.
                </li>
              </ul>
            </div>
          </article>

          <article className="log-entry">
            <span className="log-date">2026-07-14</span>
            <div className="log-body">
              <span className="log-tag">v0.3.0</span>
              <h2>Playbooks, and easy to find</h2>
              <p>A new Pro surface, and a site any search or answer engine can read.</p>
              <ul>
                <li>
                  Playbooks (Pro): ask any agent to distill a reusable prompt from your own saved sessions.
                  Stored encrypted with provenance, served back as native MCP prompts.
                </li>
                <li>
                  Discovery layer for the site: robots and sitemap, an <code>llms.txt</code>, and JSON-LD so
                  search engines and AI answer engines can read and cite ctxfile.
                </li>
                <li>A glass-case hero and a brand kit (wordmark, marks, manifest), for dark and light.</li>
              </ul>
            </div>
          </article>

          <article className="log-entry">
            <span className="log-date">2026-07-14</span>
            <div className="log-body">
              <span className="log-tag">v0.2.0</span>
              <h2>Your context, in the chat tabs</h2>
              <p>The same context your CLI and editor agents load now travels to the web chatbots.</p>
              <ul>
                <li>
                  Web-chatbot connector surface on the relay: <code>search</code> and <code>fetch</code> tools
                  built for custom connectors, plus a tokened URL for claude.ai. Connect Grok, ChatGPT, Claude
                  web, or Perplexity to your vault.
                </li>
                <li>
                  The Sync relay is published to npm as <code>@ctxfile/relay</code> and self-hostable: encrypted
                  vaults, bearer-token auth, one Docker image, deployable to Fly.
                </li>
                <li>
                  Opt-in full-conversation transcripts: keep the whole chat alongside the digest, redacted,
                  retrieved only on demand.
                </li>
                <li>Thread-naming hints, so a thread-less save can be re-filed and resumed by name.</li>
              </ul>
            </div>
          </article>

          <article className="log-entry">
            <span className="log-date">2026-07-13</span>
            <div className="log-body">
              <span className="log-tag">v0.1.1</span>
              <h2>Subscription licensing</h2>
              <p>
                Activation accepts a subscription credential that auto-refreshes a short-lived, offline-verified
                license. A Pro subscription stays valid without any phone-home while you work.
              </p>
            </div>
          </article>

          <article className="log-entry">
            <span className="log-date">2026-07-13</span>
            <div className="log-body">
              <span className="log-tag">v0.1.0</span>
              <h2>Launch: local core, threads, and Sync</h2>
              <p>The free core is Apache-2.0. The paid tiers verify their license offline and run locally.</p>
              <ul>
                <li>Snapshot engine: plan, key files, git state, opt-in Notion pages.</li>
                <li>Secret redaction on everything ingested; denied paths never read.</li>
                <li>SQLite snapshot cache; opt-in anonymous telemetry, default off.</li>
                <li>
                  MCP server over stdio and Streamable HTTP: get_context, save_session, continue_thread, list_threads,
                  ingest_context.
                </li>
                <li>Cross-provider threads: save in one agent, continue in any other; handoff packages for clean handoffs.</li>
                <li>
                  Sync: end-to-end encrypted vault on a relay you can self-host, with a recovery code for a lost
                  passphrase.
                </li>
                <li>Session connectors: Claude Code and Cursor session digests flow into the snapshot (Pro).</li>
                <li>
                  Encrypted memory: cross-session memory, AES-256-GCM at rest, key in the OS keychain, provenance on
                  every entry (Pro).
                </li>
                <li>Multi-provider consult with answer diffing: Anthropic, OpenAI-compatible, or Ollama (Pro).</li>
                <li>Voice notes via whisper.cpp with repo-aware vocabulary (Pro).</li>
                <li>Ed25519 offline licensing: signed key, local verification, 14-day grace, no phone-home.</li>
                <li>
                  Local dashboard server: <code>ctxfile ui</code>, bound to 127.0.0.1.
                </li>
              </ul>
            </div>
          </article>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
