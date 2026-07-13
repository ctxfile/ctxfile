import { useEffect, useState } from "react";
import { api, ServerGoneError } from "../lib/api";
import type { ProFeatures, SessionDigest } from "../lib/types";
import { EmptyState } from "../components/EmptyState";
import { ProLock } from "../components/ProLock";

const FIXTURE_SESSIONS: SessionDigest[] = [
  {
    source: "claude-code",
    sessionId: "a1b2c3d4",
    startedAt: "2026-07-10T09:12:00Z",
    lastActiveAt: "2026-07-10T11:48:00Z",
    turnCount: 42,
    digest: "Refactored the snapshot cache invalidation; fixed a fingerprint mismatch and added tests…",
  },
  {
    source: "cursor",
    sessionId: "e5f6a7b8",
    startedAt: "2026-07-09T15:02:00Z",
    lastActiveAt: "2026-07-09T16:30:00Z",
    turnCount: 18,
    digest: "Explored the license verification flow and wired the activation CLI command…",
  },
];

export interface SessionsProps {
  features: ProFeatures;
  onServerGone: () => void;
}

export function Sessions({ features, onServerGone }: SessionsProps) {
  const [sessions, setSessions] = useState<SessionDigest[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(features.sessions);

  useEffect(() => {
    if (!features.sessions) return;
    let cancelled = false;
    api
      .context("full")
      .then((ctx) => {
        if (cancelled) return;
        setSessions(ctx.sessions ?? []);
        setSummary(ctx.sessionSummary);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ServerGoneError) onServerGone();
        setError(err instanceof Error ? err.message : "failed to load sessions");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [features.sessions, onServerGone]);

  if (!features.sessions) {
    return (
      <div className="view">
        <header className="view-header">
          <h1>Sessions</h1>
        </header>
        <ProLock
          feature="sessions"
          pitch="See what your AI agents were working on: session digests from eight tools, redacted and local."
          bullets={[
            "Claude Code, Cursor, Codex, OpenCode, Gemini CLI, Aider, OpenClaw, Hermes",
            "Redacted before anything is displayed",
            "Read-only copies, never touches live sessions",
          ]}
        >
          <SessionList sessions={FIXTURE_SESSIONS} />
        </ProLock>
      </div>
    );
  }

  return (
    <div className="view">
      <header className="view-header">
        <h1>Sessions</h1>
      </header>
      {loading && <div className="loading">Loading sessions…</div>}
      {!loading && error !== null && (
        <div className="banner banner-err" role="alert">
          {error}
        </div>
      )}
      {!loading && error === null && (sessions === null || sessions.length === 0) && (
        <EmptyState
          title="No sessions captured yet"
          body={
            <>
              Parsers cover Claude Code, Cursor, Codex, OpenCode, Gemini CLI, Aider, OpenClaw, and Hermes;
              sessions appear after the next snapshot that finds them. On any other harness, or if these look
              stale, paste the sync prompt into your agent:
              <pre className="empty-snippet">
                {"Summarize this session, then call the ctxfile ingest_context tool:\n" +
                  'ctxfile_ingest_schema "1", source.harness (your tool or custom:<name>),\n' +
                  "session.summary, key_decisions, files_touched, open_items.\n" +
                  "On a validation error, fix the listed fields and retry once."}
              </pre>
            </>
          }
        />
      )}
      {!loading && error === null && sessions !== null && sessions.length > 0 && (
        <>
          {summary !== null && (
            <section className="panel">
              <div className="panel-title">Session summary</div>
              <pre className="detail-pre">{summary}</pre>
            </section>
          )}
          <SessionList sessions={sessions} />
        </>
      )}
    </div>
  );
}

function SessionList({ sessions }: { sessions: SessionDigest[] }) {
  return (
    <div className="session-list">
      {sessions.map((session) => (
        <div key={session.sessionId} className="panel session-card">
          <div className="session-head">
            <span className={`chip source-${session.source}`}>{session.source}</span>
            <span className="chip num">{session.turnCount} turns</span>
            <span className="session-time">
              {session.lastActiveAt !== null
                ? `active ${new Date(session.lastActiveAt).toLocaleString()}`
                : "activity time unknown"}
            </span>
          </div>
          <p className="session-digest">{session.digest}</p>
        </div>
      ))}
    </div>
  );
}
