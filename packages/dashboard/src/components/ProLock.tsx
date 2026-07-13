import type { ReactNode } from "react";

export interface ProLockProps {
  feature: string;
  pitch: string;
  /** Short per-feature selling points listed under the pitch. */
  bullets?: string[];
  children: ReactNode;
}

/** Locked pro feature: blurred fixture preview behind a gold PRO pill + pitch. */
export function ProLock({ feature, pitch, bullets, children }: ProLockProps) {
  return (
    <div className="pro-lock" data-feature={feature}>
      <div className="pro-lock-preview" aria-hidden="true" data-testid="pro-lock-preview">
        {children}
      </div>
      <div className="pro-lock-sheen" aria-hidden="true" />
      <div className="pro-lock-overlay">
        <span className="pro-pill">PRO</span>
        <p className="pro-lock-pitch">{pitch}</p>
        {bullets !== undefined && bullets.length > 0 && (
          <ul className="pro-lock-bullets">
            {bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
