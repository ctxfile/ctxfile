"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Scripted replay of a real snapshot run. The event names and shapes mirror
 * the actual SSE wire format of `ctxfile ui` (connector:start,
 * connector:done, tokens, done). This is the product demoing itself,
 * not a mock of an imaginary one.
 */

type RowState = "idle" | "running" | "ok" | "skipped" | "locked";

interface Row {
  name: string;
  state: RowState;
  detail: React.ReactNode;
  ms: string;
}

const TOKEN_BUDGET = 50_000;
const TOKENS_USED = 18_432;

const IDLE_ROWS: Row[] = [
  { name: "file", state: "idle", detail: "", ms: "" },
  { name: "git", state: "idle", detail: "", ms: "" },
  { name: "notion", state: "idle", detail: "", ms: "" },
  { name: "ollama-summary", state: "idle", detail: "", ms: "" },
  {
    name: "sessions",
    state: "locked",
    detail: "claude code · cursor digests",
    ms: "",
  },
];

interface ScriptStep {
  at: number;
  apply: (rows: Row[]) => Row[];
  status?: React.ReactNode;
  tokens?: number;
}

function setRow(rows: Row[], name: string, patch: Partial<Row>): Row[] {
  return rows.map((r) => (r.name === name ? { ...r, ...patch } : r));
}

const SCRIPT: ScriptStep[] = [
  {
    at: 150,
    apply: (rows) => setRow(rows, "file", { state: "running", detail: "walking project…" }),
    status: "event: connector:start",
  },
  {
    at: 320,
    apply: (rows) => setRow(rows, "git", { state: "running", detail: "reading state…" }),
  },
  {
    at: 480,
    apply: (rows) => setRow(rows, "notion", { state: "skipped", detail: "not configured (opt-in)", ms: "2ms" }),
  },
  {
    at: 860,
    apply: (rows) =>
      setRow(rows, "git", { state: "ok", detail: "main · ↑2 · 3 recent commits", ms: "512ms" }),
    status: "event: connector:done",
  },
  {
    at: 1120,
    apply: (rows) =>
      setRow(rows, "file", {
        state: "ok",
        detail: (
          <>
            34 files · <span className="redact-chip">⛨ 6 redactions</span>
          </>
        ),
        ms: "947ms",
      }),
  },
  {
    at: 1300,
    apply: (rows) => setRow(rows, "ollama-summary", { state: "running", detail: "local model summarizing…" }),
  },
  {
    at: 2150,
    apply: (rows) =>
      setRow(rows, "ollama-summary", { state: "ok", detail: "session digest · 212 tokens", ms: "843ms" }),
    tokens: TOKENS_USED,
    status: "event: tokens",
  },
  {
    at: 2600,
    apply: (rows) => rows,
    status: (
      <span className="ready">context ready · 2.1s · nothing left your machine</span>
    ),
  },
];

const FINAL_ROWS: Row[] = SCRIPT.reduce((rows, step) => step.apply(rows), IDLE_ROWS);

export function SnapshotDemo() {
  const [rows, setRows] = useState<Row[]>(IDLE_ROWS);
  const [tokens, setTokens] = useState(0);
  const [status, setStatus] = useState<React.ReactNode>("event: snapshot · POST /api/internal/snapshot");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const play = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRows(FINAL_ROWS);
      setTokens(TOKENS_USED);
      setStatus(<span className="ready">context ready · 2.1s · nothing left your machine</span>);
      return;
    }

    setRows(IDLE_ROWS);
    setTokens(0);
    setStatus("event: snapshot · POST /api/internal/snapshot");
    for (const step of SCRIPT) {
      timers.current.push(
        setTimeout(() => {
          setRows((prev) => step.apply(prev));
          if (step.status !== undefined) setStatus(step.status);
          if (step.tokens !== undefined) setTokens(step.tokens);
        }, step.at)
      );
    }
  }, []);

  useEffect(() => {
    play();
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, [play]);

  const pct = Math.round((tokens / TOKEN_BUDGET) * 100);

  return (
    <div className="demo" aria-label="Live demo of a ctxfile snapshot run">
      <div className="demo-titlebar">
        <span className="demo-lamp" aria-hidden="true" />
        <span className="demo-title">ctxfile ui · 127.0.0.1:4747</span>
        <button className="demo-replay" onClick={play}>
          ↻ replay
        </button>
      </div>
      <div className="demo-body">
        {rows.map((row) => (
          <div className="connector-row" data-state={row.state} key={row.name}>
            <span className="row-light" aria-hidden="true" />
            <span className="row-name">{row.name}</span>
            <span className="row-detail">
              {row.state === "locked" ? (
                <>
                  {row.detail} <span className="pro-chip">PRO</span>
                </>
              ) : (
                row.detail
              )}
            </span>
            <span className="row-ms">{row.ms}</span>
          </div>
        ))}

        <div className="meter-block">
          <div className="meter-labels">
            <span>token budget</span>
            <span className="used">
              {tokens.toLocaleString("en-US")} / {TOKEN_BUDGET.toLocaleString("en-US")} · {pct}%
            </span>
          </div>
          <div
            className="meter-track"
            role="progressbar"
            aria-valuenow={tokens}
            aria-valuemin={0}
            aria-valuemax={TOKEN_BUDGET}
            aria-label="Token budget used"
          >
            <div className="meter-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <p className="demo-status">{status}</p>
      </div>
    </div>
  );
}
