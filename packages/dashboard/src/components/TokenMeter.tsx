import type { CSSProperties } from "react";

export interface TokenMeterProps {
  tokensUsed: number;
  tokenBudget: number;
  /** Hide the numeric caption (when a parent already shows the numbers). */
  hideCaption?: boolean;
}

export function TokenMeter({ tokensUsed, tokenBudget, hideCaption = false }: TokenMeterProps) {
  const ratio = tokenBudget > 0 ? tokensUsed / tokenBudget : 0;
  const pct = Math.min(100, Math.max(0, ratio * 100));
  const over = ratio > 1;
  const hot = !over && ratio > 0.85;
  /* --pct mirrors the width so the CSS meter scale stays track-relative. */
  const fillStyle = { width: `${pct}%`, "--pct": `${pct}` } as CSSProperties;

  return (
    <div className={`token-meter${over ? " token-meter-is-over" : hot ? " token-meter-is-hot" : ""}`}>
      <div
        className={`token-meter-track${over ? " token-meter-over" : ""}`}
        role="meter"
        aria-label="Token budget usage"
        aria-valuemin={0}
        aria-valuemax={tokenBudget}
        aria-valuenow={tokensUsed}
        aria-valuetext={`${tokensUsed.toLocaleString()} of ${tokenBudget.toLocaleString()} tokens`}
      >
        <div className="token-meter-fill" style={fillStyle} />
        <div className="token-meter-ticks" aria-hidden="true">
          {[25, 50, 75].map((t) => (
            <span key={t} style={{ left: `${t}%` }} />
          ))}
        </div>
      </div>
      {!hideCaption && (
        <div className="token-meter-caption num">
          <span>{tokensUsed.toLocaleString()}</span>
          <span className="token-meter-budget"> / {tokenBudget.toLocaleString()} tokens</span>
          {over && <span className="token-meter-flag"> over budget</span>}
        </div>
      )}
    </div>
  );
}
