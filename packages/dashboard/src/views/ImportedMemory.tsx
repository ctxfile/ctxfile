import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, ServerGoneError } from "../lib/api";
import { formatDateTime, formatRelative } from "../lib/format";
import {
  MEMORY_CATEGORY_ORDER,
  type ApiIssue,
  type ImportedMemory as ImportedMemoryRecord,
  type ImportedMemoryList,
  type MemoryCategory,
  type MemoryImportSummary,
  type MemoryPromptMode,
  type MemoryScope,
} from "../lib/types";
import { CodeBlock } from "../components/CodeBlock";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { Segmented } from "../components/Segmented";
import { Sheet } from "../components/Sheet";
import { useToast } from "../components/Toast";

type Tab = "global" | "project" | "pending";

const CATEGORY_LABEL: Record<MemoryCategory, string> = {
  instruction: "Instructions",
  preference: "Preferences",
  convention: "Conventions",
  decision: "Decisions",
  gotcha: "Gotchas",
  fact: "Facts",
  project: "Projects",
  career: "Career",
  identity: "Identity",
};

const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Maps any failure to a message safe to show: server-authored 4xx text is
    written for people; everything else collapses to a generic line. */
function friendlyError(err: unknown, onServerGone: () => void): string {
  if (err instanceof ServerGoneError) {
    onServerGone();
    return "The ctxfile server stopped responding.";
  }
  if (err instanceof ApiError && err.status === 503) return "Memory is unavailable in this run (the local store is off).";
  if (err instanceof ApiError && err.status === 400) return err.message;
  return GENERIC_ERROR;
}

export function summarizeImport(result: MemoryImportSummary): string {
  const parts = [`${result.created} new`];
  if (result.merged > 0) parts.push(`${result.merged} merged`);
  if (result.pending > 0) parts.push(`${result.pending} await approval`);
  if (result.skippedRejected > 0) parts.push(`${result.skippedRejected} skipped (rejected before)`);
  return `Imported ${result.scope} memory: ${parts.join(" · ")}${result.complete ? "" : ". More remain: import the next batch."}`;
}

export interface ImportedMemoryProps {
  onServerGone: () => void;
}

/** Free (core) imported memory: what assistants exported about the user,
    at global and project scope, with the approval queue for instructions. */
export function ImportedMemory({ onServerGone }: ImportedMemoryProps) {
  const [data, setData] = useState<ImportedMemoryList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("global");
  const [confirming, setConfirming] = useState<ImportedMemoryRecord | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const { toast } = useToast();

  const load = useCallback((): void => {
    api
      .memories()
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch((err: unknown) => setError(friendlyError(err, onServerGone)));
  }, [onServerGone]);

  useEffect(() => {
    load();
  }, [load]);

  const entries = data?.entries ?? [];
  const pendingCount = entries.filter((e) => e.status === "pending").length;

  const visible = useMemo(
    () =>
      entries.filter((e) => (tab === "pending" ? e.status === "pending" : e.status === "active" && e.scope === tab)),
    [entries, tab]
  );

  const groups = useMemo(
    () =>
      MEMORY_CATEGORY_ORDER.map((category) => [category, visible.filter((e) => e.category === category)] as const).filter(
        ([, list]) => list.length > 0
      ),
    [visible]
  );

  const approve = (entry: ImportedMemoryRecord): void => {
    api
      .approveMemory(entry.id)
      .then(({ approved }) => {
        if (approved) toast("Approved: agents will now see it", "ok");
        load();
      })
      .catch((err: unknown) => setError(friendlyError(err, onServerGone)));
  };

  const approveAll = (): void => {
    api
      .approveAllMemories()
      .then(({ approved }) => {
        toast(`Approved ${approved} entr${approved === 1 ? "y" : "ies"}`, "ok");
        load();
      })
      .catch((err: unknown) => setError(friendlyError(err, onServerGone)));
  };

  const reject = (entry: ImportedMemoryRecord): void => {
    setConfirming(null);
    api
      .rejectMemory(entry.id)
      .then(({ rejected }) => {
        if (rejected) toast("Rejected: it stays rejected on re-import", "ok");
        load();
      })
      .catch((err: unknown) => setError(friendlyError(err, onServerGone)));
  };

  const scopeCount = (scope: MemoryScope): number => entries.filter((e) => e.scope === scope && e.status === "active").length;

  return (
    <section className="imported-memory" aria-labelledby="imported-memory-title">
      <div className="imported-memory-head">
        <div>
          <h2 id="imported-memory-title" className="section-heading">
            Imported memory
          </h2>
          <p className="view-sub">What ChatGPT, Claude, Grok and your other assistants know about you, reviewed here. Free.</p>
        </div>
        <div className="header-actions">
          {pendingCount > 0 && (
            <button type="button" className="btn btn-sm" onClick={approveAll}>
              <Icon name="check" size={13} />
              Approve all ({pendingCount})
            </button>
          )}
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setImportOpen(true)}>
            <Icon name="sparkle" size={13} />
            Import memory
          </button>
        </div>
      </div>

      <Segmented<Tab>
        ariaLabel="Memory scope"
        value={tab}
        onChange={setTab}
        options={[
          { value: "global", label: "Global", badge: scopeCount("global") },
          { value: "project", label: "Project", badge: scopeCount("project") },
          { value: "pending", label: "Pending", badge: pendingCount },
        ]}
      />

      {error !== null && (
        <div className="banner banner-err" role="alert">
          <Icon name="alert" size={15} />
          <span>{error}</span>
        </div>
      )}

      {data !== null && !data.available && (
        <EmptyState icon="memory" title="Memory store is off" body="This run has no local store, so imported memory is unavailable." />
      )}

      {data !== null && data.available && visible.length === 0 && (
        <EmptyState
          icon="memory"
          title={tab === "pending" ? "Nothing awaits approval" : "No memories here yet"}
          body={
            tab === "pending"
              ? "Imported instructions and identity details wait here until you approve them."
              : "Import memory from any assistant: copy the prompt, paste it into ChatGPT, Claude, or Grok, and bring the answer back."
          }
        />
      )}

      <div className="memory-groups">
        {groups.map(([category, list]) => (
          <section key={category} className="panel memory-group" aria-label={CATEGORY_LABEL[category]}>
            <h3 className="panel-title imported-memory-category">
              {CATEGORY_LABEL[category]}
              <span className="memory-group-count num">{list.length}</span>
            </h3>
            <ul className="memory-list">
              {list.map((entry) => (
                <li key={entry.id} className="memory-row">
                  <div className="memory-content">
                    <p>{entry.text}</p>
                  </div>
                  <div className="memory-meta">
                    <span title={entry.date === null ? "Date unknown" : `Learned ${entry.date}`}>
                      <Icon name="clock" size={11} />
                      {entry.date ?? "unknown"}
                    </span>
                    <span className={`chip ${entry.origin === "stored" ? "chip-accent" : "chip-dim"}`}>{entry.origin}</span>
                    {entry.verbatim && <span className="chip chip-dim">verbatim</span>}
                    {entry.status === "pending" && <span className="chip chip-warn">pending · {entry.scope}</span>}
                    <span className="memory-provenance" title={`Imported ${formatDateTime(entry.createdAt)}`}>
                      <Icon name="hash" size={11} />
                      {entry.sources.join(", ")} · {formatRelative(entry.createdAt)}
                    </span>
                    <span className="imported-memory-actions">
                      {entry.status === "pending" && (
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={() => approve(entry)}
                          aria-label={`Approve ${entry.category}: ${entry.text}`}
                        >
                          <Icon name="check" size={12} />
                          Approve
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-small btn-quiet"
                        onClick={() => setConfirming(entry)}
                        aria-label={`Reject ${entry.category}: ${entry.text}`}
                      >
                        <Icon name="trash" size={12} />
                        Reject
                      </button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {confirming !== null && (
        <Sheet title="Reject this memory?" tone="danger" onClose={() => setConfirming(null)}>
          <p className="sheet-body">Agents will no longer see it, and importing it again later will not bring it back.</p>
          <blockquote className="sheet-quote">{confirming.text}</blockquote>
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={() => setConfirming(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={() => reject(confirming)}>
              <Icon name="trash" size={14} />
              Reject
            </button>
          </div>
        </Sheet>
      )}

      {importOpen && (
        <ImportMemorySheet
          onClose={() => setImportOpen(false)}
          onServerGone={onServerGone}
          onImported={(result) => {
            toast(summarizeImport(result), "ok");
            setImportOpen(false);
            setTab(result.pending > 0 ? "pending" : result.scope);
            load();
          }}
        />
      )}
    </section>
  );
}

interface ImportMemorySheetProps {
  onClose: () => void;
  onServerGone: () => void;
  onImported: (result: MemoryImportSummary) => void;
}

export function ImportMemorySheet({ onClose, onServerGone, onImported }: ImportMemorySheetProps) {
  const [scope, setScope] = useState<MemoryScope>("global");
  const [mode, setMode] = useState<MemoryPromptMode>("paste");
  const [prompt, setPrompt] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ApiIssue[]>([]);

  useEffect(() => {
    let cancelled = false;
    setPrompt(null);
    api
      .memoryPrompt(scope, mode)
      .then(({ prompt: next }) => {
        if (!cancelled) setPrompt(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(friendlyError(err, onServerGone));
      });
    return () => {
      cancelled = true;
    };
  }, [scope, mode, onServerGone]);

  const submit = (): void => {
    setBusy(true);
    setError(null);
    setIssues([]);
    api
      .importMemory(text)
      .then(onImported)
      .catch((err: unknown) => {
        setError(friendlyError(err, onServerGone));
        if (err instanceof ApiError) setIssues(err.issues);
      })
      .finally(() => setBusy(false));
  };

  return (
    <Sheet title="Import memory" size="md" onClose={onClose}>
      <div className="import-memory">
        <div className="import-memory-toggles">
          <Segmented<MemoryScope>
            ariaLabel="Import scope"
            size="sm"
            value={scope}
            onChange={setScope}
            options={[
              { value: "global", label: "About me" },
              { value: "project", label: "This project" },
            ]}
          />
          <Segmented<MemoryPromptMode>
            ariaLabel="How the assistant answers"
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "paste", label: "Paste back" },
              { value: "mcp", label: "ctxfile connected" },
            ]}
          />
        </div>
        <p className="sheet-body">
          {mode === "paste"
            ? "1. Copy this prompt into ChatGPT, Claude, Grok, or any assistant. 2. Paste its reply below."
            : "Paste this into an assistant that has ctxfile connected. It calls ingest_memory itself; the entries show up here."}
        </p>
        {prompt === null ? (
          <div className="skeleton import-memory-skeleton" aria-label="Loading prompt" />
        ) : (
          <CodeBlock code={prompt} language="md" title="Export prompt" lineNumbers={false} collapseAfter={8} />
        )}
        {mode === "paste" && (
          <>
            <label className="import-memory-label" htmlFor="import-memory-text">
              The assistant&apos;s reply
            </label>
            <textarea
              id="import-memory-text"
              className="input import-memory-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste the whole reply; the ```json block inside it is enough."
              rows={7}
            />
          </>
        )}
        {error !== null && (
          <div className="banner banner-err" role="alert">
            <Icon name="alert" size={15} />
            <span>{error}</span>
          </div>
        )}
        {issues.length > 0 && (
          <ul className="import-memory-issues" aria-label="Problems with the export">
            {issues.map((issue) => (
              <li key={`${issue.path}:${issue.message}`}>
                <code>{issue.path || "(root)"}</code>: {issue.message}
              </li>
            ))}
          </ul>
        )}
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>
            {mode === "paste" ? "Cancel" : "Done"}
          </button>
          {mode === "paste" && (
            <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || text.trim() === ""}>
              <Icon name="check" size={14} />
              {busy ? "Importing…" : "Import"}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
