import { useEffect, useMemo, useState } from "react";
import { api, ApiError, ServerGoneError } from "../lib/api";
import type { PlaybookEntry, ProFeatures } from "../lib/types";
import { EmptyState } from "../components/EmptyState";
import { ProLock } from "../components/ProLock";
import { Sheet } from "../components/Sheet";

const FIXTURE_ENTRIES: PlaybookEntry[] = [
  {
    id: "p1",
    title: "Educational pathway planning with constraints",
    prompt:
      "Identify a <student>'s academic <constraint> limiting direct entry to <subject> degrees. Research alternative pathways that lead to advanced standing... verify program-specific entry requirements, fee structures including mandatory extras, and credit-transfer rules across institutions.",
    provenance: "distilled by ollama/qwen3:8b from 1 session in thread “Wayne education pathway”",
    createdAt: "2026-07-13T21:00:00Z",
  },
  {
    id: "p2",
    title: "Ship a feature end to end",
    prompt:
      "Given <feature>, validate demand first, design the smallest correct schema change, keep writes append-safe, test every layer including the negative paths, then release: gate, versions together, publish in dependency order, deploy, verify live.",
    provenance: "distilled by claude from 2 sessions in thread “ctxfile launch”",
    createdAt: "2026-07-13T20:00:00Z",
  },
];

export interface PlaybooksProps {
  features: ProFeatures;
  onServerGone: () => void;
}

function PlaybookList({
  entries,
  onCopy,
  onRemove,
  copiedId,
}: {
  entries: PlaybookEntry[];
  onCopy: (entry: PlaybookEntry) => void;
  onRemove: (entry: PlaybookEntry) => void;
  copiedId: string | null;
}) {
  return (
    <ul className="card-list">
      {entries.map((entry) => (
        <li key={entry.id} className="card">
          <div className="card-head">
            <h3>{entry.title}</h3>
            <div className="card-actions">
              <button type="button" className="btn btn-small" onClick={() => onCopy(entry)}>
                {copiedId === entry.id ? "copied ✓" : "copy"}
              </button>
              <button
                type="button"
                className="btn btn-small btn-quiet"
                aria-label={`Remove playbook ${entry.title}`}
                onClick={() => onRemove(entry)}
              >
                ✕
              </button>
            </div>
          </div>
          <pre className="card-body-pre">{entry.prompt}</pre>
          <div className="card-meta">
            {entry.provenance} · {new Date(entry.createdAt).toLocaleString()}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Playbooks({ features, onServerGone }: PlaybooksProps) {
  const [entries, setEntries] = useState<PlaybookEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(!features.memory);
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<PlaybookEntry | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!features.memory) return;
    let cancelled = false;
    api
      .playbooks()
      .then((data) => {
        if (!cancelled) setEntries(data.entries);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ServerGoneError) onServerGone();
        if (err instanceof ApiError && err.status === 403) setLocked(true);
        else setError(err instanceof Error ? err.message : "failed to load playbooks");
      });
    return () => {
      cancelled = true;
    };
  }, [features.memory, onServerGone]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (entries ?? []).filter(
      (e) => q === "" || e.title.toLowerCase().includes(q) || e.prompt.toLowerCase().includes(q)
    );
  }, [entries, query]);

  const copy = (entry: PlaybookEntry): void => {
    navigator.clipboard
      .writeText(entry.prompt)
      .then(() => {
        setCopiedId(entry.id);
        window.setTimeout(() => setCopiedId((prev) => (prev === entry.id ? null : prev)), 1500);
      })
      .catch(() => setError("clipboard unavailable; select the text manually"));
  };

  const remove = (entry: PlaybookEntry): void => {
    setConfirming(null);
    api
      .rmPlaybook(entry.id)
      .then(({ removed }) => {
        if (removed) setEntries((prev) => (prev ?? []).filter((e) => e.id !== entry.id));
      })
      .catch((err: unknown) => {
        if (err instanceof ServerGoneError) onServerGone();
        setError(err instanceof Error ? err.message : "failed to remove playbook");
      });
  };

  if (locked) {
    return (
      <div className="view">
        <header className="view-header">
          <h1>Playbooks</h1>
        </header>
        <ProLock
          feature="memory"
          pitch="Reusable prompts, distilled by an AI from your own sessions — the method you already proved, ready to run again anywhere."
          bullets={[
            "Distilled from your real sessions and transcripts",
            "Local models supported: nothing leaves your machine",
            "Served as native MCP prompts in every connected client",
          ]}
        >
          <PlaybookList entries={FIXTURE_ENTRIES} onCopy={() => undefined} onRemove={() => undefined} copiedId={null} />
        </ProLock>
      </div>
    );
  }

  return (
    <div className="view">
      <header className="view-header">
        <h1>Playbooks</h1>
        <input
          type="search"
          className="search-input"
          placeholder="Filter playbooks…"
          aria-label="Filter playbooks"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </header>

      <div className="trust-strip">
        Distilled by your configured models · AES-256-GCM at rest · ask any agent: “distill a playbook from
        thread …”
      </div>

      {error !== null && (
        <div className="banner banner-err" role="alert">
          {error}
        </div>
      )}

      {entries !== null && entries.length === 0 && (
        <EmptyState
          title="No playbooks yet"
          body="Ask any connected agent to run distill_playbook on a thread — it studies what you did and writes the reusable prompt."
        />
      )}

      {entries !== null && entries.length > 0 && visible.length === 0 && (
        <EmptyState title="No matches" body="No playbooks match this filter." />
      )}

      <PlaybookList entries={visible} onCopy={copy} onRemove={(entry) => setConfirming(entry)} copiedId={copiedId} />

      {confirming !== null && (
        <Sheet title="Remove this playbook?" onClose={() => setConfirming(null)}>
          <p className="sheet-body">This permanently deletes the distilled prompt from the encrypted library.</p>
          <blockquote className="sheet-quote">{confirming.title}</blockquote>
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={() => setConfirming(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={() => remove(confirming)}>
              Remove
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
