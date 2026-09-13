import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "accent" | "warn" | "redact" | "ok";
  icon?: IconName;
  /** Optional 0..1 progress shown as a thin bar under the value. */
  progress?: number;
}

export function StatCard({ label, value, sub, tone = "default", icon, progress }: StatCardProps) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <div className="stat-head">
        <span className="stat-label">{label}</span>
        {icon !== undefined && <Icon name={icon} size={14} className="stat-icon" />}
      </div>
      <div className="stat-screen">
        <div className="stat-value num">{value}</div>
        {sub !== undefined && <div className="stat-sub">{sub}</div>}
      </div>
      {progress !== undefined && (
        <div className="stat-progress" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }} />
        </div>
      )}
    </div>
  );
}
