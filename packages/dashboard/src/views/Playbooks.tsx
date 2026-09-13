import { useEffect, useMemo, useState } from "react";
import { api, ApiError, ServerGoneError } from "../lib/api";
import { formatDateTime, formatRelative } from "../lib/format";
import { useCopy } from "../lib/hooks";
import type { PlaybookEntry, ProFeatures } from "../lib/types";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { Markdown } from "../components/Markdown";
import { ProLock } from "../components/ProLock";
import { SearchInput } from "../components/SearchInput";
import { Sheet } from "../components/Sheet";
import { ViewSkeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";

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

function placeholders(prompt: string): string[] {
  const found = new Set<string>();
  for (const m of prompt.matchAll(/<([A-Za-z][A-Za-z0-9 _:/.-]{0,40})>/g)) {
    if (m[1] !== undefined) found.add(m[1]);
  }
  return [...found];
}

function PlaybookList({
  entries,
  onCopy,
  onRemove,
  copiedId,
  expandedId,
  onToggle,
}: {
  entries: PlaybookEntry[];
  onCopy: (entry: PlaybookEntry) => void;
  onRemove: (entry: PlaybookEntry) => void;
  copiedId: string | null;
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="card-grid">
      {entries.map((entry) => {
        const slots = placeholders(entry.prompt);
        const long = entry.prompt.length > 420;
        const expanded = expandedId === entry.id;
        return (
          <li key={entry.id} className={`panel playbook${expanded ? " is-expanded" : ""}`}>
            <div className="card-head">
              <span className="playbook-icon" aria-hidden="true">
                <Icon name="playbooks" size={14} />
              </span>
              <h3 className="card-title">{entry.title}</h3>
              <div className="card-actions">
                <button type="button" className="btn btn-small" onClick={() => onCopy(entry)}>
                  <Icon name={copiedId === entry.id ? "check" : "copy"} size={12} />
                  {copiedId === entry.id ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove playbook ${entry.title}`}
                  data-tip="Remove"
                  onClick={() => onRemove(entry)}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
            {slots.length > 0 && (
              <div className="playbook-slots" aria-label="Placeholders to fill">
                {slots.map((slot) => (
                  <span key={slot} className="md-placeholder">
                    {slot}
                  </span>
                ))}
              </div>
            )}
            <div className={`playbook-prompt${long && !expanded ? " is-clamped" : ""}`}>
              <Markdown source={entry.prompt} compact />
            </div>
            {long && (
              <button type="button" className="link-btn playbook-more" onClick={() => onToggle(entry.id)}>
                {expanded ? "Show less" : "Show full prompt"}
                <Icon name={expanded ? "chevron-down" : "chevron-right"} size={12} />
              </button>
            )}
            <div className="card-meta">
              <span className="card-provenance" title={entry.provenance}>
                <Icon name="sparkle" size={11} />
                {entry.provenance}
              </span>
              <span title={formatDateTime(entry.createdAt)}>{formatRelative(entry.createdAt)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function Playbooks({ features, onServerGone }: PlaybooksProps) {
  const [entries, setEntries] = useState<PlaybookEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(!features.memory);
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<PlaybookEntry | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, copy] = useCopy();
  const { toast } = useToast();

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
    return (entries ?? [])
      .filter((e) => q === "" || e.title.toLowerCase().includes(q) || e.prompt.toLowerCase().includes(q))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [entries, query]);

  const copyPrompt = (entry: PlaybookEntry): void => {
    copy(entry.id, entry.prompt);
  };

  const remove = (entry: PlaybookEntry): void => {
    setConfirming(null);
    api
      .rmPlaybook(entry.id)
      .then(({ removed }) => {
        if (removed) {
          setEntries((prev) => (prev ?? []).filter((e) => e.id !== entry.id));
          toast("Playbook removed", "ok");
        }
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
          <div>
            <h1>Playbooks</h1>
            <p className="view-sub">Prompts distilled from the work you already did.</p>
          </div>
        </header>
        <ProLock
          feature="memory"
          pitch="Reusable prompts, distilled by an AI from your own sessions: the method you already proved, ready to run again anywhere."
          bullets={[
            "Distilled from your real sessions and transcripts",
            "Local models supported: nothing leaves your machine",
            "Served as native MCP prompts in every connected client",
          ]}
        >
          <PlaybookList entries={FIXTURE_ENTRIES} onCopy={() => undefined} onRemove={() => undefined} copiedId={null} expandedId={null} onToggle={() => undefined} />
        </ProLock>
      </div>
    );
  }

  if (entries === null && error === null) return <ViewSkeleton title="Playbooks" />;

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>Playbooks</h1>
          <p className="view-sub">
            {(entries?.length ?? 0).toLocaleString()} distilled prompt{entries?.length === 1 ? "" : "s"}, served as MCP prompts to every client
          </p>
        </div>
        <div className="header-actions">
          <SearchInput value={query} onChange={setQuery} placeholder="Filter playbooks…" ariaLabel="Filter playbooks" slashShortcut />
        </div>
      </header>

      <div className="trust-strip">
        <Icon name="sparkle" size={13} />
        <span>
          Distilled by your configured models · AES-256-GCM at rest · ask any agent: <em>“distill a playbook from thread …”</em>
        </span>
      </div>

      {error !== null && (
        <div className="banner banner-err" role="alert">
          <Icon name="alert" size={15} />
          <span>{error}</span>
        </div>
      )}

      {entries !== null && entries.length === 0 && (
        <EmptyState
          icon="playbooks"
          title="No playbooks yet"
          body="Ask any connected agent to run distill_playbook on a thread. It studies what you did and writes the reusable prompt."
        />
      )}

      {entries !== null && entries.length > 0 && visible.length === 0 && (
        <EmptyState icon="search" title="No matches" body="No playbooks match this filter." />
      )}

      <PlaybookList
        entries={visible}
        onCopy={copyPrompt}
        onRemove={(entry) => setConfirming(entry)}
        copiedId={copiedId}
        expandedId={expandedId}
        onToggle={(id) => setExpandedId((prev) => (prev === id ? null : id))}
      />

      {confirming !== null && (
        <Sheet title="Remove this playbook?" tone="danger" onClose={() => setConfirming(null)}>
          <p className="sheet-body">This permanently deletes the distilled prompt from the encrypted library.</p>
          <blockquote className="sheet-quote">{confirming.title}</blockquote>
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={() => setConfirming(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={() => remove(confirming)}>
              <Icon name="trash" size={14} />
              Remove
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
