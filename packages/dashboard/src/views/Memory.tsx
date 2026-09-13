import { useEffect, useMemo, useState } from "react";
import { api, ApiError, ServerGoneError } from "../lib/api";
import { formatDateTime, formatRelative, initials } from "../lib/format";
import { looksLikeMarkdown } from "../lib/markdown";
import type { MemoryEntry, ProFeatures } from "../lib/types";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { Markdown } from "../components/Markdown";
import { ProLock } from "../components/ProLock";
import { SearchInput } from "../components/SearchInput";
import { Sheet } from "../components/Sheet";
import { ViewSkeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";

const FIXTURE_ENTRIES: MemoryEntry[] = [
  {
    id: "m1",
    agentId: "claude-code",
    content: "User prefers explicit error types over string matching in the cache layer.",
    createdAt: "2026-07-09T10:00:00Z",
    provenance: "session a1b2c3d4",
  },
  {
    id: "m2",
    agentId: "cursor",
    content: "Release checklist lives in RELEASING.md; version bumps go through changesets.",
    createdAt: "2026-07-08T14:30:00Z",
    provenance: "session e5f6a7b8",
  },
];

export interface MemoryProps {
  features: ProFeatures;
  onServerGone: () => void;
}

export function Memory({ features, onServerGone }: MemoryProps) {
  const [entries, setEntries] = useState<MemoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(!features.memory);
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<MemoryEntry | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    if (!features.memory) return;
    let cancelled = false;
    api
      .memory()
      .then((data) => {
        if (!cancelled) setEntries(data.entries);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ServerGoneError) onServerGone();
        if (err instanceof ApiError && err.status === 403) setLocked(true);
        else setError(err instanceof Error ? err.message : "failed to load memory");
      });
    return () => {
      cancelled = true;
    };
  }, [features.memory, onServerGone]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = (entries ?? []).filter(
      (e) => q === "" || e.content.toLowerCase().includes(q) || e.agentId.toLowerCase().includes(q) || e.provenance.toLowerCase().includes(q)
    );
    const groups = new Map<string, MemoryEntry[]>();
    for (const entry of visible) {
      const list = groups.get(entry.agentId) ?? [];
      list.push(entry);
      groups.set(entry.agentId, list);
    }
    for (const list of groups.values()) list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [entries, query]);

  const forget = (entry: MemoryEntry): void => {
    setConfirming(null);
    api
      .forget(entry.id)
      .then(({ forgotten }) => {
        if (forgotten) {
          setEntries((prev) => (prev ?? []).filter((e) => e.id !== entry.id));
          toast("Memory forgotten", "ok");
        }
      })
      .catch((err: unknown) => {
        if (err instanceof ServerGoneError) onServerGone();
        setError(err instanceof Error ? err.message : "failed to forget entry");
      });
  };

  const toggleGroup = (agentId: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  };

  if (locked) {
    return (
      <div className="view">
        <header className="view-header">
          <div>
            <h1>Memory</h1>
            <p className="view-sub">What your agents remember between sessions.</p>
          </div>
        </header>
        <ProLock
          feature="memory"
          pitch="Persistent agent memory: encrypted at rest, provenance on every entry, forget anything anytime."
          bullets={["AES-256-GCM encrypted, key in the OS keychain", "Provenance recorded on every entry", "Forget any entry, any time"]}
        >
          <MemoryGroups groups={[["claude-code", FIXTURE_ENTRIES]]} collapsed={new Set()} onToggle={() => undefined} onForget={() => undefined} query="" />
        </ProLock>
      </div>
    );
  }

  if (entries === null && error === null) return <ViewSkeleton title="Memory" />;

  const total = entries?.length ?? 0;

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>Memory</h1>
          <p className="view-sub">
            {total.toLocaleString()} entr{total === 1 ? "y" : "ies"} across {grouped.length} agent{grouped.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="header-actions">
          <SearchInput value={query} onChange={setQuery} placeholder="Filter memory…" ariaLabel="Filter memory entries" slashShortcut />
        </div>
      </header>

      <div className="trust-strip">
        <Icon name="shield" size={13} />
        <span>AES-256-GCM at rest · key in the OS keychain · every entry carries provenance</span>
      </div>

      {error !== null && (
        <div className="banner banner-err" role="alert">
          <Icon name="alert" size={15} />
          <span>{error}</span>
        </div>
      )}

      {entries !== null && entries.length === 0 && (
        <EmptyState
          icon="memory"
          title="Memory is empty"
          body="Agents haven't stored anything yet. Entries appear here as your tools call the remember tool."
        />
      )}

      {entries !== null && entries.length > 0 && grouped.length === 0 && (
        <EmptyState icon="search" title="No matches" body="No memory entries match this filter." />
      )}

      <MemoryGroups groups={grouped} collapsed={collapsed} onToggle={toggleGroup} onForget={(entry) => setConfirming(entry)} query={query} />

      {confirming !== null && (
        <Sheet title="Forget this memory?" tone="danger" onClose={() => setConfirming(null)}>
          <p className="sheet-body">This permanently removes the entry from the encrypted store. Agents will no longer recall it.</p>
          <blockquote className="sheet-quote">{confirming.content}</blockquote>
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={() => setConfirming(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={() => forget(confirming)}>
              <Icon name="trash" size={14} />
              Forget
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (q === "") return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function MemoryGroups({
  groups,
  collapsed,
  onToggle,
  onForget,
  query,
}: {
  groups: [string, MemoryEntry[]][];
  collapsed: Set<string>;
  onToggle: (agentId: string) => void;
  onForget: (entry: MemoryEntry) => void;
  query: string;
}) {
  return (
    <div className="memory-groups">
      {groups.map(([agentId, list]) => {
        const open = !collapsed.has(agentId);
        return (
          <section key={agentId} className="panel memory-group">
            <button type="button" className="memory-group-head" onClick={() => onToggle(agentId)} aria-expanded={open}>
              <span className="avatar" aria-hidden="true">
                {initials(agentId)}
              </span>
              <span className="memory-group-title mono">{agentId}</span>
              <span className="memory-group-count num">{list.length}</span>
              <Icon name="chevron-down" size={14} className={`memory-group-chevron${open ? " is-open" : ""}`} />
            </button>
            {open && (
              <ul className="memory-list">
                {list.map((entry) => (
                  <li key={entry.id} className="memory-row">
                    <div className="memory-content">
                      {looksLikeMarkdown(entry.content) ? (
                        <Markdown source={entry.content} compact />
                      ) : (
                        <p>
                          <Highlight text={entry.content} query={query} />
                        </p>
                      )}
                    </div>
                    <div className="memory-meta">
                      <span title={formatDateTime(entry.createdAt)}>
                        <Icon name="clock" size={11} />
                        {formatRelative(entry.createdAt)}
                      </span>
                      <span className="memory-provenance" title="Where this memory came from">
                        <Icon name="hash" size={11} />
                        {entry.provenance}
                      </span>
                      <button
                        type="button"
                        className="btn btn-small btn-quiet memory-forget"
                        onClick={() => onForget(entry)}
                        aria-label={`Forget memory entry from ${agentId}`}
                      >
                        <Icon name="trash" size={12} />
                        Forget
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
