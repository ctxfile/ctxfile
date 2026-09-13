import { Icon, sourceIcon } from "./Icon";
import { StatusPill, type PillStatus } from "./StatusPill";

export interface ConnectorRowProps {
  name: string;
  status: PillStatus;
  durationMs?: number;
  error?: string;
  /** Longest duration in the set, for the relative timing bar. */
  maxDurationMs?: number;
}

const DESCRIPTIONS: Record<string, string> = {
  file: "Key files, ranked and redacted",
  git: "Branch, changes, recent commits",
  notion: "Connected Notion pages",
  ollama: "Local model summary",
  sessions: "Agent session digests",
  notes: "Vault notes",
};

export function ConnectorRow({ name, status, durationMs, error, maxDurationMs }: ConnectorRowProps) {
  const ratio =
    durationMs !== undefined && maxDurationMs !== undefined && maxDurationMs > 0
      ? Math.max(0.04, Math.min(1, durationMs / maxDurationMs))
      : null;
  return (
    <div className={`connector-row connector-${status}`} data-status={status}>
      <span className="connector-icon" aria-hidden="true">
        <Icon name={sourceIcon(name)} size={15} />
      </span>
      <span className="connector-main">
        <span className="connector-name">{name}</span>
        {error !== undefined && status === "error" ? (
          <span className="connector-error" title={error}>
            {error}
          </span>
        ) : (
          <span className="connector-desc">{DESCRIPTIONS[name] ?? "Connector"}</span>
        )}
      </span>
      <span className="connector-right">
        {durationMs !== undefined && (
          <span className="connector-timing">
            {ratio !== null && (
              <span className="connector-bar" aria-hidden="true">
                <span className="connector-bar-fill" style={{ width: `${ratio * 100}%` }} />
              </span>
            )}
            <span className="connector-duration num">{durationMs.toLocaleString()}ms</span>
          </span>
        )}
        <StatusPill status={status} />
      </span>
    </div>
  );
}
