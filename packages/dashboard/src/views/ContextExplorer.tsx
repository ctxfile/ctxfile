import { useEffect, useMemo, useState } from "react";
import { api, ServerGoneError } from "../lib/api";
import { CONTEXT_SCOPES, type ContextObject, type ContextScope } from "../lib/types";
import { EmptyState } from "../components/EmptyState";

type NodeId =
  | { kind: "plan" }
  | { kind: "file"; path: string }
  | { kind: "git" }
  | { kind: "notion"; id: string }
  | { kind: "session"; id: string }
  | { kind: "sessionSummary" };

function nodeKey(node: NodeId): string {
  switch (node.kind) {
    case "plan":
      return "plan";
    case "git":
      return "git";
    case "sessionSummary":
      return "session-summary";
    case "file":
      return `file:${node.path}`;
    case "notion":
      return `notion:${node.id}`;
    case "session":
      return `session:${node.id}`;
  }
}

export interface ContextExplorerProps {
  onServerGone: () => void;
}

export function ContextExplorer({ onServerGone }: ContextExplorerProps) {
  const [scope, setScope] = useState<ContextScope>("full");
  const [ctx, setCtx] = useState<ContextObject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<NodeId | null>(null);
  const [rawJson, setRawJson] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .context(scope)
      .then((data) => {
        if (cancelled) return;
        setCtx(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ServerGoneError) onServerGone();
        setError(err instanceof Error ? err.message : "failed to load context");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, onServerGone]);

  const selectedKey = selected !== null ? nodeKey(selected) : null;

  const copyPayload = (): void => {
    if (ctx === null) return;
    void navigator.clipboard.writeText(JSON.stringify(ctx, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const detail = useMemo(() => {
    if (ctx === null || selected === null) return null;
    switch (selected.kind) {
      case "plan":
        return ctx.plan !== null ? (
          <pre className="detail-pre">{ctx.plan}</pre>
        ) : (
          <EmptyState title="No plan captured" body="No plan/spec file was found in this project." />
        );
      case "git":
        return ctx.gitState !== null ? (
          <pre className="detail-pre">{JSON.stringify(ctx.gitState, null, 2)}</pre>
        ) : (
          <EmptyState title="No git state" body="This snapshot has no git information." />
        );
      case "sessionSummary":
        return ctx.sessionSummary !== null ? (
          <pre className="detail-pre">{ctx.sessionSummary}</pre>
        ) : (
          <EmptyState title="No session summary" />
        );
      case "file": {
        const file = ctx.keyFiles.find((f) => f.path === selected.path);
        if (!file) return <EmptyState title="File not in this scope" />;
        return (
          <>
            <div className="detail-meta">
              <span className="chip num">{file.tokens.toLocaleString()} tokens</span>
              {file.truncated && <span className="chip chip-warn">truncated</span>}
              {file.redactions > 0 && (
                <span className="chip chip-redact">⛨ {file.redactions} redactions</span>
              )}
            </div>
            <pre className="detail-pre">{file.content}</pre>
          </>
        );
      }
      case "notion": {
        const page = ctx.notionPages.find((p) => p.id === selected.id);
        if (!page) return <EmptyState title="Page not in this scope" />;
        return (
          <>
            <div className="detail-meta">
              <span className="chip">edited {new Date(page.lastEditedTime).toLocaleString()}</span>
            </div>
            <pre className="detail-pre">{page.content}</pre>
          </>
        );
      }
      case "session": {
        const session = (ctx.sessions ?? []).find((s) => s.sessionId === selected.id);
        if (!session) return <EmptyState title="Session not in this scope" />;
        return (
          <>
            <div className="detail-meta">
              <span className="chip">{session.source}</span>
              <span className="chip num">{session.turnCount} turns</span>
            </div>
            <pre className="detail-pre">{session.digest}</pre>
          </>
        );
      }
    }
  }, [ctx, selected]);

  return (
    <div className="view">
      <header className="view-header">
        <h1>Context</h1>
        <div className="header-actions">
          <div className="scope-switch" role="tablist" aria-label="Context scope">
            {CONTEXT_SCOPES.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={scope === s}
                className={`scope-btn${scope === s ? " scope-active" : ""}`}
                onClick={() => setScope(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <button type="button" className="btn" onClick={() => setRawJson((v) => !v)}>
            {rawJson ? "Structured" : "Raw JSON"}
          </button>
          <button type="button" className="btn" onClick={copyPayload} disabled={ctx === null}>
            {copied ? "Copied" : "Copy as agent payload"}
          </button>
        </div>
      </header>

      {loading && <div className="loading">Loading context…</div>}
      {!loading && error !== null && (
        <div className="banner banner-err" role="alert">
          {error}
        </div>
      )}

      {!loading && error === null && ctx !== null && rawJson && (
        <pre className="detail-pre raw-json">{JSON.stringify(ctx, null, 2)}</pre>
      )}

      {!loading && error === null && ctx !== null && !rawJson && (
        <div className="explorer">
          <div className="explorer-tree" role="list" aria-label="Context tree">
            <div className="tree-group">plan</div>
            <TreeItem
              label={ctx.plan !== null ? "project plan" : "no plan"}
              active={selectedKey === "plan"}
              onSelect={() => setSelected({ kind: "plan" })}
            />
            <div className="tree-group">
              key files <span className="tree-count num">{ctx.keyFiles.length}</span>
            </div>
            {ctx.keyFiles.map((file) => (
              <TreeItem
                key={file.path}
                label={file.path}
                mono
                active={selectedKey === `file:${file.path}`}
                badge={file.redactions > 0 ? `⛨ ${file.redactions}` : undefined}
                onSelect={() => setSelected({ kind: "file", path: file.path })}
              />
            ))}
            <div className="tree-group">git</div>
            <TreeItem
              label={ctx.gitState !== null ? ctx.gitState.branch : "no git state"}
              mono
              active={selectedKey === "git"}
              onSelect={() => setSelected({ kind: "git" })}
            />
            {ctx.notionPages.length > 0 && (
              <>
                <div className="tree-group">
                  notion <span className="tree-count num">{ctx.notionPages.length}</span>
                </div>
                {ctx.notionPages.map((page) => (
                  <TreeItem
                    key={page.id}
                    label={page.title}
                    active={selectedKey === `notion:${page.id}`}
                    onSelect={() => setSelected({ kind: "notion", id: page.id })}
                  />
                ))}
              </>
            )}
            {(ctx.sessions ?? []).length > 0 && (
              <>
                <div className="tree-group">sessions</div>
                {(ctx.sessions ?? []).map((session) => (
                  <TreeItem
                    key={session.sessionId}
                    label={`${session.source} · ${session.sessionId.slice(0, 8)}`}
                    mono
                    active={selectedKey === `session:${session.sessionId}`}
                    onSelect={() => setSelected({ kind: "session", id: session.sessionId })}
                  />
                ))}
              </>
            )}
            {ctx.sessionSummary !== null && (
              <TreeItem
                label="session summary"
                active={selectedKey === "session-summary"}
                onSelect={() => setSelected({ kind: "sessionSummary" })}
              />
            )}
          </div>
          <div className="explorer-detail">
            {selected === null ? (
              <EmptyState
                title="Select an item"
                body="Pick a file, plan, or connector output from the tree to inspect its captured content."
              />
            ) : (
              detail
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TreeItem({
  label,
  active,
  onSelect,
  badge,
  mono = false,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
  badge?: string;
  mono?: boolean;
}) {
  return (
    <button
      type="button"
      className={`tree-item${active ? " tree-active" : ""}${mono ? " mono" : ""}`}
      onClick={onSelect}
    >
      <span className="tree-label">{label}</span>
      {badge !== undefined && <span className="chip chip-redact">{badge}</span>}
    </button>
  );
}
