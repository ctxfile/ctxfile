import type { ReactNode } from "react";
import { Icon } from "./Icon";

export interface ProLockProps {
  feature: string;
  pitch: string;
  /** Short per-feature selling points listed under the pitch. */
  bullets?: string[];
  children: ReactNode;
}

const PRICING_URL = "https://ctxfile.dev/pricing";

/** Locked Pro feature: a blurred fixture preview behind a glass card with the pitch. */
export function ProLock({ feature, pitch, bullets, children }: ProLockProps) {
  return (
    <div className="pro-lock" data-feature={feature}>
      <div className="pro-lock-preview" aria-hidden="true" data-testid="pro-lock-preview">
        {children}
      </div>
      <div className="pro-lock-sheen" aria-hidden="true" />
      <div className="pro-lock-overlay">
        <div className="pro-lock-card">
          <div className="pro-lock-head">
            <span className="pro-pill">PRO</span>
            <span className="pro-lock-feature">{feature}</span>
          </div>
          <p className="pro-lock-pitch">{pitch}</p>
          {bullets !== undefined && bullets.length > 0 && (
            <ul className="pro-lock-bullets">
              {bullets.map((bullet) => (
                <li key={bullet}>
                  <Icon name="check" size={13} />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="pro-lock-actions">
            <a className="btn btn-pro" href={PRICING_URL} target="_blank" rel="noopener noreferrer">
              See Pro
              <Icon name="external" size={13} />
            </a>
            <span className="pro-lock-note">Activate a key in Settings once you have one.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
