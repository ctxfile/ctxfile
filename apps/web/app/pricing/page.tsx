import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import { SpotlightGrid } from "@/components/SpotlightGrid";

export const metadata: Metadata = {
  title: "Pricing: ctxfile",
  description: "Free open-source core. Pro at $12/month, Sync at $6/month via Polar. Team tier for shared context.",
};

// Live Polar checkout link (all plans; buyer picks Pro, Sync, or Pro+Sync).
// Polar (merchant of record) hosts checkout, receipts, and subscription
// management. No auth on our side.
const POLAR_CHECKOUT_URL = "https://buy.polar.sh/polar_cl_vEMwjSGXNDEtTjVU0T1qaTwK9cathT7x6cuHF3GMrzx";

// The PRD §6.1 inquiry "form", zero-infrastructure edition: a mail template
// carrying the three qualification questions straight to the founder.
const ENTERPRISE_MAILTO =
  "mailto:hello@ctxfile.dev?subject=ctxfile%20Enterprise%3A%20federation%20inquiry&body=Name%3A%0D%0ACompany%3A%0D%0AWhat%20should%20your%20agents%20share%20(the%20use%20case)%3A%0D%0A";

export default function Pricing() {
  return (
    <>
      <div className="atmosphere" aria-hidden="true" />
      <SiteNav />

      <main className="wrap">
        <div className="pricing-head">
          <p className="eyebrow enter" style={{ animationDelay: "0ms" }}>
            Pricing
          </p>
          <h1 className="enter" style={{ animationDelay: "70ms" }}>
            The core is free. <span className="grad-text">Memory</span> is what you pay for.
          </h1>
          <p className="enter" style={{ animationDelay: "140ms" }}>
            Everything that snapshots and serves your context is Apache-2.0, forever. Pro adds the parts that make
            agents feel hired instead of hourly. Sync carries the same context to your phone and every chat app.
          </p>
        </div>

        <SpotlightGrid className="tier-grid">
          <div className="tier spot">
            <h2>Free</h2>
            <p className="price">
              $0 <small>Apache-2.0</small>
            </p>
            <ul>
              <li>Snapshot engine: plan, key files, git state</li>
              <li>Any MCP client: Claude Code, Cursor, custom</li>
              <li>Threads, local: save_session, continue_thread, list_threads, handoff packages</li>
              <li>Secret redaction and denied paths</li>
              <li>SQLite cache and local dashboard</li>
              <li>Agent-assisted session ingest (any harness, one pasted prompt)</li>
              <li>Cloud export with redaction profiles</li>
              <li>Notion and Ollama connectors (opt-in)</li>
            </ul>
            <a className="tier-cta" href="/#install">
              npm install -g ctxfile
            </a>
          </div>

          <div className="tier spot" data-tier="pro">
            <span className="tier-badge">Most popular</span>
            <h2 style={{ color: "var(--pro)" }}>Pro</h2>
            <p className="price">
              $12 <small>/ month</small>
            </p>
            <ul>
              <li>Everything in Free</li>
              <li>Session connectors: Claude Code, Cursor, Codex, OpenCode, Gemini CLI, Aider, OpenClaw, Hermes</li>
              <li>Encrypted cross-session memory (AES-256-GCM, keychain)</li>
              <li>Multi-agent consult with answer diffing</li>
              <li>Voice notes with repo-aware vocabulary</li>
              <li>ctxfile serve: the HTTP door, bearer tokens with scopes</li>
              <li>Offline license: signed key, 14-day grace</li>
            </ul>
            <a className="tier-cta" href={POLAR_CHECKOUT_URL} rel="noopener">
              Get Pro via Polar
            </a>
          </div>

          <div className="tier spot" data-tier="sync" id="sync">
            <h2 style={{ color: "var(--sync)" }}>Sync</h2>
            <p className="price">
              $6 <small>/ month</small>
            </p>
            <ul>
              <li>Encrypted vault; your machine stays the source of truth</li>
              <li>Connectors for Claude, ChatGPT, Grok, Perplexity, Le Chat</li>
              <li>Cross-provider threads on your phone, the web, your desk</li>
              <li>Standard mode: ciphertext storage, zero plaintext persistence</li>
              <li>Strict mode: true end-to-end, your own devices only</li>
              <li>Revocable per-client tokens, every grant auditable</li>
              <li>Bundle with Pro for $15/month</li>
            </ul>
            <a className="tier-cta" href={POLAR_CHECKOUT_URL} rel="noopener">
              Get Sync via Polar
            </a>
          </div>

          <div className="tier spot">
            <h2>Team</h2>
            <p className="price">
              Soon <small>waitlist</small>
            </p>
            <ul>
              <li>Shared writable context across the team</li>
              <li>Per-agent write permissions</li>
              <li>Full audit trail on every write</li>
              <li>Cross-machine sync, still self-hosted</li>
              <li>For teams that legally can&apos;t use cloud AI</li>
            </ul>
            <a className="tier-cta" href="mailto:hello@ctxfile.dev?subject=ctxfile%20Team">
              Talk to us
            </a>
          </div>
        </SpotlightGrid>

        <div className="tier-enterprise" id="enterprise">
          <div className="tier-ent-copy">
            <p className="tier-ent-eyebrow">Enterprise</p>
            <h2>Cross-org agent federation.</h2>
            <p>
              Your agents and your partner&apos;s agents on one governed thread: scoped, revocable, org-signed
              grants; BYOK so we never hold decryptable material; SSO/SCIM; audit exports; SOC 2 on the
              roadmap. Self-hosted hubs by default, hub to hub over mutual TLS, no ctxfile server in the data
              path.
            </p>
          </div>
          <div className="tier-ent-cta">
            <a className="tier-cta" href={ENTERPRISE_MAILTO}>
              Talk to us about federation
            </a>
            <a className="tier-ent-link" href="/security">
              Read the security overview
            </a>
          </div>
        </div>

        <p className="pricing-fineprint">
          Checkout, receipts, and subscription management are handled by Polar as merchant of record. Your license
          verifies offline against a signed key. The product never phones home to check it. Cancel any time from
          Polar&apos;s customer portal. Free and Pro keep your data on your machine because it never left. Sync
          uploads only what you choose, encrypted on your device first; Standard mode is encrypted at rest and in
          transit with zero plaintext persistence (not zero-knowledge, and we say so), Strict mode is true
          end-to-end. The relay is open source, and you can self-host it.
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
