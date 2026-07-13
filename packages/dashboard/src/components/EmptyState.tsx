import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  /** Glyph shown in the bordered circle above the title. */
  icon?: ReactNode;
}

export function EmptyState({ title, body, action, icon = "◇" }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">
        {icon}
      </div>
      <div className="empty-title">{title}</div>
      {body !== undefined && <div className="empty-body">{body}</div>}
      {action !== undefined && <div className="empty-action">{action}</div>}
    </div>
  );
}
