import { StatusPill, type PillStatus } from "./StatusPill";

export interface ConnectorRowProps {
  name: string;
  status: PillStatus;
  durationMs?: number;
  error?: string;
}

export function ConnectorRow({ name, status, durationMs, error }: ConnectorRowProps) {
  return (
    <div className={`connector-row connector-${status}`} data-status={status}>
      <span className="connector-name">{name}</span>
      {error !== undefined && status === "error" && (
        <span className="connector-error" title={error}>
          {error}
        </span>
      )}
      <span className="connector-right">
        {durationMs !== undefined && (
          <span className="connector-duration num">{durationMs.toLocaleString()}ms</span>
        )}
        <StatusPill status={status} />
      </span>
    </div>
  );
}
