export type PillStatus = "ok" | "skipped" | "error" | "running" | "locked" | "pending";

const LABELS: Record<PillStatus, string> = {
  ok: "ok",
  skipped: "skipped",
  error: "error",
  running: "running",
  locked: "pro",
  pending: "pending",
};

export function StatusPill({ status, label }: { status: PillStatus; label?: string }) {
  return (
    <span className={`pill pill-${status}`} data-status={status}>
      <span className="pill-dot" aria-hidden="true" />
      {label ?? LABELS[status]}
    </span>
  );
}
