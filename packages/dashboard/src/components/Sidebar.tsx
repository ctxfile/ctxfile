import { VIEWS, isLocked, type ViewDef, type ViewId } from "../lib/views";
import type { ProFeatures } from "../lib/types";
import { BrandMark, Icon, type IconName } from "./Icon";

export interface SidebarProps {
  active: ViewId;
  features: ProFeatures;
  onNavigate: (view: ViewId) => void;
  version: string | null;
  /** "Core", "Pro", "Team"… shown in the foot. */
  tier: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Mobile drawer state; ignored on wide layouts. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const VIEW_ICON: Record<ViewId, IconName> = {
  overview: "overview",
  context: "context",
  git: "git",
  sessions: "sessions",
  memory: "memory",
  playbooks: "playbooks",
  consult: "consult",
  settings: "settings",
};

const GROUPS: { id: ViewDef["group"]; label: string }[] = [
  { id: "workspace", label: "Workspace" },
  { id: "pro", label: "Pro" },
];

export function Sidebar({
  active,
  features,
  onNavigate,
  version,
  tier,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const renderItem = (view: ViewDef) => {
    const locked = isLocked(view, features);
    const current = active === view.id;
    return (
      <button
        key={view.id}
        type="button"
        className={`nav-item${current ? " is-active" : ""}${locked ? " is-locked" : ""}`}
        aria-current={current ? "page" : undefined}
        aria-label={collapsed ? view.label : undefined}
        data-tip={collapsed ? view.label : undefined}
        data-tip-side="right"
        onClick={() => {
          onNavigate(view.id);
          onCloseMobile();
        }}
      >
        <span className="nav-icon">
          <Icon name={VIEW_ICON[view.id]} size={17} />
        </span>
        <span className="nav-label">{view.label}</span>
        <span className="nav-trail">
          {locked ? (
            <Icon name="lock" size={12} className="nav-lock" />
          ) : (
            <kbd className="nav-kbd" aria-hidden="true">
              {view.shortcut}
            </kbd>
          )}
        </span>
      </button>
    );
  };

  return (
    <>
      <div className={`sidebar-scrim${mobileOpen ? " is-open" : ""}`} onClick={onCloseMobile} aria-hidden="true" />
      <nav
        className={`sidebar${collapsed ? " is-collapsed" : ""}${mobileOpen ? " is-open" : ""}`}
        aria-label="Views"
      >
        <div className="sidebar-brand">
          <BrandMark size={26} />
          <span className="sidebar-wordmark">
            ctxfile
            <span className="sidebar-tag">context recorder</span>
          </span>
          <button
            type="button"
            className="icon-btn sidebar-close"
            onClick={onCloseMobile}
            aria-label="Close navigation"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="sidebar-groups">
          {GROUPS.map((group) => (
            <div key={group.id} className="nav-group">
              <div className="nav-group-label">{group.label}</div>
              {VIEWS.filter((v) => v.group === group.id).map(renderItem)}
            </div>
          ))}
        </div>

        <div className="sidebar-foot">
          {VIEWS.filter((v) => v.group === "system").map(renderItem)}
          <div className="sidebar-meta">
            <span className={`tier-chip tier-${tier.toLowerCase()}`}>{tier}</span>
            {version !== null && <span className="sidebar-version mono">v{version}</span>}
          </div>
          <button
            type="button"
            className="icon-btn sidebar-collapse"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            data-tip={collapsed ? "Expand" : "Collapse"}
            data-tip-side="right"
          >
            <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={15} />
          </button>
        </div>
      </nav>
    </>
  );
}
