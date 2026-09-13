import { useState } from "react";
import { api, ServerGoneError } from "../lib/api";
import { formatDuration } from "../lib/format";
import type { DashboardState } from "../lib/types";
import { Icon, type IconName } from "../components/Icon";
import { StatusPill } from "../components/StatusPill";
import { useToast } from "../components/Toast";

export interface SettingsProps {
  state: DashboardState;
  onServerGone: () => void;
}

/** Warn threshold for the expiry line: under 30 days renders amber. */
const EXPIRY_WARN_DAYS = 30;

interface ExpiryDisplay {
  label: string;
  warn: boolean;
}

function expiryDisplay(expiresAt: string, now = Date.now()): ExpiryDisplay | null {
  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.getTime())) return null;
  const date = expires.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const daysLeft = Math.floor((expires.getTime() - now) / 86_400_000);
  if (daysLeft < 0) return { label: `expired ${date}`, warn: true };
  return {
    label: `expires ${date} · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
    warn: daysLeft < EXPIRY_WARN_DAYS,
  };
}

const FEATURE_META: Record<"sessions" | "memory" | "consult" | "voice", { label: string; icon: IconName; blurb: string }> = {
  sessions: { label: "Sessions", icon: "sessions", blurb: "Digests from eight agent tools" },
  memory: { label: "Memory & playbooks", icon: "memory", blurb: "Encrypted, provenance-stamped" },
  consult: { label: "Consult", icon: "consult", blurb: "Several providers, one question" },
  voice: { label: "Voice", icon: "cpu", blurb: "Repo-aware whisper.cpp input" },
};

export function Settings({ state, onServerGone }: SettingsProps) {
  const { config, license } = state;
  const info = license.licenseInfo;
  const infoTier = info?.tier ?? null;
  const infoExpiresAt = info?.expiresAt ?? null;
  const tier = !license.active ? "Core (free)" : infoTier !== null ? infoTier.charAt(0).toUpperCase() + infoTier.slice(1) : "Pro";
  const expiry = license.active && infoExpiresAt !== null ? expiryDisplay(infoExpiresAt) : null;
  const [key, setKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const { toast } = useToast();

  const remoteOptIns: { label: string; detail: string; icon: IconName }[] = [
    ...(config.notion.configured
      ? [{ label: "Notion", detail: `${config.notion.pageCount} page${config.notion.pageCount === 1 ? "" : "s"}`, icon: "notion" as IconName }]
      : []),
    ...(config.ollama.summarize
      ? [{ label: "Ollama summarize", detail: `${config.ollama.model ?? "default model"} @ ${config.ollama.baseUrl}`, icon: "cpu" as IconName }]
      : []),
    ...(config.consult.providers.length > 0
      ? [{ label: "Consult providers", detail: config.consult.providers.map((p) => p.type).join(", "), icon: "consult" as IconName }]
      : []),
    ...(config.telemetry.enabled ? [{ label: "Telemetry", detail: "anonymous, opt-in", icon: "globe" as IconName }] : []),
  ];

  const activate = (): void => {
    const trimmed = key.trim();
    if (trimmed === "" || activating) return;
    setActivating(true);
    setResult(null);
    api
      .activateLicense(trimmed)
      .then((res) => {
        setActivating(false);
        setResult({
          ok: true,
          message: `${res.detail}${res.restartRequired ? ". Restart ctxfile to apply." : ""}`,
        });
        setKey("");
        toast("License stored", "ok");
      })
      .catch((err: unknown) => {
        setActivating(false);
        if (err instanceof ServerGoneError) {
          onServerGone();
          return;
        }
        setResult({ ok: false, message: err instanceof Error ? err.message : "activation failed" });
      });
  };

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>Settings</h1>
          <p className="view-sub">Resolved configuration, connectors, license, and the privacy posture of this install.</p>
        </div>
        <span className="chip mono">ctxfile v{state.version}</span>
      </header>

      <section
        className={`panel network-hero${remoteOptIns.length > 0 ? " network-hero-active" : ""}`}
        aria-label="Network activity"
      >
        <div className="network-hero-gauge">
          <div className="network-hero-count num">{remoteOptIns.length}</div>
          <div className="network-hero-unit">remote opt-in{remoteOptIns.length === 1 ? "" : "s"}</div>
        </div>
        <div className="network-hero-text">
          <div className="network-hero-title">
            <Icon name={remoteOptIns.length === 0 ? "shield" : "network"} size={16} />
            {remoteOptIns.length === 0 ? "Fully local" : "Network calls enabled"}
          </div>
          {remoteOptIns.length === 0 ? (
            <div className="network-hero-sub">Nothing leaves this machine. Every connector that would call out is off until you turn it on.</div>
          ) : (
            <ul className="network-hero-list">
              {remoteOptIns.map((item) => (
                <li key={item.label}>
                  <Icon name={item.icon} size={13} />
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="settings-grid">
        <section className="panel">
          <div className="panel-title">
            <span className="git-col-title">
              <Icon name="settings" size={13} />
              Configuration
            </span>
          </div>
          <dl className="kv">
            <KV k="root" v={state.root} mono />
            <KV k="tokenBudget" v={`${config.tokenBudget.toLocaleString()} tokens`} />
            <KV k="maxFileTokens" v={`${config.maxFileTokens.toLocaleString()} tokens per file`} />
            <KV k="cacheMaxAge" v={`${formatDuration(config.cacheMaxAgeMs)} (${config.cacheMaxAgeMs.toLocaleString()} ms)`} />
            <KV k="include" v={config.include.length > 0 ? config.include : "(defaults)"} mono />
            <KV k="exclude" v={config.exclude.length > 0 ? config.exclude : "(defaults)"} mono />
          </dl>
        </section>

        <section className="panel">
          <div className="panel-title">
            <span className="git-col-title">
              <Icon name="network" size={13} />
              Connectors
            </span>
          </div>
          <div className="setting-list">
            <SettingRow
              icon="notion"
              name="Notion"
              on={config.notion.configured}
              detail={config.notion.configured ? `${config.notion.pageCount} pages` : "not configured"}
            />
            <SettingRow
              icon="cpu"
              name="Ollama summarize"
              on={config.ollama.summarize}
              detail={config.ollama.summarize ? `${config.ollama.model ?? "default model"} @ ${config.ollama.baseUrl}` : "off"}
            />
            <SettingRow
              icon="consult"
              name="Consult"
              on={config.consult.providers.length > 0}
              detail={
                config.consult.providers.length > 0
                  ? config.consult.providers.map((p) => `${p.type}${p.model !== null ? `:${p.model}` : ""}`).join(", ")
                  : "no providers"
              }
            />
            <SettingRow icon="cpu" name="Voice (whisper.cpp)" on={config.voice.configured} detail={config.voice.configured ? "configured" : "not configured"} />
          </div>
        </section>

        <section className="panel license-panel">
          <div className="panel-title">
            <span className="git-col-title">
              <Icon name="key" size={13} />
              License
            </span>
            {license.active ? (
              <StatusPill status="ok" label="active" />
            ) : license.installed ? (
              <StatusPill status="error" label={license.status ?? "inactive"} />
            ) : (
              <StatusPill status="pending" label="core (free)" />
            )}
          </div>
          <dl className="kv">
            <KV k="tier" v={tier} />
            {license.installed && license.status !== null && <KV k="status" v={license.status} />}
          </dl>
          {expiry !== null && (
            <div className={`license-expiry mono${expiry.warn ? " license-expiry-warn" : ""}`}>{expiry.label}</div>
          )}
          <div className="feature-grid">
            {(["sessions", "memory", "consult", "voice"] as const).map((feature) => {
              const on = license.features[feature];
              const meta = FEATURE_META[feature];
              return (
                <div key={feature} className={`feature-tile${on ? " is-on" : ""}`}>
                  <span className="feature-tile-icon">
                    <Icon name={on ? "check" : meta.icon} size={14} />
                  </span>
                  <span className="feature-tile-text">
                    <span className="feature-tile-name">{meta.label}</span>
                    <span className="feature-tile-blurb">{meta.blurb}</span>
                  </span>
                  <span className={`chip${on ? " chip-ok" : ""}`}>{feature}</span>
                </div>
              );
            })}
          </div>
          <div className="license-form">
            <input
              type="text"
              className="input mono"
              placeholder="Paste license key…"
              aria-label="License key"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") activate();
              }}
            />
            <button type="button" className="btn btn-primary" onClick={activate} disabled={activating || key.trim() === ""}>
              {activating ? <Icon name="refresh" size={14} className="spin" /> : <Icon name="key" size={14} />}
              {activating ? "Activating…" : "Activate"}
            </button>
          </div>
          <p className="license-note">
            Keys verify locally with Ed25519. You can also run <code className="inline-code">ctxfile activate &lt;key&gt;</code>.
          </p>
          {result !== null && (
            <div className={`banner ${result.ok ? "banner-ok" : "banner-err"}`} role="status">
              <Icon name={result.ok ? "check" : "alert"} size={15} />
              <span>{result.message}</span>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-title">
            <span className="git-col-title">
              <Icon name="shield" size={13} />
              Privacy
            </span>
          </div>
          <div className="setting-list">
            <SettingRow
              icon="globe"
              name="Telemetry"
              on={config.telemetry.enabled}
              detail={config.telemetry.enabled ? "enabled (opt-in)" : "off (default)"}
            />
            <SettingRow icon="shield" name="Redaction" on detail="everything ingested passes redactContent()" />
            <SettingRow icon="eye-off" name="Denied paths" on detail=".env*, keys, credentials (never read)" />
          </div>
        </section>
      </div>
    </div>
  );
}

function KV({ k, v, mono = false }: { k: string; v: string | string[]; mono?: boolean }) {
  return (
    <div className="kv-row">
      <dt>{k}</dt>
      <dd className={mono ? "mono" : undefined}>
        {Array.isArray(v) ? (
          <span className="kv-tags">
            {v.map((item) => (
              <span key={item} className="chip mono">
                {item}
              </span>
            ))}
          </span>
        ) : (
          v
        )}
      </dd>
    </div>
  );
}

function SettingRow({ icon, name, on, detail }: { icon: IconName; name: string; on: boolean; detail: string }) {
  return (
    <div className="setting-row" data-status={on ? "ok" : "pending"}>
      <span className="setting-icon" aria-hidden="true">
        <Icon name={icon} size={14} />
      </span>
      <span className="setting-main">
        <span className="setting-name">{name}</span>
        <span className="setting-detail">{detail}</span>
      </span>
      <StatusPill status={on ? "ok" : "pending"} label={on ? "on" : "off"} />
    </div>
  );
}
