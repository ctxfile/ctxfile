import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { CopyCommand } from "@/components/CopyCommand";
import { CodeWindow } from "@/components/Code";
import { Icon } from "@/components/Icons";

export const metadata: Metadata = {
  title: "Design system: ctxfile",
  description:
    "The glass instrument system shared by the ctxfile dashboard and this site: tokens, type, surfaces, signals, and components, rendered live.",
};

interface Token {
  varName: string;
  dark: string;
  light: string;
  role: string;
}

const CANVAS_TOKENS: Token[] = [
  { varName: "--bg", dark: "#09090b", light: "#f6f5f1", role: "Canvas: the page itself" },
  { varName: "--surface-1", dark: "white 4.5%", light: "white 68%", role: "Default panel" },
  { varName: "--surface-2", dark: "white 7.5%", light: "white 90%", role: "Raised panel, hover" },
  { varName: "--surface-solid", dark: "#131316", light: "#ffffff", role: "Opaque: code windows, demos" },
  { varName: "--glass", dark: "rgba(16,16,20,.72)", light: "rgba(250,249,245,.78)", role: "Floating chrome, blurred" },
  { varName: "--line", dark: "white 8%", light: "ink 9%", role: "Hairline borders" },
  { varName: "--line-strong", dark: "white 16%", light: "ink 18%", role: "Emphasised borders, hover" },
  { varName: "--well", dark: "black 35%", light: "ink 5%", role: "Recessed tracks and inputs" },
];

const INK_TOKENS: Token[] = [
  { varName: "--text", dark: "#f2f1ed", light: "#17171a", role: "Primary text" },
  { varName: "--text-2", dark: "#a5a49d", light: "#5b5a55", role: "Secondary text, body copy" },
  { varName: "--text-3", dark: "#6f6e68", light: "#8a8983", role: "Labels, meta, eyebrows" },
  { varName: "--code-text", dark: "#e6e4dc", light: "#23232a", role: "Code and data" },
];

const SIGNAL_TOKENS: Token[] = [
  { varName: "--accent", dark: "#ff5714", light: "#e04a00", role: "Primary actions, active state" },
  { varName: "--ok", dark: "#3fd77e", light: "#12813f", role: "Success, connector ok" },
  { varName: "--warn", dark: "#ffb02e", light: "#94660a", role: "Skipped, stale, expiring" },
  { varName: "--err", dark: "#ff5c50", light: "#bf2f24", role: "Errors, destructive" },
  { varName: "--info", dark: "#7aa2ff", light: "#2f5fd1", role: "Neutral information" },
  { varName: "--redact", dark: "#b892ff", light: "#6a3ecb", role: "Redaction counts" },
  { varName: "--pro", dark: "#e3b25a", light: "#8a6210", role: "Pro tier" },
  { varName: "--sync", dark: "#4ec4e6", light: "#0d7fa6", role: "Sync tier, vault" },
];

const SAMPLE = `{
  "meta": { "tokensUsed": 18432, "tokenBudget": 50000 },
  "plan": "Ship checkout flow: webhook handler, then receipt emails.",
  "keyFiles": [
    { "path": "src/payments/webhook.ts", "tokens": 1284, "redactions": 2 }
  ],
  "gitState": { "branch": "feat/checkout", "ahead": 2, "behind": 0 }
}`;

function Swatches({ tokens }: { tokens: Token[] }) {
  return (
    <div className="swatch-grid">
      {tokens.map((t) => (
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
  );
}

export default function Design() {
  return (
    <>
      <div className="atmosphere" aria-hidden="true" />
      <SiteNav />

      <main className="wrap">
        <div className="pricing-head">
          <p className="eyebrow">Design system</p>
          <h1>Glass, signal, and ink.</h1>
          <p>
            The dashboard and this site share one material system. A deep canvas carries soft colour fields;
            translucent surfaces stack on it; floating chrome blurs what sits behind; small LED-grade signals
            report status; three steps of ink carry the words. This page <em>is</em> the system, rendered live
            from the CSS custom properties. Flip the theme switch and watch every token move together.
          </p>
          <p className="design-note">
            Tokens live in <code className="inline-code">packages/ui-kit/src/tokens.css</code> and are mirrored
            in this site&apos;s stylesheet. Components never hard-code a colour.
          </p>
        </div>

        <section>
          <div className="section-head">
            <p className="eyebrow">Canvas &amp; surfaces</p>
            <h2>Layers, back to front</h2>
            <p>
              Surfaces are translucent, so the canvas glow shows through every panel and no two cards on a
              page are ever quite the same colour. A one-pixel inner highlight on the top edge is the only
              hint of physicality.
            </p>
          </div>
          <div className="surface-stack">
            <div style={{ background: "var(--surface-0)" }}>surface-0</div>
            <div style={{ background: "var(--surface-1)" }}>surface-1</div>
            <div style={{ background: "var(--surface-2)" }}>surface-2</div>
            <div style={{ background: "var(--surface-solid)" }}>surface-solid</div>
          </div>
          <Swatches tokens={CANVAS_TOKENS} />
        </section>

        <section>
          <div className="section-head">
            <p className="eyebrow">Ink</p>
            <h2>Three steps of emphasis</h2>
            <p>Headlines and values in the first step, body in the second, labels and metadata in the third.</p>
          </div>
          <Swatches tokens={INK_TOKENS} />
        </section>

        <section>
          <div className="section-head">
            <p className="eyebrow">Signals</p>
            <h2>Small, vivid, never a wall</h2>
            <p>
              Orange acts. Green, amber, and red report. Violet marks redactions, gold marks Pro, cyan marks
              Sync. Signals appear as glowing dots and tinted chips, never as large blocks of colour.
            </p>
          </div>
          <div className="component-specimens">
            <div className="component-specimen">
              <span className="t-label">LED lamps</span>
              <div className="specimen-row">
                {(["accent", "ok", "warn", "err", "pro", "sync"] as const).map((tone) => (
                  <span key={tone} className="chip">
                    <span className="led" data-tone={tone} /> {tone}
                  </span>
                ))}
                <span className="chip">
                  <span className="led" /> off
                </span>
              </div>
            </div>
            <div className="component-specimen">
              <span className="t-label">Chips</span>
              <div className="specimen-row">
                <span className="chip" data-tone="ok">
                  ok · 512ms
                </span>
                <span className="chip" data-tone="warn">
                  skipped
                </span>
                <span className="chip" data-tone="err">
                  error
                </span>
                <span className="chip" data-tone="redact">
                  6 redactions
                </span>
                <span className="chip" data-tone="sync">
                  synced
                </span>
                <span className="pro-chip">PRO</span>
              </div>
            </div>
          </div>
          <Swatches tokens={SIGNAL_TOKENS} />
        </section>

        <section>
          <div className="section-head">
            <p className="eyebrow">Typography</p>
            <h2>Type scale</h2>
            <p>
              Archivo for everything spoken, with tight tracking on display sizes. IBM Plex Mono for anything
              that is data: paths, counts, commands, timings. Doto is reserved for a handful of large numerals.
            </p>
          </div>
          <div className="type-specimens">
            <div className="type-specimen">
              <span className="t-label">Display · Archivo 800 · clamp(38–62px) · -0.035em</span>
              <p className="specimen-display">One context, every agent.</p>
            </div>
            <div className="type-specimen">
              <span className="t-label">Heading · Archivo 750 · 32px · -0.03em</span>
              <p className="specimen-heading">The context layer your agents were missing.</p>
            </div>
            <div className="type-specimen">
              <span className="t-label">Body · Archivo 400 · 16.5px / 1.6</span>
              <p className="specimen-body">
                ctxfile snapshots your working state into one context object that any MCP agent loads
                instantly, and nothing leaves your machine.
              </p>
            </div>
            <div className="type-specimen">
              <span className="t-label">Eyebrow · Plex Mono 600 · 11.5px · caps · 0.08em</span>
              <p className="eyebrow" style={{ marginBottom: 0 }}>
                Section label
              </p>
            </div>
            <div className="type-specimen">
              <span className="t-label">Mono data · IBM Plex Mono · 13px · tabular-nums</span>
              <p className="specimen-mono">file · 34 files · 6 redactions · 947ms · 18,432 / 50,000 tokens</p>
            </div>
            <div className="type-specimen">
              <span className="t-label">Numeral · Doto 700 · 34px</span>
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
              <span className="t-label">Buttons</span>
              <div className="specimen-row">
                <a className="btn-primary" href="/#install">
                  Install <Icon name="arrow" size={16} />
                </a>
                <a className="btn-ghost" href="/docs">
                  Read the docs
                </a>
                <a className="btn-pro" href="/pricing">
                  Pro: $12/month
                </a>
                <a className="nav-cta" href="/#install">
                  Install
                </a>
              </div>
            </div>

            <div className="component-specimen">
              <span className="t-label">Connector rows · running / ok / skipped / locked</span>
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
              <span className="t-label">Token meter</span>
              <div className="meter-block" style={{ borderTop: "none", padding: "0 0 4px", margin: 0 }}>
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
              <span className="t-label" style={{ marginTop: 22 }}>
                Redaction chip
              </span>
              <span className="row-detail">
                <span className="redact-chip">6 redactions</span>
              </span>
            </div>

            <div className="component-specimen" style={{ gridColumn: "1 / -1" }}>
              <span className="t-label">Code window · JSON · line numbers</span>
              <CodeWindow code={SAMPLE} lang="json" title="get_context(scope: full)" lineNumbers />
            </div>

            <div className="component-specimen" style={{ gridColumn: "1 / -1" }}>
              <span className="t-label">Code window · shell</span>
              <CodeWindow
                code={`# register once, serve every client on the machine\nnpm install -g ctxfile\nclaude mcp add ctxfile -- ctxfile --root .`}
                lang="bash"
              />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
