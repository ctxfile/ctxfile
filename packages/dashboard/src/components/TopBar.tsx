import { useEffect, useState } from "react";
import { formatAge, truncateMiddle } from "../lib/format";
import type { DashboardState } from "../lib/types";

export interface TopBarProps {
  state: DashboardState | null;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenPalette: () => void;
}

/** Slim shell header: project root, live snapshot age, palette hint, theme toggle. */
export function TopBar({ state, theme, onToggleTheme, onOpenPalette }: TopBarProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  const generatedAt = state?.latest?.generatedAt ?? null;
  const ageMs = generatedAt !== null ? now - Date.parse(generatedAt) : null;
  const stale = state !== null && ageMs !== null && ageMs > state.config.cacheMaxAgeMs;

  return (
    <header className="topbar">
      <span className="topbar-root mono" {...(state !== null ? { title: state.root } : {})}>
        {state !== null ? truncateMiddle(state.root) : "connecting…"}
      </span>
      <div className="topbar-actions">
        <span
          className={`chip num topbar-age${stale ? " chip-warn" : ""}`}
          title={stale ? "Latest snapshot is older than the cache window" : "Age of latest snapshot"}
        >
          {ageMs !== null ? `snapshot ${formatAge(ageMs)}` : "no snapshot"}
        </span>
        <button
          type="button"
          className="topbar-chip-btn"
          onClick={onOpenPalette}
          aria-label="Open command palette"
        >
          <kbd>⌘K</kbd>
        </button>
        <button
          type="button"
          className="topbar-switch-btn"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          <span className="switch" data-on={theme === "dark"} aria-hidden="true">
            <span className="switch-knob" />
          </span>
        </button>
      </div>
    </header>
  );
}
