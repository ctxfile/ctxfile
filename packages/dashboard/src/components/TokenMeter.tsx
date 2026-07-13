import type { CSSProperties } from "react";

export interface TokenMeterProps {
  tokensUsed: number;
  tokenBudget: number;
}

export function TokenMeter({ tokensUsed, tokenBudget }: TokenMeterProps) {
  const ratio = tokenBudget > 0 ? tokensUsed / tokenBudget : 0;
  const pct = Math.min(100, Math.max(0, ratio * 100));
  const over = ratio > 1;
  /* --pct mirrors the width so the CSS meter scale stays track-relative. */
  const fillStyle = { width: `${pct}%`, "--pct": `${pct}` } as CSSProperties;
  return (
    <div className="token-meter">
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
      </div>
      <div className="token-meter-caption num">
        <span>{tokensUsed.toLocaleString()}</span>
        <span className="token-meter-budget"> / {tokenBudget.toLocaleString()} tokens</span>
        {over && <span className="token-meter-flag"> over budget</span>}
      </div>
    </div>
  );
}
