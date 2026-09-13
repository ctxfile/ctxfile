import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatAge, formatCompact, formatDuration, percent, splitPath } from "../lib/format";
import { useNow, type LiveConnector, type LiveRun } from "../lib/hooks";
import type { DashboardState, KeyFile } from "../lib/types";
import { ConnectorRow } from "../components/ConnectorRow";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { Ring } from "../components/Ring";
import { Sparkline } from "../components/Sparkline";
import { StatCard } from "../components/StatCard";
import { TokenMeter } from "../components/TokenMeter";

export interface OverviewProps {
  state: DashboardState;
  run: LiveRun;
  onRunSnapshot: () => void;
  onOpenContext: (path?: string) => void;
}

interface FileStats {
  files: number;
  redactions: number;
  truncated: number;
  top: KeyFile[];
}

export function Overview({ state, run, onRunSnapshot, onOpenContext }: OverviewProps) {
  const [fileStats, setFileStats] = useState<FileStats | null>(null);
  const now = useNow();
  const [flash, setFlash] = useState(false);

  // Key-file stats come from the context payload, not /state.
  const latestGeneratedAt = state.latest?.generatedAt ?? null;
  useEffect(() => {
    if (latestGeneratedAt === null) return;
    let cancelled = false;
    api
      .context("files")
      .then((ctx) => {
        if (cancelled) return;
        const top = [...ctx.keyFiles].sort((a, b) => b.tokens - a.tokens).slice(0, 8);
        setFileStats({
          files: ctx.keyFiles.length,
          redactions: ctx.keyFiles.reduce((sum, f) => sum + f.redactions, 0),
          truncated: ctx.keyFiles.filter((f) => f.truncated).length,
          top,
        });
      })
      .catch(() => {
        if (!cancelled) setFileStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [latestGeneratedAt]);

  // Green confirmation flash when a run completes.
  useEffect(() => {
    if (run.completedRuns === 0) return;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(timer);
  }, [run.completedRuns]);

  const latest = state.latest;

  const connectorRows = useMemo(() => {
    const base = new Map<string, LiveConnector>();
    for (const c of latest?.connectors ?? []) {
      base.set(c.name, {
        status: c.status,
        durationMs: c.durationMs,
        ...(c.error !== undefined ? { error: c.error } : {}),
      });
    }
    for (const [name, live] of Object.entries(run.connectors)) base.set(name, live);
    return [...base.entries()];
  }, [latest, run.connectors]);

  const maxDuration = Math.max(0, ...connectorRows.map(([, c]) => c.durationMs ?? 0));
  const totalDuration = connectorRows.reduce((sum, [, c]) => sum + (c.durationMs ?? 0), 0);
  const okCount = connectorRows.filter(([, c]) => c.status === "ok").length;
  const errCount = connectorRows.filter(([, c]) => c.status === "error").length;

  if (latest === null && !run.running && connectorRows.length === 0) {
    return (
      <div className="view">
        <ViewHeader run={run} onRunSnapshot={onRunSnapshot} />
        <EmptyState
          icon="play"
          title="No snapshot yet"
          body="ctxfile hasn't captured this project's working state. Run the first snapshot to light up connectors, the token budget, and key files here."
          action={
            <button type="button" className="btn btn-primary" onClick={onRunSnapshot}>
              <Icon name="play" size={14} />
              Run first snapshot <kbd>R</kbd>
            </button>
          }
        />
        <section className="grid-3">
          <Hint icon="context" title="Context, browsable" body="Every key file, the plan, and git state as one inspectable object." />
          <Hint icon="shield" title="Redacted before storage" body="Secrets and denied paths never reach the snapshot." />
          <Hint icon="command" title="Keyboard first" body="Press ⌘K for the palette, R to snapshot, 1–8 to switch views." />
        </section>
      </div>
    );
  }

  const tokensUsed = run.tokensUsed ?? latest?.tokensUsed ?? 0;
  const tokenBudget = run.tokenBudget ?? latest?.tokenBudget ?? state.config.tokenBudget;
  const ratio = tokenBudget > 0 ? tokensUsed / tokenBudget : 0;
  const ageMs = latest !== null ? now - Date.parse(latest.generatedAt) : null;
  const stale = ageMs !== null && ageMs > state.config.cacheMaxAgeMs;
  const points = state.recent.map((r) => ({ at: r.createdAt, value: r.tokensUsed }));
  const maxTopTokens = Math.max(1, ...(fileStats?.top.map((f) => f.tokens) ?? [1]));

  return (
    <div className="view">
      <ViewHeader run={run} onRunSnapshot={onRunSnapshot} />

      {run.error !== null && (
        <div className="banner banner-err" role="alert">
          <Icon name="alert" size={15} />
          <span>Snapshot failed: {run.error}</span>
        </div>
      )}

      <section className={`hero-grid${run.running ? " is-running" : ""}${flash ? " panel-flash" : ""}`}>
        <div className="panel hero-budget">
          <div className="panel-title">
            Token budget
            <span className="panel-title-meta num">{percent(tokensUsed, tokenBudget)}% used</span>
          </div>
          <div className="hero-budget-body">
            <Ring ratio={ratio} ariaLabel={`${tokensUsed.toLocaleString()} of ${tokenBudget.toLocaleString()} tokens used`}>
              <span className="ring-value num">{formatCompact(tokensUsed)}</span>
              <span className="ring-sub num">of {formatCompact(tokenBudget)}</span>
            </Ring>
            <div className="hero-budget-facts">
              <Fact label="Tokens used" value={tokensUsed.toLocaleString()} />
              <Fact label="Budget" value={tokenBudget.toLocaleString()} />
              <Fact
                label="Headroom"
                value={
                  tokensUsed > tokenBudget
                    ? `−${(tokensUsed - tokenBudget).toLocaleString()}`
                    : (tokenBudget - tokensUsed).toLocaleString()
                }
                tone={tokensUsed > tokenBudget ? "err" : undefined}
              />
              <Fact
                label="Snapshot age"
                value={ageMs !== null ? formatAge(ageMs) : "–"}
                tone={stale ? "warn" : undefined}
                hint={stale ? "older than the cache window" : undefined}
              />
            </div>
          </div>
          <TokenMeter tokensUsed={tokensUsed} tokenBudget={tokenBudget} hideCaption />
        </div>

        <div className="panel hero-connectors">
          <div className="panel-title">
            Connectors
            <span className="panel-title-meta num">
              {run.running ? (
                <span className="live-text">
                  <span className="led led-running" aria-hidden="true" /> recording
                </span>
              ) : (
                <>
                  {okCount} ok{errCount > 0 ? ` · ${errCount} failed` : ""}
                  {totalDuration > 0 ? ` · ${formatDuration(totalDuration)}` : ""}
                </>
              )}
            </span>
          </div>
          <div className="connector-list">
            {connectorRows.map(([name, c]) => (
              <ConnectorRow
                key={name}
                name={name}
                status={c.status}
                maxDurationMs={maxDuration}
                {...(c.durationMs !== undefined ? { durationMs: c.durationMs } : {})}
                {...(c.error !== undefined ? { error: c.error } : {})}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="stat-row">
        <StatCard
          label="Key files"
          icon="file"
          value={fileStats !== null ? fileStats.files.toLocaleString() : "–"}
          {...(fileStats !== null && fileStats.truncated > 0
            ? { sub: `${fileStats.truncated} truncated to fit` }
            : { sub: "ranked by relevance" })}
        />
        <StatCard
          label="Redactions"
          icon="shield"
          value={fileStats !== null ? fileStats.redactions.toLocaleString() : "–"}
          sub={fileStats !== null && fileStats.redactions > 0 ? "secrets removed before storage" : "nothing needed redacting"}
          {...(fileStats !== null && fileStats.redactions > 0 ? { tone: "redact" as const } : {})}
        />
        <StatCard
          label="Connectors"
          icon="network"
          value={`${okCount}/${connectorRows.length}`}
          sub={errCount > 0 ? `${errCount} reporting errors` : "all healthy"}
          {...(errCount > 0 ? { tone: "warn" as const } : { tone: "ok" as const })}
        />
        <StatCard
          label="Snapshots"
          icon="clock"
          value={state.recent.length.toLocaleString()}
          sub={latest !== null ? `last ${formatAge(ageMs ?? 0)}` : "none yet"}
          {...(stale ? { tone: "warn" as const } : {})}
        />
      </section>

      <section className="grid-2 grid-2-wide">
        <div className="panel">
          <div className="panel-title">
            Token usage over time
            <span className="panel-title-meta num">budget {formatCompact(tokenBudget)}</span>
          </div>
          {points.length > 0 ? (
            <Sparkline points={points} reference={tokenBudget} ariaLabel="Tokens used per recent snapshot" />
          ) : (
            <EmptyState compact icon="clock" title="No history yet" body="Each snapshot adds a point here." />
          )}
        </div>

        <div className="panel">
          <div className="panel-title">
            Heaviest files
            <button type="button" className="link-btn" onClick={() => onOpenContext()}>
              Open context <Icon name="chevron-right" size={12} />
            </button>
          </div>
          {fileStats === null ? (
            <EmptyState compact icon="file" title="Loading files…" />
          ) : fileStats.top.length === 0 ? (
            <EmptyState compact icon="file" title="No key files captured" />
          ) : (
            <ul className="topfiles">
              {fileStats.top.map((file) => {
                const { dir, base } = splitPath(file.path);
                return (
                  <li key={file.path}>
                    <button type="button" className="topfile" onClick={() => onOpenContext(file.path)} title={file.path}>
                      <span className="topfile-path mono">
                        <span className="topfile-dir">{dir}</span>
                        <span className="topfile-base">{base}</span>
                      </span>
                      <span className="topfile-bar" aria-hidden="true">
                        <span style={{ width: `${(file.tokens / maxTopTokens) * 100}%` }} />
                      </span>
                      <span className="topfile-tokens num">{formatCompact(file.tokens)}</span>
                      {file.redactions > 0 && (
                        <span className="chip chip-redact num" title={`${file.redactions} redactions`}>
                          <Icon name="shield" size={11} /> {file.redactions}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function ViewHeader({ run, onRunSnapshot }: { run: LiveRun; onRunSnapshot: () => void }) {
  return (
    <header className="view-header">
      <div>
        <h1>Overview</h1>
        <p className="view-sub">Snapshot health, connector timing, and where the token budget goes.</p>
      </div>
      <button
        type="button"
        className={`btn btn-primary${run.running ? " is-running" : ""}`}
        onClick={onRunSnapshot}
        disabled={run.running}
      >
        <Icon name={run.running ? "refresh" : "play"} size={14} className={run.running ? "spin" : undefined} />
        {run.running ? "Recording…" : "Run snapshot"} <kbd>R</kbd>
      </button>
    </header>
  );
}

function Fact({ label, value, tone, hint }: { label: string; value: string; tone?: "warn" | "err"; hint?: string }) {
  return (
    <div className={`fact${tone !== undefined ? ` fact-${tone}` : ""}`} title={hint}>
      <span className="fact-label">{label}</span>
      <span className="fact-value num">{value}</span>
    </div>
  );
}

function Hint({ icon, title, body }: { icon: "context" | "shield" | "command"; title: string; body: string }) {
  return (
    <div className="panel hint-card">
      <span className="hint-icon">
        <Icon name={icon} size={16} />
      </span>
      <div>
        <div className="hint-title">{title}</div>
        <div className="hint-body">{body}</div>
      </div>
    </div>
  );
}
