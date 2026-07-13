import type { ReactNode } from "react";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "accent" | "warn" | "redact";
}

export function StatCard({ label, value, sub, tone = "default" }: StatCardProps) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-screen">
        <div className="stat-value num">{value}</div>
        {sub !== undefined && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
}
