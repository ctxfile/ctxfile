import { formatAge, formatDuration, splitPath } from "../lib/format";
import { useNow } from "../lib/hooks";
import type { LiveRun } from "../lib/hooks";
import type { DashboardState } from "../lib/types";
import { viewDef, type ViewId } from "../lib/views";
import { Icon } from "./Icon";

export interface TopBarProps {
  state: DashboardState | null;
  view: ViewId;
  theme: "dark" | "light";
  run: LiveRun;
  onRunSnapshot: () => void;
  onToggleTheme: () => void;
  onOpenPalette: () => void;
  onOpenSidebar: () => void;
}

/** Shell header: project, live snapshot status, global actions. */
export function TopBar({
  state,
  view,
  theme,
  run,
  onRunSnapshot,
  onToggleTheme,
  onOpenPalette,
  onOpenSidebar,
}: TopBarProps) {
  const now = useNow(run.running ? 500 : 10_000);
  const generatedAt = state?.latest?.generatedAt ?? null;
  const ageMs = generatedAt !== null ? now - Date.parse(generatedAt) : null;
  const stale = state !== null && ageMs !== null && ageMs > state.config.cacheMaxAgeMs;
  const runningConnectors = Object.entries(run.connectors)
    .filter(([, c]) => c.status === "running")
    .map(([name]) => name);
  const elapsed = run.running && run.startedAt !== null ? now - run.startedAt : null;
  const root = state !== null ? splitPath(state.root.replace(/\/$/, "")) : null;

  let statusTone = "idle";
  let statusText = "no snapshot yet";
  if (run.running) {
    statusTone = "running";
    statusText =
      runningConnectors.length > 0
        ? `recording · ${runningConnectors.join(", ")}`
        : `recording${elapsed !== null ? ` · ${formatDuration(elapsed)}` : ""}`;
  } else if (run.error !== null) {
    statusTone = "error";
    statusText = "last run failed";
  } else if (ageMs !== null) {
    statusTone = stale ? "stale" : "fresh";
    statusText = `snapshot ${formatAge(ageMs)}`;
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="icon-btn topbar-menu" onClick={onOpenSidebar} aria-label="Open navigation">
          <Icon name="list" size={18} />
        </button>
        <div className="crumbs" aria-label="Location">
          {root !== null ? (
            <>
              <span className="crumb crumb-dir mono" title={state?.root}>
                {root.dir}
              </span>
              <span className="crumb crumb-project mono" title={state?.root}>
                {root.base}
              </span>
            </>
          ) : (
            <span className="crumb crumb-dir mono">connecting…</span>
          )}
          <Icon name="chevron-right" size={13} className="crumb-sep" />
          <span className="crumb crumb-view">{viewDef(view).label}</span>
        </div>
      </div>

      <div className="topbar-right">
        <span
          className={`status-chip status-${statusTone}`}
          title={
            stale
              ? "Latest snapshot is older than the cache window"
              : run.running
                ? "A snapshot is being recorded"
                : "Age of the latest snapshot"
          }
          role="status"
        >
          <span className="led" aria-hidden="true" />
          <span className="status-text num">{statusText}</span>
        </span>

        <button
          type="button"
          className={`btn btn-primary btn-sm topbar-run${run.running ? " is-running" : ""}`}
          onClick={onRunSnapshot}
          disabled={run.running}
          aria-label="Run snapshot"
          data-tip="Run snapshot (R)"
        >
          <Icon name={run.running ? "refresh" : "play"} size={14} className={run.running ? "spin" : undefined} />
          <span className="topbar-run-label">{run.running ? "Recording" : "Snapshot"}</span>
        </button>

        <button
          type="button"
          className="btn btn-ghost btn-sm topbar-palette"
          onClick={onOpenPalette}
          aria-label="Open command palette"
        >
          <Icon name="search" size={14} />
          <span className="topbar-palette-label">Search</span>
          <kbd>⌘K</kbd>
        </button>

        <button
          type="button"
          className="icon-btn theme-btn"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          data-tip={theme === "dark" ? "Light theme" : "Dark theme"}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
        </button>
      </div>
    </header>
  );
}
