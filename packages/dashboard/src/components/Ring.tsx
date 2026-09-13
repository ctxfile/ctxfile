import type { ReactNode } from "react";

export interface RingProps {
  /** 0..1 (values above 1 clamp the arc and flip the tone to error). */
  ratio: number;
  size?: number;
  stroke?: number;
  tone?: "accent" | "ok" | "warn" | "err";
  children?: ReactNode;
  ariaLabel: string;
}

/** Circular progress gauge with a centre slot for a readout. */
export function Ring({ ratio, size = 132, stroke = 9, tone, children, ariaLabel }: RingProps) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const resolved: NonNullable<RingProps["tone"]> =
    tone ?? (ratio > 1 ? "err" : ratio > 0.85 ? "warn" : "accent");
  return (
    <div
      className={`ring ring-${resolved}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
