import { useState } from "react";
import { api, ServerGoneError } from "../lib/api";
import type { DashboardState } from "../lib/types";
import { StatusPill } from "../components/StatusPill";

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

export function Settings({ state, onServerGone }: SettingsProps) {
  const { config, license } = state;
  const info = license.licenseInfo;
  const infoTier = info?.tier ?? null;
  const infoExpiresAt = info?.expiresAt ?? null;
  const tier = !license.active
    ? "Core (free)"
    : infoTier !== null
      ? infoTier.charAt(0).toUpperCase() + infoTier.slice(1)
      : "Pro";
  const expiry = license.active && infoExpiresAt !== null ? expiryDisplay(infoExpiresAt) : null;
  const [key, setKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const remoteOptIns: string[] = [
    ...(config.notion.configured ? [`Notion (${config.notion.pageCount} pages)`] : []),
    ...(config.ollama.summarize
      ? [`Ollama summarize (${config.ollama.model ?? "default model"} @ ${config.ollama.baseUrl})`]
      : []),
    ...(config.consult.providers.length > 0
      ? [`Consult providers (${config.consult.providers.map((p) => p.type).join(", ")})`]
      : []),
    ...(config.telemetry.enabled ? ["Telemetry"] : []),
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
        <h1>Settings</h1>
        <span className="chip mono">v{state.version}</span>
      </header>

      <section
        className={`panel network-hero${remoteOptIns.length > 0 ? " network-hero-active" : ""}`}
        aria-label="Network activity"
      >
        <div className="network-hero-count mono num">{remoteOptIns.length}</div>
        <div className="network-hero-text">
          <div className="network-hero-title">Network calls</div>
          {remoteOptIns.length === 0 ? (
            <div className="network-hero-sub">Fully local. Nothing leaves this machine.</div>
          ) : (
            <div className="network-hero-sub">
              Enabled remote opt-in{remoteOptIns.length > 1 ? "s" : ""}:{" "}
              {remoteOptIns.join(" · ")}
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">Configuration</div>
        <dl className="kv mono">
          <KV k="root" v={state.root} />
          <KV k="tokenBudget" v={config.tokenBudget.toLocaleString()} />
          <KV k="maxFileTokens" v={config.maxFileTokens.toLocaleString()} />
          <KV k="cacheMaxAgeMs" v={config.cacheMaxAgeMs.toLocaleString()} />
          <KV k="include" v={config.include.length > 0 ? config.include.join(", ") : "(defaults)"} />
          <KV k="exclude" v={config.exclude.length > 0 ? config.exclude.join(", ") : "(defaults)"} />
        </dl>
      </section>

      <section className="panel">
        <div className="panel-title">Connectors</div>
        <div className="connector-list">
          <SettingRow name="Notion" on={config.notion.configured} detail={config.notion.configured ? `${config.notion.pageCount} pages` : "not configured"} />
          <SettingRow name="Ollama summarize" on={config.ollama.summarize} detail={config.ollama.summarize ? `${config.ollama.model ?? "default model"} @ ${config.ollama.baseUrl}` : "off"} />
          <SettingRow name="Consult" on={config.consult.providers.length > 0} detail={config.consult.providers.length > 0 ? config.consult.providers.map((p) => `${p.type}${p.model !== null ? `:${p.model}` : ""}`).join(", ") : "no providers"} />
          <SettingRow name="Voice (whisper.cpp)" on={config.voice.configured} detail={config.voice.configured ? "configured" : "not configured"} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          License{" "}
          {license.active ? (
            <StatusPill status="ok" label="active" />
          ) : license.installed ? (
            <StatusPill status="error" label={license.status ?? "inactive"} />
          ) : (
            <StatusPill status="pending" label="core (free)" />
          )}
        </div>
        <dl className="kv mono">
          <KV k="tier" v={tier} />
          {license.installed && license.status !== null && <KV k="status" v={license.status} />}
        </dl>
        {expiry !== null && (
          <div className={`license-expiry mono${expiry.warn ? " license-expiry-warn" : ""}`}>
            {expiry.label}
          </div>
        )}
        <div className="license-features">
          {(["sessions", "memory", "consult", "voice"] as const).map((feature) => (
            <span
              key={feature}
              className={`chip${license.features[feature] ? " chip-ok" : ""}`}
            >
              {feature}
              {license.features[feature] ? " ✓" : ""}
            </span>
          ))}
        </div>
        <div className="license-form">
          <input
            type="text"
            className="search-input mono"
            placeholder="Paste license key…"
            aria-label="License key"
            value={key}
            onChange={(event) => setKey(event.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={activate}
            disabled={activating || key.trim() === ""}
          >
            {activating ? "Activating…" : "Activate"}
          </button>
        </div>
        {result !== null && (
          <div className={`banner ${result.ok ? "banner-ok" : "banner-err"}`} role="status">
            {result.message}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-title">Privacy</div>
        <div className="connector-list">
          <SettingRow
            name="Telemetry"
            on={config.telemetry.enabled}
            detail={config.telemetry.enabled ? "enabled (opt-in)" : "off (default)"}
          />
          <SettingRow name="Redaction" on detail="everything ingested passes redactContent()" />
          <SettingRow name="Denied paths" on detail=".env*, keys, credentials (never read)" />
        </div>
      </section>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="kv-row">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function SettingRow({ name, on, detail }: { name: string; on: boolean; detail: string }) {
  return (
    <div className="connector-row" data-status={on ? "ok" : "pending"}>
      <span className="connector-name">{name}</span>
      <span className="connector-right">
        <span className="connector-duration">{detail}</span>
        <StatusPill status={on ? "ok" : "pending"} label={on ? "on" : "off"} />
      </span>
    </div>
  );
}
