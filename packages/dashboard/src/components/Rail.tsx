import { VIEWS, type ViewId } from "../lib/views";
import type { ProFeatures } from "../lib/types";

export interface RailProps {
  active: ViewId;
  features: ProFeatures;
  onNavigate: (view: ViewId) => void;
  version?: string | null;
}

export function Rail({ active, features, onNavigate, version = null }: RailProps) {
  return (
    <nav className="rail" aria-label="Views">
      <div className="rail-brand" title="ctxfile">
        <svg
          className="brand-mark"
          viewBox="0 0 32 32"
          width="26"
          height="26"
          aria-hidden="true"
        >
          <rect width="32" height="32" rx="7" fill="#f55300" />
          <path
            d="M11 8.5h7l3.5 3.5v11.5h-10.5z"
            fill="none"
            stroke="#1c0b02"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M18 8.5v3.5h3.5" fill="none" stroke="#1c0b02" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="16" cy="18" r="2.1" fill="#1c0b02" />
        </svg>
        <span className="brand-word">
          ctxfile
          <span className="brand-tag">context recorder</span>
        </span>
      </div>
      {VIEWS.map((view) => {
        const locked =
          view.pro === true &&
          !(view.id === "sessions"
            ? features.sessions
            : view.id === "memory"
              ? features.memory
              : features.consult);
        return (
          <button
            key={view.id}
            type="button"
            className={`rail-item${active === view.id ? " rail-active" : ""}`}
            aria-current={active === view.id ? "page" : undefined}
            aria-label={view.label}
            data-tip={view.label}
            onClick={() => onNavigate(view.id)}
          >
            <span className="rail-glyph" aria-hidden="true">
              {view.glyph}
            </span>
            <span className="rail-label">{view.label}</span>
            {locked && (
              <span className="rail-pro" aria-label="Pro feature">
                ✦
              </span>
            )}
          </button>
        );
      })}
      {version !== null && (
        <div className="rail-foot">
          <span className="rail-version mono">v{version}</span>
        </div>
      )}
    </nav>
  );
}
