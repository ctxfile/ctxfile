import { useEffect, useState } from "react";
import { api, ServerGoneError } from "../lib/api";
import type { GitState } from "../lib/types";
import { EmptyState } from "../components/EmptyState";

export interface GitPanelProps {
  onServerGone: () => void;
}

export function GitPanel({ onServerGone }: GitPanelProps) {
  const [git, setGit] = useState<GitState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
  }, [onServerGone]);

  if (loading) {
    return (
      <div className="view">
        <header className="view-header">
          <h1>Git</h1>
        </header>
        <div className="loading">Loading git state…</div>
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="view">
        <header className="view-header">
          <h1>Git</h1>
        </header>
        <div className="banner banner-err" role="alert">
          {error}
        </div>
      </div>
    );
  }

  if (git === null) {
    return (
      <div className="view">
        <header className="view-header">
          <h1>Git</h1>
        </header>
        <EmptyState
          title="No git state"
          body="This project isn't a git repository, or the git connector was skipped in the last snapshot."
        />
      </div>
    );
  }

  return (
    <div className="view">
      <header className="view-header">
        <h1>Git</h1>
        <div className="git-branch">
          <span className="chip mono">{git.branch}</span>
          <span className="chip num" title="Commits ahead of upstream">
            ↑{git.ahead}
          </span>
          <span className="chip num" title="Commits behind upstream">
            ↓{git.behind}
          </span>
        </div>
      </header>

      <section className="git-columns">
        <FileColumn title="Staged" tone="ok" files={git.staged} />
        <FileColumn title="Modified" tone="warn" files={git.modified} />
        <FileColumn title="Untracked" tone="muted" files={git.untracked} />
      </section>

      <section className="panel">
        <div className="panel-title">Commits</div>
        {git.commits.length === 0 ? (
          <div className="muted">No commits captured.</div>
        ) : (
          <ul className="commit-list">
            {git.commits.map((commit) => (
              <li key={commit.hash} className="commit-row">
                <span className="commit-hash mono">{commit.hash.slice(0, 7)}</span>
                <span className="commit-message">{commit.message}</span>
                <span className="commit-meta">
                  {commit.author} · {commit.date}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {git.diffSummary !== "" && (
        <section className="panel">
          <div className="panel-title">Diff summary</div>
          <pre className="detail-pre">{git.diffSummary}</pre>
        </section>
      )}
    </div>
  );
}

function FileColumn({
  title,
  tone,
  files,
}: {
  title: string;
  tone: "ok" | "warn" | "muted";
  files: string[];
}) {
  return (
    <div className={`panel git-col git-col-${tone}`}>
      <div className="panel-title">
        {title} <span className="tree-count num">{files.length}</span>
      </div>
      {files.length === 0 ? (
        <div className="muted">none</div>
      ) : (
        <ul className="file-list mono">
          {files.map((file) => (
            <li key={file}>{file}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
