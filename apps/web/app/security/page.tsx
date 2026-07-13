import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";

export const metadata: Metadata = {
  title: "Security overview: ctxfile",
  description:
    "The one-pager for your security review: encryption architecture, Standard vs Strict modes, self-hosting, BYOK design, provenance posture, and the compliance roadmap.",
};

export default function Security() {
  return (
    <>
      <div className="atmosphere" aria-hidden="true" />
      <SiteNav />

      <main className="wrap">
        <div className="pricing-head">
          <p className="eyebrow">Security overview</p>
          <h1>
            Encryption is <span className="grad-text">architecture</span>, not a tier.
          </h1>
          <p>
            This page is written for the security review: what runs where, what is encrypted when, what we can
            and cannot read, stated plainly. Print it, forward it, or verify every claim in the open source.
          </p>
        </div>

        <div className="docs-shell" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
          <article className="prose">
            <h2>The stance, on record</h2>
            <p>
              Client-side encryption, ciphertext-only storage, zero plaintext persistence, Strict mode, and
              self-hosting are available at every tier, including Free. Enterprise does not get &ldquo;more
              encrypted.&rdquo; It gets <strong>proof and control</strong>: BYOK, SOC 2 attestation, audit
              exports, and policy enforcement. Baseline security is never gated behind pricing.
            </p>

            <h2>What runs where</h2>
            <ul>
              <li>
                <strong>Free and Pro are local software.</strong> The MCP server runs on your machine, reads
                only the project root you point it at, and makes zero network calls by default. There is no
                account, no telemetry unless enabled, and no server of ours in the path.
              </li>
              <li>
                <strong>Redaction happens before storage.</strong> Secret-looking content (cloud keys, tokens,
                private keys, JWTs, credential assignments) is redacted before it enters any snapshot or store;
                <code>.env*</code>, key files, and credential files are never read at all.
              </li>
              <li>
                <strong>Sync is additive and opt-in.</strong> When you create a vault, records are encrypted on
                your device (keys derived from your passphrase via Argon2id; per-blob XChaCha20-Poly1305, each
                ciphertext bound to its slot) before anything is uploaded. Storage holds ciphertext under
                opaque ids; blob names leak nothing.
              </li>
            </ul>

            <h2>Sync modes, stated honestly</h2>
            <p>
              The distinction is where the MCP client runs. If it runs on hardware you control, it can decrypt
              locally. If it runs on someone else&apos;s servers (chatgpt.com, claude.ai), tool results must
              reach their edge as plaintext to feed the model. Pure zero-knowledge serving of hosted chat apps
              is impossible, and we do not pretend otherwise.
            </p>
            <ul>
              <li>
                <strong>Standard:</strong> ciphertext-only storage; for an authorized request a worker decrypts
                in memory, answers over TLS, and discards. No plaintext at rest anywhere, including logs.
                Encrypted at rest and in transit, zero plaintext persistence. Not zero-knowledge.
              </li>
              <li>
                <strong>Strict:</strong> true end-to-end. The relay can never decrypt; only devices holding
                the passphrase-derived key can read. Trades away hosted chat apps.
              </li>
              <li>
                <strong>Self-hosted relay:</strong> the same open-source build, on your infrastructure. Roaming
                works and the momentary plaintext happens on hardware you control.
              </li>
            </ul>
            <p>
              Key recovery is passphrase plus a printed recovery code. We cannot reset a Strict vault. Vault
              deletion destroys its keys: crypto-shredding.
            </p>

            <h2>Enterprise controls (BYOK and federation)</h2>
            <ul>
              <li>
                <strong>BYOK:</strong> serve-time data keys live in your KMS (AWS KMS, GCP KMS, Azure Key
                Vault) under envelope encryption. ctxfile infrastructure never holds decryptable material for
                BYOK orgs; revoking your CMK makes the data instantly unreadable.
              </li>
              <li>
                <strong>Federated grants:</strong> org-to-org sharing is scoped (thread-level), least-privilege
                by default (read-only, single thread, 7-day expiry), signed by the issuing org&apos;s key,
                verified on every redemption, revocable instantly, and filtered through redaction profiles at
                issuance and at serve time.
              </li>
              <li>
                <strong>Hub-to-hub, not through us:</strong> federated hubs exchange grant-scoped context over
                mutual-TLS MCP. No central ctxfile server sits in the data path unless both orgs opt in.
              </li>
              <li>
                <strong>Audit:</strong> append-only log of every read, write, grant, and redemption with org,
                agent, and human attribution; exportable to your SIEM.
              </li>
            </ul>

            <h2>Prompt-injection posture</h2>
            <p>
              Everything served carries provenance labels (parser-read vs agent-reported, which harness, which
              door, which org). Ingested and federated content is quarantined as untrusted data, and the tool
              descriptions say so to the model. A partner org&apos;s compromise must not become yours.
            </p>

            <h2>Compliance roadmap</h2>
            <ul>
              <li>SOC 2 Type I: targeted four months from Enterprise build start; Type II within twelve.</li>
              <li>DPA, security questionnaire pack (CAIQ-lite), and SLA terms available for pilots.</li>
              <li>Data residency: self-hosting answers it by default; managed hubs pin a region.</li>
            </ul>

            <h2>Verify, then trust</h2>
            <p>
              The core and the relay are open source. The privacy claims on this site are the literal behavior
              of the code, and the code is the audit surface. Responsible disclosure:{" "}
              <a href="mailto:security@ctxfile.dev">security@ctxfile.dev</a>. Questions from a security review:{" "}
              <a href="mailto:hello@ctxfile.dev?subject=ctxfile%20security%20review">hello@ctxfile.dev</a>.
            </p>
            <p>
              Deeper reading: <Link href="/docs/sync">Sync &amp; roaming</Link>,{" "}
              <Link href="/docs/privacy">Privacy &amp; redaction</Link>,{" "}
              <Link href="/docs/threads">Threads &amp; handoff</Link>.
            </p>
          </article>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
