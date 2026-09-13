import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ApiError, ServerGoneError } from "../lib/api";
import { formatDuration } from "../lib/format";
import { useCopy } from "../lib/hooks";
import { parseJsonData, streamSse } from "../lib/sse";
import type { ProFeatures } from "../lib/types";
import { Icon, sourceIcon } from "../components/Icon";
import { JsonView } from "../components/JsonView";
import { Markdown } from "../components/Markdown";
import { ProLock } from "../components/ProLock";

interface StreamedEvent {
  event: string;
  data: unknown;
}

interface ProviderColumn {
  provider: string;
  chunks: string[];
  done: boolean;
  startedAt: number;
  finishedAt: number | null;
}

export interface ConsultProps {
  features: ProFeatures;
  providers: { type: string; model: string | null }[];
  onServerGone: () => void;
}

const SUGGESTIONS = [
  "What is the riskiest part of the current diff, and why?",
  "Summarise what changed since the last snapshot in three bullets.",
  "Which key file would you refactor first, and how?",
];

export function Consult({ features, providers, onServerGone }: ConsultProps) {
  const [question, setQuestion] = useState("");
  const [columns, setColumns] = useState<Record<string, ProviderColumn>>({});
  const [extras, setExtras] = useState<StreamedEvent[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [copiedId, copy] = useCopy();

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!features.consult) {
    return (
      <div className="view">
        <header className="view-header">
          <div>
            <h1>Consult</h1>
            <p className="view-sub">One question, several models, your live context attached.</p>
          </div>
        </header>
        <ProLock
          feature="consult"
          pitch="Ask multiple model providers the same question over your live project context; answers stream side by side."
          bullets={["Multiple providers, one question", "Live project context attached automatically", "Answers stream in side-by-side columns"]}
        >
          <div className="consult-columns">
            <div className="panel consult-col">
              <div className="panel-title mono">anthropic</div>
              <p>The cache invalidation bug is in the fingerprint comparison…</p>
            </div>
            <div className="panel consult-col">
              <div className="panel-title mono">openai</div>
              <p>Consider hashing the resolved config instead of individual fields…</p>
            </div>
          </div>
        </ProLock>
      </div>
    );
  }

  const stop = (): void => {
    abortRef.current?.abort();
    setStreaming(false);
    setColumns((prev) => Object.fromEntries(Object.entries(prev).map(([k, col]) => [k, { ...col, done: true, finishedAt: col.finishedAt ?? Date.now() }])));
  };

  const submit = (): void => {
    const q = question.trim();
    if (q === "" || streaming) return;
    setColumns({});
    setExtras([]);
    setNotice(null);
    setStreaming(true);
    setLastQuestion(q);
    const controller = new AbortController();
    abortRef.current = controller;
    streamSse("/api/internal/consult", {
      method: "POST",
      body: { question: q },
      signal: controller.signal,
      onEvent: (frame) => {
        const data: unknown = parseJsonData(frame) ?? frame.data;
        const record = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
        const provider =
          typeof record["provider"] === "string" ? record["provider"] : typeof record["type"] === "string" ? record["type"] : null;
        const text =
          typeof record["text"] === "string"
            ? record["text"]
            : typeof record["chunk"] === "string"
              ? record["chunk"]
              : typeof record["content"] === "string"
                ? record["content"]
                : null;
        if (provider !== null && text !== null) {
          setColumns((prev) => {
            const col = prev[provider] ?? { provider, chunks: [], done: false, startedAt: Date.now(), finishedAt: null };
            return { ...prev, [provider]: { ...col, chunks: [...col.chunks, text] } };
          });
        } else if (provider !== null && (frame.event === "provider:done" || frame.event === "done")) {
          setColumns((prev) => {
            const col = prev[provider];
            return col ? { ...prev, [provider]: { ...col, done: true, finishedAt: Date.now() } } : prev;
          });
        } else {
          // Unknown/auxiliary events (diffs, comparisons, …) render generically below.
          setExtras((prev) => [...prev, { event: frame.event, data }]);
        }
      },
    })
      .then(() => setStreaming(false))
      .catch((err: unknown) => {
        setStreaming(false);
        if (controller.signal.aborted) return;
        if (err instanceof ServerGoneError) {
          onServerGone();
          return;
        }
        if (err instanceof ApiError && err.status === 501) {
          setNotice("Consult streaming isn't available in this Pro build.");
        } else {
          setNotice(err instanceof Error ? err.message : "consult failed");
        }
      });
  };

  const columnList = Object.values(columns);

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>Consult</h1>
          <p className="view-sub">One question, several models, your live context attached automatically.</p>
        </div>
        {providers.length > 0 && (
          <div className="header-actions provider-chips">
            {providers.map((p) => (
              <span key={`${p.type}-${p.model ?? ""}`} className="chip mono">
                <Icon name={sourceIcon(p.type)} size={12} />
                {p.type}
                {p.model !== null ? <span className="chip-dim"> · {p.model}</span> : ""}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="composer">
        <textarea
          ref={textareaRef}
          className="composer-input"
          placeholder="Ask your configured providers about the current project context…"
          aria-label="Consult question"
          rows={3}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer-bar">
          <span className="composer-hint">
            <kbd>⌘</kbd>
            <kbd>↵</kbd> to ask · context from the latest snapshot is attached
          </span>
          <span className="composer-actions">
            {streaming && (
              <button type="button" className="btn btn-ghost" onClick={stop}>
                <Icon name="stop" size={13} />
                Stop
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={submit} disabled={streaming || question.trim() === ""}>
              <Icon name={streaming ? "refresh" : "consult"} size={14} className={streaming ? "spin" : undefined} />
              {streaming ? "Streaming…" : "Ask"}
            </button>
          </span>
        </div>
      </div>

      {columnList.length === 0 && !streaming && lastQuestion === null && (
        <div className="suggestions" aria-label="Suggested questions">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="suggestion"
              onClick={() => {
                setQuestion(s);
                textareaRef.current?.focus();
              }}
            >
              <Icon name="sparkle" size={12} />
              {s}
            </button>
          ))}
        </div>
      )}

      {notice !== null && (
        <div className="banner banner-warn" role="alert">
          <Icon name="info" size={15} />
          <span>{notice}</span>
        </div>
      )}

      {lastQuestion !== null && (columnList.length > 0 || streaming) && (
        <div className="asked">
          <span className="asked-label">Asked</span>
          <span className="asked-text">{lastQuestion}</span>
        </div>
      )}

      {columnList.length > 0 && (
        <div className="consult-columns" style={{ "--cols": Math.min(3, columnList.length) } as CSSProperties}>
          {columnList.map((col) => {
            const answer = col.chunks.join("");
            const elapsed = (col.finishedAt ?? Date.now()) - col.startedAt;
            return (
              <article key={col.provider} className={`panel consult-col${col.done ? " is-done" : " is-streaming"}`}>
                <div className="panel-title">
                  <span className="git-col-title mono">
                    <Icon name={sourceIcon(col.provider)} size={13} />
                    {col.provider}
                  </span>
                  <span className="panel-title-right">
                    <span className="panel-title-meta num">{formatDuration(elapsed)}</span>
                    {col.done ? (
                      <span className="chip chip-ok">
                        <span className="led" aria-hidden="true" /> done
                      </span>
                    ) : (
                      <span className="chip chip-accent">
                        <span className="led led-running" aria-hidden="true" /> streaming
                      </span>
                    )}
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => copy(col.provider, answer)}
                      aria-label={`Copy ${col.provider} answer`}
                      data-tip={copiedId === col.provider ? "Copied" : "Copy"}
                    >
                      <Icon name={copiedId === col.provider ? "check" : "copy"} size={13} />
                    </button>
                  </span>
                </div>
                <div className="consult-answer">
                  {answer === "" ? <span className="muted">Waiting for the first token…</span> : <Markdown source={answer} />}
                  {!col.done && <span className="caret" aria-hidden="true" />}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {extras.length > 0 && (
        <section className="panel">
          <button type="button" className="panel-title panel-title-btn" onClick={() => setShowEvents((v) => !v)} aria-expanded={showEvents}>
            <span>
              Stream events <span className="panel-title-meta num">{extras.length}</span>
            </span>
            <Icon name="chevron-down" size={14} className={showEvents ? "is-open" : undefined} />
          </button>
          {showEvents && (
            <ul className="event-list">
              {extras.map((extra, index) => (
                <li key={index} className="event-row">
                  <span className="chip mono">{extra.event}</span>
                  <div className="event-data">
                    {typeof extra.data === "string" ? <pre className="mono">{extra.data}</pre> : <JsonView value={extra.data} defaultDepth={1} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
