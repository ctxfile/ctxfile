import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ServerGoneError } from "../lib/api";
import { formatCompact, formatDateTime, formatRelative, splitPath } from "../lib/format";
import { useCopy } from "../lib/hooks";
import { looksLikeMarkdown } from "../lib/markdown";
import { CONTEXT_SCOPES, type ContextObject, type ContextScope } from "../lib/types";
import { CodeBlock } from "../components/CodeBlock";
import { EmptyState } from "../components/EmptyState";
import { Icon, sourceIcon, type IconName } from "../components/Icon";
import { JsonView } from "../components/JsonView";
import { Markdown } from "../components/Markdown";
import { SearchInput } from "../components/SearchInput";
import { Segmented } from "../components/Segmented";
import { ViewSkeleton } from "../components/Skeleton";
import { VirtualList } from "../components/VirtualList";

type NodeId =
  | { kind: "plan" }
  | { kind: "file"; path: string }
  | { kind: "git" }
  | { kind: "notion"; id: string }
  | { kind: "session"; id: string }
  | { kind: "note"; path: string }
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
    case "note":
      return `note:${node.path}`;
  }
}

type TreeRow =
  | { type: "group"; key: string; label: string; count: number; tokens?: number }
  | { type: "item"; key: string; node: NodeId; label: string; sub?: string; icon: IconName; mono: boolean; tokens?: number; redactions?: number; muted?: boolean };

const ROW_HEIGHT = 34;

export interface ContextExplorerProps {
  onServerGone: () => void;
  /** Path to preselect when arriving from another view. */
  initialPath?: string | null;
}

export function ContextExplorer({ onServerGone, initialPath = null }: ContextExplorerProps) {
  const [scope, setScope] = useState<ContextScope>("full");
  const [ctx, setCtx] = useState<ContextObject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<NodeId | null>(initialPath !== null ? { kind: "file", path: initialPath } : null);
  const [rawJson, setRawJson] = useState(false);
  const [filter, setFilter] = useState("");
  const [copiedId, copy] = useCopy();

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

  const rows = useMemo((): TreeRow[] => {
    if (ctx === null) return [];
    const q = filter.trim().toLowerCase();
    const hit = (s: string): boolean => q === "" || s.toLowerCase().includes(q);
    const out: TreeRow[] = [];

    if (q === "" || hit("plan")) {
      out.push({ type: "group", key: "g-plan", label: "Plan", count: ctx.plan !== null ? 1 : 0 });
      out.push({
        type: "item",
        key: "plan",
        node: { kind: "plan" },
        label: ctx.plan !== null ? "Project plan" : "No plan captured",
        icon: "list",
        mono: false,
        muted: ctx.plan === null,
      });
    }

    const files = ctx.keyFiles.filter((f) => hit(f.path));
    if (files.length > 0 || q === "") {
      out.push({
        type: "group",
        key: "g-files",
        label: "Key files",
        count: files.length,
        tokens: files.reduce((s, f) => s + f.tokens, 0),
      });
      for (const file of files) {
        const { dir, base } = splitPath(file.path);
        out.push({
          type: "item",
          key: `file:${file.path}`,
          node: { kind: "file", path: file.path },
          label: base,
          sub: dir,
          icon: "file",
          mono: true,
          tokens: file.tokens,
          redactions: file.redactions,
        });
      }
    }

    if (q === "" || hit("git") || (ctx.gitState !== null && hit(ctx.gitState.branch))) {
      out.push({ type: "group", key: "g-git", label: "Git", count: ctx.gitState !== null ? 1 : 0 });
      out.push({
        type: "item",
        key: "git",
        node: { kind: "git" },
        label: ctx.gitState !== null ? ctx.gitState.branch : "No git state",
        icon: "branch",
        mono: true,
        muted: ctx.gitState === null,
      });
    }

    const pages = ctx.notionPages.filter((p) => hit(p.title));
    if (pages.length > 0) {
      out.push({ type: "group", key: "g-notion", label: "Notion", count: pages.length });
      for (const page of pages) {
        out.push({
          type: "item",
          key: `notion:${page.id}`,
          node: { kind: "notion", id: page.id },
          label: page.title,
          sub: `edited ${formatRelative(page.lastEditedTime)}`,
          icon: "notion",
          mono: false,
        });
      }
    }

    const notes = (ctx.notes ?? []).filter((n) => hit(n.title) || hit(n.path));
    if (notes.length > 0) {
      out.push({ type: "group", key: "g-notes", label: "Notes", count: notes.length, tokens: notes.reduce((s, n) => s + n.tokens, 0) });
      for (const note of notes) {
        out.push({
          type: "item",
          key: `note:${note.path}`,
          node: { kind: "note", path: note.path },
          label: note.title,
          sub: note.vault,
          icon: "context",
          mono: false,
          tokens: note.tokens,
          redactions: note.redactions,
        });
      }
    }

    const sessions = (ctx.sessions ?? []).filter((s) => hit(s.source) || hit(s.sessionId) || hit(s.digest));
    if (sessions.length > 0) {
      out.push({ type: "group", key: "g-sessions", label: "Sessions", count: sessions.length });
      for (const session of sessions) {
        out.push({
          type: "item",
          key: `session:${session.sessionId}`,
          node: { kind: "session", id: session.sessionId },
          label: session.source,
          sub: `${session.sessionId.slice(0, 8)} · ${session.turnCount} turns`,
          icon: sourceIcon(session.source),
          mono: false,
        });
      }
    }

    if (ctx.sessionSummary !== null && (q === "" || hit("summary"))) {
      out.push({ type: "group", key: "g-summary", label: "Summary", count: 1 });
      out.push({
        type: "item",
        key: "session-summary",
        node: { kind: "sessionSummary" },
        label: "Session summary",
        icon: "sessions",
        mono: false,
      });
    }
    return out;
  }, [ctx, filter]);

  const copyPayload = (): void => {
    if (ctx === null) return;
    copy("payload", JSON.stringify(ctx, null, 2));
  };

  const detail = useMemo(() => {
    if (ctx === null || selected === null) return null;
    switch (selected.kind) {
      case "plan":
        return ctx.plan !== null ? (
          <DetailFrame title="Project plan" icon="list" copyText={ctx.plan} copiedId={copiedId} onCopy={copy}>
            <Markdown source={ctx.plan} />
          </DetailFrame>
        ) : (
          <EmptyState icon="list" title="No plan captured" body="No plan or spec file was found in this project." />
        );
      case "git":
        return ctx.gitState !== null ? (
          <DetailFrame
            title={`git · ${ctx.gitState.branch}`}
            icon="branch"
            copyText={JSON.stringify(ctx.gitState, null, 2)}
            copiedId={copiedId}
            onCopy={copy}
            meta={
              <>
                <span className="chip num">↑{ctx.gitState.ahead}</span>
                <span className="chip num">↓{ctx.gitState.behind}</span>
                <span className="chip num">{ctx.gitState.commits.length} commits</span>
              </>
            }
          >
            <div className="detail-json">
              <JsonView value={ctx.gitState} defaultDepth={2} />
            </div>
          </DetailFrame>
        ) : (
          <EmptyState icon="branch" title="No git state" body="This snapshot has no git information." />
        );
      case "sessionSummary":
        return ctx.sessionSummary !== null ? (
          <DetailFrame title="Session summary" icon="sessions" copyText={ctx.sessionSummary} copiedId={copiedId} onCopy={copy}>
            <Markdown source={ctx.sessionSummary} />
          </DetailFrame>
        ) : (
          <EmptyState icon="sessions" title="No session summary" />
        );
      case "file": {
        const file = ctx.keyFiles.find((f) => f.path === selected.path);
        if (!file) return <EmptyState icon="file" title="File not in this scope" body="Switch the scope to full or files to see it." />;
        return (
          <DetailFrame
            title={file.path}
            icon="file"
            copyText={file.content}
            copiedId={copiedId}
            onCopy={copy}
            meta={
              <>
                <span className="chip num">{file.tokens.toLocaleString()} tokens</span>
                {file.truncated && (
                  <span className="chip chip-warn">
                    <Icon name="alert" size={11} /> truncated
                  </span>
                )}
                {file.redactions > 0 && (
                  <span className="chip chip-redact">
                    <Icon name="shield" size={11} /> {file.redactions} redaction{file.redactions === 1 ? "" : "s"}
                  </span>
                )}
              </>
            }
          >
            <CodeBlock code={file.content} language={file.path} title={file.path} />
          </DetailFrame>
        );
      }
      case "notion": {
        const page = ctx.notionPages.find((p) => p.id === selected.id);
        if (!page) return <EmptyState icon="notion" title="Page not in this scope" />;
        return (
          <DetailFrame
            title={page.title}
            icon="notion"
            copyText={page.content}
            copiedId={copiedId}
            onCopy={copy}
            meta={<span className="chip">edited {formatDateTime(page.lastEditedTime)}</span>}
          >
            <Markdown source={page.content} />
          </DetailFrame>
        );
      }
      case "note": {
        const note = (ctx.notes ?? []).find((n) => n.path === selected.path);
        if (!note) return <EmptyState icon="context" title="Note not in this scope" />;
        return (
          <DetailFrame
            title={note.title}
            icon="context"
            copyText={note.content}
            copiedId={copiedId}
            onCopy={copy}
            meta={
              <>
                <span className="chip mono">{note.vault}</span>
                <span className="chip num">{note.tokens.toLocaleString()} tokens</span>
                {note.pinned && <span className="chip chip-accent">pinned</span>}
                {note.tags.map((tag) => (
                  <span key={tag} className="chip">
                    #{tag}
                  </span>
                ))}
                {note.redactions > 0 && (
                  <span className="chip chip-redact">
                    <Icon name="shield" size={11} /> {note.redactions}
                  </span>
                )}
              </>
            }
          >
            <Markdown source={note.content} />
            {note.links.length > 0 && (
              <div className="detail-links">
                <div className="detail-links-title">Linked notes</div>
                <ul>
                  {note.links.map((link) => (
                    <li key={link.title}>
                      <strong>{link.title}</strong>
                      <span>{link.firstLine}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </DetailFrame>
        );
      }
      case "session": {
        const session = (ctx.sessions ?? []).find((s) => s.sessionId === selected.id);
        if (!session) return <EmptyState icon="sessions" title="Session not in this scope" />;
        return (
          <DetailFrame
            title={`${session.source} · ${session.sessionId.slice(0, 8)}`}
            icon={sourceIcon(session.source)}
            copyText={session.digest}
            copiedId={copiedId}
            onCopy={copy}
            meta={
              <>
                <span className="chip num">{session.turnCount} turns</span>
                {session.lastActiveAt !== null && <span className="chip">active {formatRelative(session.lastActiveAt)}</span>}
              </>
            }
          >
            {looksLikeMarkdown(session.digest) ? <Markdown source={session.digest} /> : <p className="detail-prose">{session.digest}</p>}
          </DetailFrame>
        );
      }
    }
  }, [ctx, selected, copiedId, copy]);

  const totalTokens = ctx?.meta.tokensUsed ?? 0;

  if (loading && ctx === null) return <ViewSkeleton title="Context" />;

  return (
    <div className="view view-wide">
      <header className="view-header">
        <div>
          <h1>Context</h1>
          <p className="view-sub">
            The exact object an agent receives from <code className="inline-code">get_context</code>, scoped and redacted.
          </p>
        </div>
        <div className="header-actions">
          <Segmented
            ariaLabel="Context scope"
            value={scope}
            onChange={setScope}
            options={CONTEXT_SCOPES.map((s) => ({ value: s, label: s }))}
          />
          <button
            type="button"
            className={`btn btn-ghost${rawJson ? " is-on" : ""}`}
            onClick={() => setRawJson((v) => !v)}
            aria-pressed={rawJson}
          >
            <Icon name="json" size={14} />
            {rawJson ? "Structured" : "Raw JSON"}
          </button>
          <button type="button" className="btn" onClick={copyPayload} disabled={ctx === null}>
            <Icon name={copiedId === "payload" ? "check" : "copy"} size={14} />
            {copiedId === "payload" ? "Copied" : "Copy payload"}
          </button>
        </div>
      </header>

      {error !== null && (
        <div className="banner banner-err" role="alert">
          <Icon name="alert" size={15} />
          <span>{error}</span>
        </div>
      )}

      {ctx !== null && rawJson && (
        <div className={`panel panel-flush${loading ? " is-loading" : ""}`}>
          <div className="panel-title">
            <span className="mono">ContextObject</span>
            <span className="panel-title-meta num">
              {formatCompact(totalTokens)} tokens · generated {formatRelative(ctx.meta.generatedAt)}
            </span>
          </div>
          <div className="detail-json detail-json-tall">
            <JsonView value={ctx} defaultDepth={1} />
          </div>
        </div>
      )}

      {ctx !== null && !rawJson && (
        <div className={`explorer${loading ? " is-loading" : ""}`}>
          <aside className="explorer-tree">
            <div className="explorer-tree-head">
              <SearchInput value={filter} onChange={setFilter} placeholder="Filter context…" ariaLabel="Filter context tree" slashShortcut />
              <div className="explorer-meta num">
                <span>{ctx.keyFiles.length.toLocaleString()} files</span>
                <span>{formatCompact(totalTokens)} tokens</span>
              </div>
            </div>
            <VirtualList
              items={rows}
              rowHeight={ROW_HEIGHT}
              itemKey={(row) => row.key}
              className="tree"
              ariaLabel="Context tree"
              role="tree"
              renderRow={(row) =>
                row.type === "group" ? (
                  <div className="tree-group" role="presentation">
                    <span>{row.label}</span>
                    <span className="tree-group-meta num">
                      {row.tokens !== undefined && row.tokens > 0 && <span>{formatCompact(row.tokens)}</span>}
                      <span className="tree-count">{row.count}</span>
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    role="treeitem"
                    aria-selected={selectedKey === row.key}
                    className={`tree-item${selectedKey === row.key ? " is-active" : ""}${row.muted ? " is-muted" : ""}`}
                    onClick={() => setSelected(row.node)}
                    title={row.sub !== undefined ? `${row.sub}${row.label}` : row.label}
                  >
                    <Icon name={row.icon} size={14} className="tree-icon" />
                    <span className={`tree-label${row.mono ? " mono" : ""}`}>
                      {row.sub !== undefined && row.icon === "file" && <span className="tree-dir">{row.sub}</span>}
                      <span className="tree-base">{row.label}</span>
                      {row.sub !== undefined && row.icon !== "file" && <span className="tree-sub">{row.sub}</span>}
                    </span>
                    {row.redactions !== undefined && row.redactions > 0 && (
                      <span className="tree-redact num" title={`${row.redactions} redactions`}>
                        <Icon name="shield" size={11} />
                        {row.redactions}
                      </span>
                    )}
                    {row.tokens !== undefined && <span className="tree-tokens num">{formatCompact(row.tokens)}</span>}
                  </button>
                )
              }
            />
            {rows.length === 0 && <EmptyState compact icon="search" title="Nothing matches" body="Try a shorter filter." />}
          </aside>

          <section className="explorer-detail">
            {selected === null ? (
              <EmptyState
                icon="context"
                title="Select something to inspect"
                body="Pick a file, the plan, git state, or a session from the tree. Files render with syntax colouring; prose renders as Markdown."
              />
            ) : (
              detail
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function DetailFrame({
  title,
  icon,
  meta,
  copyText,
  copiedId,
  onCopy,
  children,
}: {
  title: string;
  icon: IconName;
  meta?: ReactNode;
  copyText: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="detail">
      <div className="detail-head">
        <span className="detail-title">
          <Icon name={icon} size={15} />
          <span className="mono">{title}</span>
        </span>
        <span className="detail-meta">
          {meta}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onCopy("detail", copyText)}>
            <Icon name={copiedId === "detail" ? "check" : "copy"} size={13} />
            {copiedId === "detail" ? "Copied" : "Copy"}
          </button>
        </span>
      </div>
      <div className="detail-body">{children}</div>
    </div>
  );
}
