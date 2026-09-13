import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export interface EmptyStateProps {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  /** Icon name, or any node for custom glyphs. */
  icon?: IconName | ReactNode;
  /** Tighter layout for embedding inside panels. */
  compact?: boolean;
}

function isIconName(value: unknown): value is IconName {
  return typeof value === "string";
}

export function EmptyState({ title, body, action, icon = "context", compact = false }: EmptyStateProps) {
  return (
    <div className={`empty-state${compact ? " empty-compact" : ""}`}>
      <div className="empty-icon" aria-hidden="true">
        {isIconName(icon) ? <Icon name={icon} size={compact ? 18 : 22} /> : icon}
      </div>
      <div className="empty-title">{title}</div>
      {body !== undefined && <div className="empty-body">{body}</div>}
      {action !== undefined && <div className="empty-action">{action}</div>}
    </div>
  );
}
