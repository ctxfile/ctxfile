import { useEffect, useMemo, useState } from "react";
import { api, ApiError, ServerGoneError } from "../lib/api";
import type { MemoryEntry, ProFeatures } from "../lib/types";
import { EmptyState } from "../components/EmptyState";
import { ProLock } from "../components/ProLock";
import { Sheet } from "../components/Sheet";

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
      (e) =>
        q === "" || e.content.toLowerCase().includes(q) || e.agentId.toLowerCase().includes(q)
    );
    const groups = new Map<string, MemoryEntry[]>();
    for (const entry of visible) {
      const list = groups.get(entry.agentId) ?? [];
      list.push(entry);
      groups.set(entry.agentId, list);
    }
    return [...groups.entries()];
  }, [entries, query]);

  const forget = (entry: MemoryEntry): void => {
    setConfirming(null);
    api
      .forget(entry.id)
      .then(({ forgotten }) => {
        if (forgotten) setEntries((prev) => (prev ?? []).filter((e) => e.id !== entry.id));
      })
      .catch((err: unknown) => {
        if (err instanceof ServerGoneError) onServerGone();
        setError(err instanceof Error ? err.message : "failed to forget entry");
      });
  };

  if (locked) {
    return (
      <div className="view">
        <header className="view-header">
          <h1>Memory</h1>
        </header>
        <ProLock
          feature="memory"
          pitch="Persistent agent memory: encrypted at rest, provenance on every entry, forget anything anytime."
          bullets={[
            "AES-256-GCM encrypted, key in the OS keychain",
            "Provenance recorded on every entry",
            "Forget any entry, any time",
          ]}
        >
          <MemoryGroups groups={[["claude-code", FIXTURE_ENTRIES]]} onForget={() => undefined} />
        </ProLock>
      </div>
    );
  }

  return (
    <div className="view">
      <header className="view-header">
        <h1>Memory</h1>
        <input
          type="search"
          className="search-input"
          placeholder="Filter memory…"
          aria-label="Filter memory entries"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </header>

      <div className="trust-strip">AES-256-GCM at rest · key in OS keychain</div>

      {error !== null && (
        <div className="banner banner-err" role="alert">
          {error}
        </div>
      )}

      {entries !== null && entries.length === 0 && (
        <EmptyState
          title="Memory is empty"
          body="Agents haven't stored anything yet. Entries appear here as your tools call the remember tool."
        />
      )}

      {entries !== null && entries.length > 0 && grouped.length === 0 && (
        <EmptyState title="No matches" body="No memory entries match this filter." />
      )}

      <MemoryGroups groups={grouped} onForget={(entry) => setConfirming(entry)} />

      {confirming !== null && (
        <Sheet title="Forget this memory?" onClose={() => setConfirming(null)}>
          <p className="sheet-body">
            This permanently removes the entry from the encrypted store. Agents will no longer
            recall it.
          </p>
          <blockquote className="sheet-quote">{confirming.content}</blockquote>
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={() => setConfirming(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={() => forget(confirming)}>
              Forget
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function MemoryGroups({
  groups,
  onForget,
}: {
  groups: [string, MemoryEntry[]][];
  onForget: (entry: MemoryEntry) => void;
}) {
  return (
    <div className="memory-groups">
      {groups.map(([agentId, list]) => (
        <section key={agentId} className="panel">
          <div className="panel-title mono">{agentId}</div>
          <ul className="memory-list">
            {list.map((entry) => (
              <li key={entry.id} className="memory-row">
                <div className="memory-content">{entry.content}</div>
                <div className="memory-meta">
                  <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  <span className="memory-provenance">{entry.provenance}</span>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => onForget(entry)}
                    aria-label={`Forget memory entry from ${agentId}`}
                  >
                    Forget
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
