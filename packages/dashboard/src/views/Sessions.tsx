import { useEffect, useMemo, useState } from "react";
import { api, ServerGoneError } from "../lib/api";
import { formatDayLabel, formatDuration, formatRelative } from "../lib/format";
import { useCopy } from "../lib/hooks";
import { looksLikeMarkdown } from "../lib/markdown";
import type { ProFeatures, SessionDigest } from "../lib/types";
import { CodeBlock } from "../components/CodeBlock";
import { EmptyState } from "../components/EmptyState";
import { Icon, sourceIcon } from "../components/Icon";
import { Markdown } from "../components/Markdown";
import { ProLock } from "../components/ProLock";
import { SearchInput } from "../components/SearchInput";
import { ViewSkeleton } from "../components/Skeleton";

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

const SYNC_PROMPT =
  "Summarize this session, then call the ctxfile ingest_context tool:\n" +
  'ctxfile_ingest_schema "1", source.harness (your tool or custom:<name>),\n' +
  "session.summary, key_decisions, files_touched, open_items.\n" +
  "On a validation error, fix the listed fields and retry once.";

export interface SessionsProps {
  features: ProFeatures;
  onServerGone: () => void;
}

export function Sessions({ features, onServerGone }: SessionsProps) {
  const [sessions, setSessions] = useState<SessionDigest[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(features.sessions);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<string | null>(null);

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

  const sources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions ?? []) counts.set(s.source, (counts.get(s.source) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [sessions]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (sessions ?? [])
      .filter((s) => source === null || s.source === source)
      .filter((s) => q === "" || s.digest.toLowerCase().includes(q) || s.source.toLowerCase().includes(q) || s.sessionId.includes(q))
      .sort((a, b) => Date.parse(b.lastActiveAt ?? b.startedAt ?? "") - Date.parse(a.lastActiveAt ?? a.startedAt ?? ""));
  }, [sessions, query, source]);

  if (!features.sessions) {
    return (
      <div className="view">
        <header className="view-header">
          <div>
            <h1>Sessions</h1>
            <p className="view-sub">What your agents were doing, tool by tool.</p>
          </div>
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
          <SessionTimeline sessions={FIXTURE_SESSIONS} />
        </ProLock>
      </div>
    );
  }

  if (loading && sessions === null) return <ViewSkeleton title="Sessions" />;

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>Sessions</h1>
          <p className="view-sub">Digests of recent agent sessions, grouped by day.</p>
        </div>
        {(sessions?.length ?? 0) > 0 && (
          <div className="header-actions">
            <SearchInput value={query} onChange={setQuery} placeholder="Search digests…" ariaLabel="Search sessions" slashShortcut />
          </div>
        )}
      </header>

      {error !== null && (
        <div className="banner banner-err" role="alert">
          <Icon name="alert" size={15} />
          <span>{error}</span>
        </div>
      )}

      {error === null && (sessions === null || sessions.length === 0) && <SyncFallback />}

      {sessions !== null && sessions.length > 0 && (
        <>
          {sources.length > 1 && (
            <div className="filter-row" role="group" aria-label="Filter by source">
              <button type="button" className={`filter-chip${source === null ? " is-on" : ""}`} onClick={() => setSource(null)}>
                All <span className="num">{sessions.length}</span>
              </button>
              {sources.map(([name, count]) => (
                <button
                  key={name}
                  type="button"
                  className={`filter-chip${source === name ? " is-on" : ""}`}
                  onClick={() => setSource(source === name ? null : name)}
                >
                  <Icon name={sourceIcon(name)} size={12} />
                  {name} <span className="num">{count}</span>
                </button>
              ))}
            </div>
          )}

          {summary !== null && (
            <section className="panel summary-panel">
              <div className="panel-title">
                <span className="git-col-title">
                  <Icon name="sparkle" size={13} />
                  Session summary
                </span>
              </div>
              <Markdown source={summary} />
            </section>
          )}

          {visible.length === 0 ? (
            <EmptyState icon="search" title="No sessions match" body="Try another search or clear the source filter." />
          ) : (
            <SessionTimeline sessions={visible} />
          )}
        </>
      )}
    </div>
  );
}

function SyncFallback() {
  const [copiedId, copy] = useCopy();
  return (
    <div className="panel">
      <EmptyState
        icon="sessions"
        title="No sessions captured yet"
        body={
          <>
            Parsers cover Claude Code, Cursor, Codex, OpenCode, Gemini CLI, Aider, OpenClaw, and Hermes; sessions appear after the next
            snapshot that finds them. On any other harness, or if these look stale, paste the sync prompt into your agent.
          </>
        }
        action={
          <button type="button" className="btn" onClick={() => copy("sync", SYNC_PROMPT)}>
            <Icon name={copiedId === "sync" ? "check" : "copy"} size={14} />
            {copiedId === "sync" ? "Copied" : "Copy sync prompt"}
          </button>
        }
      />
      <CodeBlock code={SYNC_PROMPT} language="text" title="sync prompt" lineNumbers={false} />
    </div>
  );
}

function SessionTimeline({ sessions }: { sessions: SessionDigest[] }) {
  const groups: { label: string; items: SessionDigest[] }[] = [];
  for (const session of sessions) {
    const when = session.lastActiveAt ?? session.startedAt;
    const label = when !== null ? formatDayLabel(when) : "Unknown date";
    const last = groups[groups.length - 1];
    if (last !== undefined && last.label === label) last.items.push(session);
    else groups.push({ label, items: [session] });
  }
  return (
    <div className="timeline-groups">
      {groups.map((group) => (
        <section key={group.label} className="timeline-group">
          <div className="timeline-day">
            <span>{group.label}</span>
            <span className="timeline-day-count num">{group.items.length}</span>
          </div>
          <div className="session-list">
            {group.items.map((session) => {
              const started = session.startedAt !== null ? Date.parse(session.startedAt) : null;
              const ended = session.lastActiveAt !== null ? Date.parse(session.lastActiveAt) : null;
              const duration = started !== null && ended !== null && ended > started ? ended - started : null;
              return (
                <article key={session.sessionId} className="panel session-card">
                  <div className="session-head">
                    <span className={`source-badge source-${session.source}`}>
                      <Icon name={sourceIcon(session.source)} size={14} />
                      {session.source}
                    </span>
                    <span className="chip mono">{session.sessionId.slice(0, 8)}</span>
                    <span className="chip num">{session.turnCount} turns</span>
                    {duration !== null && <span className="chip num">{formatDuration(duration)}</span>}
                    <span className="session-time">
                      {session.lastActiveAt !== null ? `active ${formatRelative(session.lastActiveAt)}` : "activity time unknown"}
                    </span>
                  </div>
                  <div className="session-digest">
                    {looksLikeMarkdown(session.digest) ? <Markdown source={session.digest} compact /> : <p>{session.digest}</p>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
