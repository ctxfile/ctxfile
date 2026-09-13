import { useEffect, useMemo, useState } from "react";
import { api, ServerGoneError } from "../lib/api";
import { formatRelative, initials, splitPath } from "../lib/format";
import type { GitState } from "../lib/types";
import { EmptyState } from "../components/EmptyState";
import { Icon, type IconName } from "../components/Icon";
import { ViewSkeleton } from "../components/Skeleton";
import { CodeBlock } from "../components/CodeBlock";

export interface GitPanelProps {
  onServerGone: () => void;
  /** Bumped when a snapshot completes so the panel refetches. */
  refreshKey?: number;
}

interface DiffStatRow {
  file: string;
  changes: number;
  plus: number;
  minus: number;
}

/** Parses `git diff --stat` output into rows; the trailing summary line is returned separately. */
export function parseDiffStat(summary: string): { rows: DiffStatRow[]; footer: string | null } {
  const rows: DiffStatRow[] = [];
  let footer: string | null = null;
  for (const raw of summary.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    const m = /^(.+?)\s+\|\s+(\d+|Bin)(?:\s+([+\-]*))?/.exec(line);
    if (m && m[1] !== undefined) {
      const bars = m[3] ?? "";
      rows.push({
        file: m[1].trim(),
        changes: m[2] === "Bin" ? 0 : Number(m[2]),
        plus: (bars.match(/\+/g) ?? []).length,
        minus: (bars.match(/-/g) ?? []).length,
      });
    } else if (/files? changed|insertions?|deletions?/.test(line)) {
      footer = line;
    }
  }
  return { rows, footer };
}

export function GitPanel({ onServerGone, refreshKey = 0 }: GitPanelProps) {
  const [git, setGit] = useState<GitState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rawDiff, setRawDiff] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .context("git")
      .then((ctx) => {
        if (cancelled) return;
        setGit(ctx.gitState);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ServerGoneError) onServerGone();
        setError(err instanceof Error ? err.message : "failed to load git state");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onServerGone, refreshKey]);

  const diff = useMemo(() => (git !== null ? parseDiffStat(git.diffSummary) : { rows: [], footer: null }), [git]);
  const maxChanges = Math.max(1, ...diff.rows.map((r) => r.plus + r.minus));

  if (loading && git === null) return <ViewSkeleton title="Git" />;

  if (error !== null) {
    return (
      <div className="view">
        <header className="view-header">
          <div>
            <h1>Git</h1>
          </div>
        </header>
        <div className="banner banner-err" role="alert">
          <Icon name="alert" size={15} />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (git === null) {
    return (
      <div className="view">
        <header className="view-header">
          <div>
            <h1>Git</h1>
          </div>
        </header>
        <EmptyState
          icon="branch"
          title="No git state"
          body="This project isn't a git repository, or the git connector was skipped in the last snapshot."
        />
      </div>
    );
  }

  const changed = git.staged.length + git.modified.length + git.untracked.length;
  const clean = changed === 0;

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>Git</h1>
          <p className="view-sub">Working tree and recent history as captured in the last snapshot.</p>
        </div>
        <div className="git-branch">
          <span className="chip chip-branch mono">
            <Icon name="branch" size={13} />
            {git.branch}
          </span>
          <span className={`chip num${git.ahead > 0 ? " chip-ok" : ""}`} title="Commits ahead of upstream">
            <Icon name="arrow-up" size={12} />
            {git.ahead}
          </span>
          <span className={`chip num${git.behind > 0 ? " chip-warn" : ""}`} title="Commits behind upstream">
            <Icon name="arrow-down" size={12} />
            {git.behind}
          </span>
          <span className={`chip${clean ? " chip-ok" : " chip-warn"}`}>
            <span className="led" aria-hidden="true" />
            {clean ? "clean" : `${changed} change${changed === 1 ? "" : "s"}`}
          </span>
        </div>
      </header>

      <section className="git-columns">
        <FileColumn title="Staged" tone="ok" icon="check" files={git.staged} />
        <FileColumn title="Modified" tone="warn" icon="file" files={git.modified} />
        <FileColumn title="Untracked" tone="muted" icon="plus" files={git.untracked} />
      </section>

      <section className="grid-2 grid-2-wide">
        <div className="panel">
          <div className="panel-title">
            Recent commits
            <span className="panel-title-meta num">{git.commits.length}</span>
          </div>
          {git.commits.length === 0 ? (
            <EmptyState compact icon="commit" title="No commits captured" />
          ) : (
            <ol className="commit-list">
              {git.commits.map((commit) => (
                <li key={commit.hash} className="commit-row">
                  <span className="commit-rail" aria-hidden="true">
                    <span className="commit-dot" />
                  </span>
                  <span className="commit-avatar" aria-hidden="true">
                    {initials(commit.author)}
                  </span>
                  <span className="commit-body">
                    <span className="commit-message">{commit.message}</span>
                    <span className="commit-meta">
                      <span className="commit-hash mono">{commit.hash.slice(0, 7)}</span>
                      <span>{commit.author}</span>
                      <span title={commit.date}>{formatRelative(commit.date)}</span>
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">
            Diff summary
            <span className="panel-title-right">
              {diff.footer !== null && <span className="panel-title-meta num">{diff.footer}</span>}
              {git.diffSummary !== "" && (
                <button type="button" className="link-btn" onClick={() => setRawDiff((v) => !v)}>
                  {rawDiff ? "Bars" : "Raw"}
                </button>
              )}
            </span>
          </div>
          {git.diffSummary === "" ? (
            <EmptyState compact icon="check" title="No uncommitted changes" body="The working tree matched HEAD at snapshot time." />
          ) : rawDiff || diff.rows.length === 0 ? (
            <CodeBlock code={git.diffSummary} language="diff" title="git diff --stat" lineNumbers={false} />
          ) : (
            <ul className="diffstat">
              {diff.rows.map((row) => {
                const { dir, base } = splitPath(row.file);
                const total = row.plus + row.minus;
                return (
                  <li key={row.file} className="diffstat-row" title={row.file}>
                    <span className="diffstat-file mono">
                      <span className="tree-dir">{dir}</span>
                      <span className="tree-base">{base}</span>
                    </span>
                    <span className="diffstat-count num">{row.changes}</span>
                    <span className="diffstat-bar" aria-hidden="true" style={{ width: `${(total / maxChanges) * 100}%` }}>
                      <span className="diffstat-plus" style={{ flex: row.plus }} />
                      <span className="diffstat-minus" style={{ flex: row.minus }} />
                    </span>
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

function FileColumn({
  title,
  tone,
  icon,
  files,
}: {
  title: string;
  tone: "ok" | "warn" | "muted";
  icon: IconName;
  files: string[];
}) {
  return (
    <div className={`panel git-col git-col-${tone}`}>
      <div className="panel-title">
        <span className="git-col-title">
          <Icon name={icon} size={13} />
          {title}
        </span>
        <span className="tree-count num">{files.length}</span>
      </div>
      {files.length === 0 ? (
        <div className="muted git-col-empty">none</div>
      ) : (
        <ul className="file-list">
          {files.map((file) => {
            const { dir, base } = splitPath(file);
            return (
              <li key={file} className="mono" title={file}>
                <span className="tree-dir">{dir}</span>
                <span className="tree-base">{base}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
