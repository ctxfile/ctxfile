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
            <span className="log-date">2026-07</span>
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
