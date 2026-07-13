import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { formatAge } from "../lib/format";
import { parseJsonData, streamSse } from "../lib/sse";
import type { BuildEvent, ConnectorStatus, DashboardState } from "../lib/types";
import { ConnectorRow } from "../components/ConnectorRow";
import { EmptyState } from "../components/EmptyState";
import { StatCard } from "../components/StatCard";
import { TokenMeter } from "../components/TokenMeter";
import type { PillStatus } from "../components/StatusPill";

interface LiveConnector {
  status: PillStatus;
  durationMs?: number;
  error?: string;
}

interface LiveRun {
  running: boolean;
  connectors: Record<string, LiveConnector>;
  tokensUsed: number | null;
  tokenBudget: number | null;
  error: string | null;
}

const IDLE_RUN: LiveRun = {
  running: false,
  connectors: {},
  tokensUsed: null,
  tokenBudget: null,
  error: null,
};

export interface OverviewProps {
  state: DashboardState;
  onStateChanged: () => void;
  /** Bumped by the app-level `R` shortcut to trigger a snapshot. */
  refreshSignal: number;
}

export function Overview({ state, onStateChanged, refreshSignal }: OverviewProps) {
  const [run, setRun] = useState<LiveRun>(IDLE_RUN);
  const [fileStats, setFileStats] = useState<{ files: number; redactions: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState(false);
  const runningRef = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onStateChangedRef = useRef(onStateChanged);
  onStateChangedRef.current = onStateChanged;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  // Key-file count + redaction total come from the context payload, not /state.
  const latestGeneratedAt = state.latest?.generatedAt ?? null;
  useEffect(() => {
    if (latestGeneratedAt === null) return;
    let cancelled = false;
    api
      .context("files")
      .then((ctx) => {
        if (cancelled) return;
        setFileStats({
          files: ctx.keyFiles.length,
          redactions: ctx.keyFiles.reduce((sum, f) => sum + f.redactions, 0),
        });
      })
      .catch(() => {
        if (!cancelled) setFileStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [latestGeneratedAt]);

  // Persistent live-events stream: connector lights + token meter animate during runs.
  useEffect(() => {
    const controller = new AbortController();
    void streamSse("/api/internal/events", {
      signal: controller.signal,
      onEvent: (frame) => {
        const event = parseJsonData<BuildEvent>(frame);
        if (event === null) return;
        if (event.type === "connector:start") {
          runningRef.current = true;
          setRun((prev) => ({
            ...prev,
            running: true,
            error: null,
            connectors: { ...prev.connectors, [event.name]: { status: "running" } },
          }));
        } else if (event.type === "connector:done") {
          const done: ConnectorStatus = event.connector;
          setRun((prev) => ({
            ...prev,
            connectors: {
              ...prev.connectors,
              [done.name]: {
                status: done.status,
                durationMs: done.durationMs,
                ...(done.error !== undefined ? { error: done.error } : {}),
              },
            },
          }));
        } else if (event.type === "tokens") {
          setRun((prev) => ({
            ...prev,
            tokensUsed: event.tokensUsed,
            tokenBudget: event.tokenBudget,
          }));
        } else if (event.type === "done") {
          runningRef.current = false;
          setRun((prev) => ({ ...prev, running: false }));
          setFlash(true);
          if (flashTimer.current !== null) clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setFlash(false), 600);
          onStateChangedRef.current();
        } else if (event.type === "error") {
          runningRef.current = false;
          setRun((prev) => ({ ...prev, running: false, error: event.message }));
        }
      },
    }).catch(() => {
      // stream closed (server restart / tab sleep); the app-level ping handles server-gone
    });
    return () => {
      controller.abort();
      if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    };
  }, []);

  const triggerSnapshot = useCallback((): void => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRun({ ...IDLE_RUN, running: true });
    api.snapshot().catch(() => {
      runningRef.current = false;
      setRun((prev) => ({ ...prev, running: false, error: "failed to start snapshot" }));
    });
  }, []);

  const lastSignal = useRef(refreshSignal);
  useEffect(() => {
    if (refreshSignal !== lastSignal.current) {
      lastSignal.current = refreshSignal;
      triggerSnapshot();
    }
  }, [refreshSignal, triggerSnapshot]);

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

  if (latest === null && !run.running && connectorRows.length === 0) {
    return (
      <div className="view">
        <header className="view-header">
          <h1>Overview</h1>
        </header>
        <EmptyState
          title="No snapshot yet"
          body="ctxfile hasn't captured this project's working state yet. Run the first snapshot to light up connectors, token usage, and key files here."
          action={
            <button type="button" className="btn btn-primary" onClick={triggerSnapshot}>
              Run first snapshot <kbd>R</kbd>
            </button>
          }
        />
      </div>
    );
  }

  const tokensUsed = run.tokensUsed ?? latest?.tokensUsed ?? 0;
  const tokenBudget = run.tokenBudget ?? latest?.tokenBudget ?? state.config.tokenBudget;
  const ageMs = latest !== null ? now - Date.parse(latest.generatedAt) : null;
  const stale = ageMs !== null && ageMs > state.config.cacheMaxAgeMs;
  const maxRecentTokens = Math.max(1, ...state.recent.map((r) => r.tokensUsed));

  return (
    <div className="view">
      <header className="view-header">
        <h1>Overview</h1>
        <button
          type="button"
          className={`btn btn-primary${run.running ? " btn-rec" : ""}`}
          onClick={triggerSnapshot}
          disabled={run.running}
        >
          {run.running ? "Recording…" : "Run snapshot"} <kbd>R</kbd>
        </button>
      </header>

      {run.error !== null && (
        <div className="banner banner-err" role="alert">
          Snapshot failed: {run.error}
        </div>
      )}

      <section
        className={`panel panel-hairline${run.running ? " is-running" : ""}${flash ? " panel-flash" : ""}`}
      >
        <div className="panel-title">Connectors</div>
        <div className="connector-list">
          {connectorRows.map(([name, c]) => (
            <ConnectorRow
              key={name}
              name={name}
              status={c.status}
              {...(c.durationMs !== undefined ? { durationMs: c.durationMs } : {})}
              {...(c.error !== undefined ? { error: c.error } : {})}
            />
          ))}
        </div>
        <TokenMeter tokensUsed={tokensUsed} tokenBudget={tokenBudget} />
      </section>

      <section className="stat-row">
        <StatCard
          label="Tokens used"
          value={tokensUsed.toLocaleString()}
          tone="accent"
          {...(tokenBudget > 0
            ? { sub: `${Math.round((tokensUsed / tokenBudget) * 100)}% of budget` }
            : {})}
        />
        <StatCard label="Key files" value={fileStats !== null ? fileStats.files : "–"} />
        <StatCard
          label="Redactions"
          value={fileStats !== null ? fileStats.redactions : "–"}
          {...(fileStats !== null && fileStats.redactions > 0 ? { tone: "redact" as const } : {})}
        />
        <StatCard
          label="Snapshot age"
          value={ageMs !== null ? formatAge(ageMs) : "–"}
          {...(stale
            ? {
                sub: <span className="stale-flag">stale: older than cache window</span>,
                tone: "warn" as const,
              }
            : {})}
        />
      </section>

      {state.recent.length > 0 && (
        <section className="panel">
          <div className="panel-title">Recent snapshots</div>
          <div className="timeline" aria-label="Recent snapshots">
            {[...state.recent].reverse().map((snap, index) => (
              <div
                key={`${snap.createdAt}-${index}`}
                className="timeline-cell"
                data-tip={`${new Date(snap.createdAt).toLocaleString()} · ${snap.tokensUsed.toLocaleString()} tokens`}
              >
                <div
                  className="timeline-bar"
                  style={{ height: `${Math.max(8, (snap.tokensUsed / maxRecentTokens) * 100)}%` }}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
