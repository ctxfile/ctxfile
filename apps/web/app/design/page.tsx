import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { CopyCommand } from "@/components/CopyCommand";

export const metadata: Metadata = {
  title: "Design system: ctxfile",
  description: "The instrument material system shared by the ctxfile dashboard and this site, rendered live.",
};

interface Token {
  varName: string;
  dark: string;
  light: string;
  role: string;
}

const COLOR_TOKENS: Token[] = [
  { varName: "--face", dark: "#151513", light: "#d7d6cf", role: "Chassis: page and device body" },
  { varName: "--face-2", dark: "#1c1b19", light: "#e2e1da", role: "Raised module faces" },
  { varName: "--well", dark: "#10100e", light: "#c8c7be", role: "Recessed wells: inputs, tags" },
  { varName: "--line", dark: "rgba(255,255,255,.09)", light: "rgba(32,31,25,.16)", role: "Machining hairlines" },
  { varName: "--text", dark: "#ece9e1", light: "#201f1a", role: "Primary text" },
  { varName: "--text-2", dark: "#a6a396", light: "#55534a", role: "Secondary text" },
  { varName: "--text-3", dark: "#767263", light: "#676458", role: "Engraved labels, meta" },
  { varName: "--screen", dark: "#0c0e0d", light: "#0c0e0d", role: "LCD screens: constant, data lives here" },
  { varName: "--screen-text", dark: "#dbe5d8", light: "#dbe5d8", role: "On-screen text" },
  { varName: "--screen-green", dark: "#56df88", light: "#56df88", role: "Phosphor green: live signals" },
  { varName: "--accent", dark: "#ff5714", light: "#e04a00", role: "International orange: actions, active" },
  { varName: "--ok", dark: "#3fd77e", light: "#12813f", role: "Success: connector ok" },
  { varName: "--warn", dark: "#ffb02e", light: "#94660a", role: "Warning: skipped, stale" },
  { varName: "--err", dark: "#ff5c50", light: "#bf2f24", role: "Error: connector failed" },
  { varName: "--redact", dark: "#b892ff", light: "#6a3ecb", role: "Redaction violet" },
  { varName: "--pro", dark: "#d9a23c", light: "#8a6210", role: "Pro brass" },
];

export default function Design() {
  return (
    <>
      <div className="atmosphere" aria-hidden="true" />
      <SiteNav />

      <main className="wrap">
        <div className="pricing-head">
          <p className="eyebrow">Design system</p>
          <h1>Chassis, screens, and dot-matrix truth.</h1>
          <p>
            The dashboard and this site render as one instrument. Two materials rule everything: controls and
            copy live on the <strong>chassis</strong>; data renders on dark <strong>LCD screens</strong>. This
            page <em>is</em> the design system, rendered.
          </p>
          <p className="design-note">
            Every swatch and specimen below is painted with the live CSS custom properties. Flip the theme
            switch: the chassis swaps between black and silver, and the screens stay dark, like real hardware.
          </p>
        </div>

        <section>
          <div className="section-head">
            <p className="eyebrow">Color</p>
            <h2>Tokens</h2>
            <p>
              Orange acts, brass sells, violet redacts, green/amber/red report. LED lamp colors stay vivid in
              both themes because a lamp is a light, not a print.
            </p>
          </div>
          <div className="swatch-grid">
            {COLOR_TOKENS.map((t) => (
              <div className="swatch" key={t.varName}>
                <div className="swatch-chip" style={{ background: `var(${t.varName})` }} />
                <div className="swatch-meta">
                  <span className="s-name">{t.varName}</span>
                  <span className="s-value">
                    {t.dark} · {t.light}
                  </span>
                  <span className="s-role">{t.role}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="section-head">
            <p className="eyebrow">Typography</p>
            <h2>Type scale</h2>
            <p>
              Archivo for everything printed on the chassis, IBM Plex Mono for anything that is data (paths,
              counts, commands, timings), and Doto, a dot-matrix face, for numbers that glow on screens.
            </p>
          </div>
          <div className="type-specimens">
            <div className="type-specimen">
              <span className="t-label">Display · Archivo 800 · clamp(36–56px) · -0.035em</span>
              <p className="specimen-display">One context, every agent.</p>
            </div>
            <div className="type-specimen">
              <span className="t-label">Heading · Archivo 750 · 30px · -0.028em</span>
              <p className="specimen-heading">The context layer your agents were missing.</p>
            </div>
            <div className="type-specimen">
              <span className="t-label">Body · Archivo 400 · 16px / 1.55</span>
              <p className="specimen-body">
                ctxfile snapshots your working state into one context object that any MCP agent loads
                instantly, and nothing leaves your machine.
              </p>
            </div>
            <div className="type-specimen">
              <span className="t-label">Mono data · IBM Plex Mono · 13px · tabular-nums</span>
              <p className="specimen-mono">file · 34 files · 6 redactions · 947ms · 18,432 / 50,000 tokens</p>
            </div>
            <div className="type-specimen">
              <span className="t-label">LED readout · Doto 700 · on screen</span>
              <p className="specimen-led num">18,432</p>
            </div>
          </div>
        </section>

        <section>
          <div className="section-head">
            <p className="eyebrow">Components</p>
            <h2>Live specimens</h2>
            <p>Built with the same CSS classes the real pages use. Not illustrations of components, the components.</p>
          </div>
          <div className="component-specimens">
            <div className="component-specimen">
              <span className="t-label">Install command</span>
              <CopyCommand command="npm install -g ctxfile" />
            </div>

            <div className="component-specimen">
              <span className="t-label">Channel strips · running / ok / skipped / locked</span>
              <div className="connector-row" data-state="running">
                <span className="row-light" aria-hidden="true" />
                <span className="row-name">file</span>
                <span className="row-detail">walking project…</span>
                <span className="row-ms" />
              </div>
              <div className="connector-row" data-state="ok">
                <span className="row-light" aria-hidden="true" />
                <span className="row-name">git</span>
                <span className="row-detail">main · ↑2 · 3 recent commits</span>
                <span className="row-ms">512ms</span>
              </div>
              <div className="connector-row" data-state="skipped">
                <span className="row-light" aria-hidden="true" />
                <span className="row-name">notion</span>
                <span className="row-detail">not configured (opt-in)</span>
                <span className="row-ms">2ms</span>
              </div>
              <div className="connector-row" data-state="locked">
                <span className="row-light" aria-hidden="true" />
                <span className="row-name">sessions</span>
                <span className="row-detail">
                  claude code · cursor <span className="pro-chip">PRO</span>
                </span>
                <span className="row-ms" />
              </div>
            </div>

            <div className="component-specimen">
              <span className="t-label">Segmented LED token meter</span>
              <div className="meter-block" style={{ borderTop: "none", padding: "0 0 4px" }}>
                <div className="meter-labels">
                  <span>token budget</span>
                  <span className="used">18,432 / 50,000 · 37%</span>
                </div>
                <div
                  className="meter-track"
                  role="progressbar"
                  aria-valuenow={18432}
                  aria-valuemin={0}
                  aria-valuemax={50000}
                  aria-label="Token budget used"
                >
                  <div className="meter-fill" style={{ width: "37%" }} />
                </div>
              </div>
            </div>

            <div className="component-specimen">
              <span className="t-label">Plates &amp; keys</span>
              <div className="specimen-row">
                <span className="pro-chip">PRO</span>
                <span className="row-detail">
                  <span className="redact-chip">⛨ 6 redactions</span>
                </span>
                <a className="nav-cta" href="/#install">
                  install
                </a>
                <a className="btn-pro" href="/pricing">
                  Pro: $12/month
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
