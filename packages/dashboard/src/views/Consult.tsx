import { useRef, useState } from "react";
import { ApiError, ServerGoneError } from "../lib/api";
import { parseJsonData, streamSse } from "../lib/sse";
import type { ProFeatures } from "../lib/types";
import { ProLock } from "../components/ProLock";

interface StreamedEvent {
  event: string;
  data: unknown;
}

interface ProviderColumn {
  provider: string;
  chunks: string[];
  done: boolean;
}

export interface ConsultProps {
  features: ProFeatures;
  providers: { type: string; model: string | null }[];
  onServerGone: () => void;
}

export function Consult({ features, providers, onServerGone }: ConsultProps) {
  const [question, setQuestion] = useState("");
  const [columns, setColumns] = useState<Record<string, ProviderColumn>>({});
  const [extras, setExtras] = useState<StreamedEvent[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  if (!features.consult) {
    return (
      <div className="view">
        <header className="view-header">
          <h1>Consult</h1>
        </header>
        <ProLock
          feature="consult"
          pitch="Ask multiple model providers the same question over your live project context; answers stream side by side."
          bullets={[
            "Multiple providers, one question",
            "Live project context attached automatically",
            "Answers stream in side-by-side columns",
          ]}
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

  const submit = (): void => {
    const q = question.trim();
    if (q === "" || streaming) return;
    setColumns({});
    setExtras([]);
    setNotice(null);
    setStreaming(true);
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
          typeof record["provider"] === "string"
            ? record["provider"]
            : typeof record["type"] === "string"
              ? record["type"]
              : null;
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
            const col = prev[provider] ?? { provider, chunks: [], done: false };
            return { ...prev, [provider]: { ...col, chunks: [...col.chunks, text] } };
          });
        } else if (provider !== null && (frame.event === "provider:done" || frame.event === "done")) {
          setColumns((prev) => {
            const col = prev[provider];
            return col ? { ...prev, [provider]: { ...col, done: true } } : prev;
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
        <h1>Consult</h1>
        {providers.length > 0 && (
          <div className="header-actions">
            {providers.map((p) => (
              <span key={`${p.type}-${p.model ?? ""}`} className="chip mono">
                {p.type}
                {p.model !== null ? ` · ${p.model}` : ""}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="consult-form">
        <textarea
          className="consult-input"
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
        <button
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={streaming || question.trim() === ""}
        >
          {streaming ? "Streaming…" : "Ask"}
        </button>
      </div>

      {notice !== null && (
        <div className="banner banner-warn" role="alert">
          {notice}
        </div>
      )}

      {columnList.length > 0 && (
        <div className="consult-columns">
          {columnList.map((col) => (
            <div key={col.provider} className="panel consult-col">
              <div className="panel-title mono">
                {col.provider}
                {col.done && <span className="chip chip-ok">done</span>}
              </div>
              <pre className="detail-pre consult-answer">{col.chunks.join("")}</pre>
            </div>
          ))}
        </div>
      )}

      {extras.length > 0 && (
        <section className="panel">
          <div className="panel-title">Stream events</div>
          <ul className="event-list">
            {extras.map((extra, index) => (
              <li key={index} className="event-row">
                <span className="chip mono">{extra.event}</span>
                <pre className="event-data mono">
                  {typeof extra.data === "string" ? extra.data : JSON.stringify(extra.data)}
                </pre>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
