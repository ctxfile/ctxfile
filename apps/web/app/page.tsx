import { ContextPreview } from "@/components/ContextPreview";
import { ContextTravel } from "@/components/ContextTravel";
import { CopyCommand } from "@/components/CopyCommand";
import { HeroTilt } from "@/components/HeroTilt";
import { Reveal } from "@/components/Reveal";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import { SnapshotDemo } from "@/components/SnapshotDemo";
import { SpotlightGrid } from "@/components/SpotlightGrid";
import Link from "next/link";

const INSTALL = "npm install -g ctxfile";
const GITHUB_URL = "https://github.com/ctxfile/ctxfile";

const WORKS_WITH = [
  "Claude Code",
  "Cursor",
  "Codex CLI",
  "OpenCode",
  "Gemini CLI",
  "Aider",
  "OpenClaw",
  "Hermes",
  "any MCP client",
];

const PROBLEMS = [
  {
    title: "Every session starts blind.",
    body: "Your agent forgot the plan, the decisions, and where you left off. You burn the first 15 minutes rebuilding context it had yesterday.",
  },
  {
    title: "Every agent is an island.",
    body: "Cursor doesn't know what Claude Code did. Your writing agent documents endpoints your coding agent deleted this morning.",
  },
  {
    title: "Your context is hostage.",
    body: "Weeks of project understanding trapped inside one vendor's chat history. Switching models means starting over.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Snapshot",
    body: "ctxfile watches your project: plan, key files, git state, session summaries, Notion pages. One structured context object, assembled from reality.",
    code: "ctxfile --root .",
  },
  {
    n: "02",
    title: "Serve",
    body: "A local MCP server any agent can read. Claude Code, Cursor, custom agents, local Ollama models: they call get_context and start already knowing the project.",
    code: "get_context()",
  },
  {
    n: "03",
    title: "Hand off",
    body: "Switch agents, switch models, switch tools. Threads carry the decisions and open items across providers; the context stays yours and travels with the work, not the vendor.",
    code: 'continue_thread("Q3 campaign")',
  },
];

const FEATURES = [
  {
    icon: "⛨",
    tone: "redact",
    title: "Local-first, provably",
    body: "No server, no account, no telemetry by default. Open source: audit the claim, don't trust it. Your data never becomes our data.",
  },
  {
    icon: "⇄",
    title: "Any agent, any model",
    body: "MCP-native: works with every MCP client today and every one that ships tomorrow. Cloud model, local model, doesn't matter.",
  },
  {
    icon: "⇪",
    title: "Cloud agents included",
    body: "ctxfile export ships a repo-safe context file with your repo. CI agents and hosted sessions load it on clone; redaction profiles keep private notes private.",
  },
  {
    icon: "∿",
    title: "Automatic, not prompted",
    body: "Install the skill (ctxfile init) and your agents checkpoint on their own: announced every time, paused whenever you want, reviewable always. When a parser breaks, the fallback ladder still catches you.",
  },
  {
    icon: "◈",
    title: "Provenance on everything",
    body: "Every context entry is tagged with its source, parser-read vs. agent-reported, so downstream agents know what they're trusting.",
  },
  {
    icon: "❐",
    title: "The .ctxfile convention",
    body: "A versioned, documented format any tool can adopt. Like Dockerfile for builds or AGENTS.md for instructions, but for live working state.",
  },
];

const ROAM = [
  {
    n: "01",
    surface: "ChatGPT",
    where: "on your phone",
    msg: <>&ldquo;Save this session to ctxfile, thread <strong>Q3 campaign</strong>.&rdquo;</>,
    tool: "save_session ✓",
    note: "encrypted to your vault, provenance-stamped",
  },
  {
    n: "02",
    surface: "Claude",
    where: "minutes or days later",
    msg: <>&ldquo;Pick up my <strong>Q3 campaign</strong> thread. What were we doing?&rdquo;</>,
    tool: "continue_thread ✓",
    note: "the first answer already knows the decisions and open items",
  },
  {
    n: "03",
    surface: "Your desk",
    where: "back home",
    msg: <>Local ctxfile pulls the vault. The phone sessions land in your snapshot; your local sessions push up.</>,
    tool: "synced ✓",
    note: "one thread, every provider, both directions",
  },
];

const FAQ = [
  {
    q: "Is my code sent anywhere?",
    a: "No. The default path makes zero network calls. Notion, cloud-model consult, and the Sync vault are opt-in and loudly flagged. The code is open: verify it.",
  },
  {
    q: "What agents does it work with?",
    a: "Anything that speaks MCP: Claude Code, Cursor, Claude Desktop, Cline, Windsurf, custom agents. With Sync, also the hosted chat apps: Claude, ChatGPT, Grok, Perplexity, Le Chat. Plus any harness at all via session ingest and export.",
  },
  {
    q: "Is Sync end-to-end encrypted?",
    a: "Your choice per vault. Standard encrypts everything on your device before upload; storage holds ciphertext only, and serve-time decryption lives in memory for the length of a single request. Encrypted at rest and in transit, zero plaintext persistence. That is not zero-knowledge, and we won't blur it: a hosted chat app can only read plaintext at its edge. Strict is true end-to-end (the relay can never decrypt), which works between your own devices and trades away chatgpt.com and claude.ai. Third path: self-host the open-source relay, and the momentary plaintext happens on hardware you control.",
  },
  {
    q: "My agent's sessions aren't syncing.",
    a: "Open the dashboard (ctxfile ui) and check Sessions: when a parser can't deliver, it hands you a one-paste prompt your agent uses to sync its own sessions. The full flow is documented under Session sync in the docs.",
  },
  {
    q: "Open source and paid?",
    a: "The core is Apache-2.0, forever. Pro is convenience and memory on top. The paid code isn't in the public repo; the free code is the trust proof.",
  },
  {
    q: "I'm not a developer. Is this for me?",
    a: "Yes. Sync is the knowledge-worker product: your brand brief, guidelines, and campaign history follow you across ChatGPT, Claude, and whatever you try next week. The one-click Claude Desktop install works locally today.",
  },
];

export default function Home() {
  return (
    <>
      <div className="atmosphere" aria-hidden="true" />
      <SiteNav
        links={[
          { href: "/docs", label: "Docs" },
          { href: "/pricing", label: "Pricing" },
          { href: "#features", label: "Features", hideSm: true },
          { href: "#pricing", label: "Pro", hideSm: true },
        ]}
      />

      <main>
        <section className="wrap hero" id="install">
          <div>
            <p className="eyebrow enter" style={{ animationDelay: "0ms" }}>
              Your context belongs to you, not to your chatbot
            </p>
            <h1 className="enter" style={{ animationDelay: "70ms" }}>
              Stop <span className="strike">re&#8209;explaining</span> your project to{" "}
              <span className="grad-text">every AI agent.</span>
            </h1>
            <p className="hero-sub enter" style={{ animationDelay: "140ms" }}>
              You spend hours in Cursor, switch to Claude for a hard problem, come back and&hellip; start
              over. <strong>ctxfile makes your context travel with you:</strong> plan, files, git, sessions,
              loaded by any agent, any model. <strong>All local. Open source.</strong>
            </p>
            <div className="hero-ctas enter" style={{ animationDelay: "210ms" }}>
              <CopyCommand command={INSTALL} />
              <a className="btn-ghost" href={GITHUB_URL} rel="noopener">
                ⭐ Star on GitHub
              </a>
            </div>
            <p className="hero-meta enter" style={{ animationDelay: "280ms" }}>
              <span>Apache-2.0</span>
              <span>nothing leaves your machine by default</span>
              <span>no account required</span>
            </p>
          </div>
          <div className="enter" style={{ animationDelay: "180ms" }}>
            <HeroTilt>
              <ContextTravel />
            </HeroTilt>
          </div>
        </section>

        <div className="wrap works-with enter" style={{ animationDelay: "380ms" }}>
          <span className="works-label">Works with</span>
          {WORKS_WITH.map((w) => (
            <span className="works-chip" key={w}>
              {w}
            </span>
          ))}
        </div>

        <section className="problem hairline">
          <div className="wrap">
            <Reveal>
              <div className="section-head">
                <p className="eyebrow">The problem</p>
                <h2>The re-explaining tax.</h2>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <SpotlightGrid className="feature-grid problem-grid">
                {PROBLEMS.map((p) => (
                  <div className="feature spot" key={p.title}>
                    <h3>{p.title}</h3>
                    <p>{p.body}</p>
                  </div>
                ))}
              </SpotlightGrid>
            </Reveal>
          </div>
        </section>

        <section className="steps hairline">
          <div className="wrap">
            <Reveal>
              <div className="section-head">
                <p className="eyebrow">How it works</p>
                <h2>Three moves. Zero re-onboarding.</h2>
              </div>
            </Reveal>
            <div className="steps-row">
              {STEPS.map((s, i) => (
                <Reveal key={s.n} delay={i * 90}>
                  <div className="step">
                    <div className="step-top">
                      <span className="step-n">{s.n}</span>
                      <code className="step-code">{s.code}</code>
                    </div>
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                  </div>
                </Reveal>
              ))}
              <div className="steps-flow" aria-hidden="true" />
            </div>
            <Reveal delay={220}>
              <div className="steps-demo">
                <SnapshotDemo />
              </div>
            </Reveal>
          </div>
        </section>

        <section className="payload-section hairline">
          <div className="wrap payload-grid">
            <Reveal>
              <div className="section-head payload-head">
                <p className="eyebrow">The payload</p>
                <h2>What your agent actually receives.</h2>
                <p>
                  Not a black box: one readable JSON object, scoped to what the agent needs. This is the real
                  shape, straight from <code className="inline-code">get_context</code>. Try the scopes.
                </p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <ContextPreview />
            </Reveal>
          </div>
        </section>

        <section className="features hairline" id="features">
          <div className="wrap">
            <Reveal>
              <div className="section-head">
                <p className="eyebrow">Free core · Apache-2.0</p>
                <h2>The context layer your agents were missing.</h2>
                <p>Everything below ships in the open-source core. Readable source is the trust model.</p>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <SpotlightGrid className="feature-grid">
                {FEATURES.map((f) => (
                  <div className="feature spot" key={f.title} data-tone={f.tone}>
                    <span className="f-icon" aria-hidden="true">
                      {f.icon}
                    </span>
                    <h3>{f.title}</h3>
                    <p>{f.body}</p>
                  </div>
                ))}
              </SpotlightGrid>
            </Reveal>
          </div>
        </section>

        <section className="roam hairline" id="sync">
          <div className="wrap">
            <Reveal>
              <div className="section-head">
                <p className="eyebrow">Take it with you</p>
                <h2>Save in ChatGPT. Continue in Claude.</h2>
                <p>
                  ctxfile is local-first, everywhere you work. An encrypted Sync vault extends the same context
                  to your phone, the web, and any MCP-capable chat app: Claude, ChatGPT, Grok, Perplexity, Le
                  Chat. Add the connector once and every conversation on that account can save a thread and
                  resume it, on any provider.
                </p>
              </div>
            </Reveal>
            <div className="roam-grid">
              {ROAM.map((r, i) => (
                <Reveal key={r.n} delay={i * 90}>
                  <div className="roam-card">
                    <div className="roam-chrome">
                      <span className="roam-n">{r.n}</span>
                      <span>{r.surface}</span>
                      <span className="roam-where">{r.where}</span>
                    </div>
                    <p className="roam-msg">{r.msg}</p>
                    <p className="roam-tool">
                      {r.tool}
                      <span className="roam-note">{r.note}</span>
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={140}>
              <p className="roam-strip">
                Threads ship today, free and local: save_session and continue_thread work between every agent
                on your machine. The encrypted vault is the second beat of this launch, in Standard mode (roams
                everywhere) or Strict (true end-to-end, your own devices only). The trade-offs are spelled out
                honestly in the FAQ below and in the <Link href="/docs/sync">Sync docs</Link>.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="horizon hairline">
          <div className="wrap">
            <Reveal>
              <div className="section-head">
                <p className="eyebrow">Not just for code</p>
                <h2>Your brand brief is context too.</h2>
                <p>
                  Running a marketing project? Your brand voice, guidelines, contacts, and campaign history are
                  working state, and you pay the same re-explaining tax every time you open a new AI tool.
                  ctxfile serves that context to any model the same way it serves a codebase: connect your
                  Notion, snapshot the project, hand it to whichever AI you&apos;re using today. Switch from
                  ChatGPT to Claude mid-campaign and it already knows your brand.
                </p>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className="horizon-cta">
                <span className="horizon-note">
                  Works today via Claude Desktop one-click install. Sync brings it to your phone and every
                  chat app you use.
                </span>
                <Link className="btn-ghost" href="/pricing#sync">
                  Get Sync for knowledge work →
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="pricing-strip hairline" id="pricing">
          <div className="wrap">
            <Reveal>
              <div className="section-head">
                <p className="eyebrow">Pricing</p>
                <h2>Free engine. Paid memory.</h2>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <SpotlightGrid className="tier-grid tier-grid-strip">
                <div className="tier spot">
                  <h2>Free, forever</h2>
                  <p className="price">
                    $0 <small>Apache-2.0</small>
                  </p>
                  <ul>
                    <li>The full context engine: MCP server + get_context</li>
                    <li>Threads: save_session and continue_thread, local</li>
                    <li>File, git, Notion, Ollama connectors</li>
                    <li>Session ingest for any harness</li>
                    <li>Cloud export with redaction profiles</li>
                    <li>Local dashboard</li>
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
                    <li>Automatic session sync across 8 tools</li>
                    <li>Persistent AI-employee memory: hire an agent once, never re-onboard it</li>
                    <li>Multi-agent consult with answer diffing</li>
                    <li>Voice input with repo-aware vocabulary</li>
                    <li>ctxfile serve: the HTTP door on your machine</li>
                  </ul>
                  <Link className="tier-cta" href="/pricing">
                    See full pricing
                  </Link>
                </div>
                <div className="tier spot" data-tier="sync">
                  <h2 style={{ color: "var(--sync)" }}>Sync</h2>
                  <p className="price">
                    $6 <small>/ month</small>
                  </p>
                  <ul>
                    <li>Encrypted vault; your machine stays the source of truth</li>
                    <li>Phone, web, and chat apps: Claude, ChatGPT, Grok</li>
                    <li>Cross-provider threads everywhere</li>
                    <li>Standard or Strict encryption, your call</li>
                    <li>Bundle with Pro for $15/month</li>
                  </ul>
                  <Link className="tier-cta" href="/pricing#sync">
                    See Sync
                  </Link>
                </div>
                <div className="tier spot">
                  <h2>Team, coming</h2>
                  <p className="price">
                    Soon <small>waitlist</small>
                  </p>
                  <ul>
                    <li>Shared writable context</li>
                    <li>Per-agent write permissions</li>
                    <li>Full audit trail</li>
                    <li>Cross-machine sync, self-hosted hub</li>
                    <li>For teams that can&apos;t use cloud AI</li>
                  </ul>
                  <a className="tier-cta" href="mailto:hello@ctxfile.dev?subject=ctxfile%20Team">
                    Talk to us
                  </a>
                </div>
              </SpotlightGrid>
            </Reveal>
          </div>
        </section>

        <section className="faq hairline">
          <div className="wrap">
            <Reveal>
              <div className="section-head">
                <p className="eyebrow">FAQ</p>
                <h2>The launch set.</h2>
              </div>
            </Reveal>
            <div className="faq-list">
              {FAQ.map((item, i) => (
                <Reveal key={item.q} delay={i * 60}>
                  <div className="faq-item">
                    <h3>{item.q}</h3>
                    <p>{item.a}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="final-cta hairline">
          <div className="wrap final-cta-inner">
            <Reveal>
              <p className="vision-strip">
                Today: portable context. Next: <strong>AI employees</strong>, agents with persistent identity
                and memory that survive across sessions <em>and across models</em>. Your research agent stays
                your research agent whether it runs on Claude today or a local model tomorrow. Then: shared
                team memory with permissions and audit. The context layer is how it all connects.
              </p>
              <p className="fed-strip">
                Agents don&apos;t work alone anymore. Neither do companies. <strong>Federation</strong> is
                coming for teams whose agents collaborate across org lines: shared, permissioned, encrypted,
                audited context between organizations.{" "}
                <a href="mailto:hello@ctxfile.dev?subject=ctxfile%20Enterprise%3A%20federation%20inquiry&body=Name%3A%0D%0ACompany%3A%0D%0AWhat%20should%20your%20agents%20share%20(the%20use%20case)%3A%0D%0A">
                  Talk to us
                </a>{" "}
                or read the <Link href="/security">security overview</Link>.
              </p>
              <h2>
                One context. <span className="grad-text">Every agent.</span> All local.
              </h2>
              <div className="final-cta-actions">
                <CopyCommand command={INSTALL} />
                <Link href="/docs" className="btn-ghost">
                  Read the quickstart →
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
