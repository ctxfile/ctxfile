import { useId, useState } from "react";
import { formatCompact, formatDateTime } from "../lib/format";

export interface SparkPoint {
  at: number;
  value: number;
}

export interface SparklineProps {
  points: readonly SparkPoint[];
  /** Horizontal reference (e.g. token budget) drawn as a dashed line. */
  reference?: number;
  height?: number;
  ariaLabel: string;
  unit?: string;
}

/**
 * Responsive SVG area chart with a hover crosshair. Scales to any number of
 * points (it's just a path), so a long snapshot history stays legible.
 */
export function Sparkline({ points, reference, height = 120, ariaLabel, unit = "tokens" }: SparklineProps) {
  const gradId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const width = 600;
  const padX = 6;
  const padY = 10;

  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  const max = Math.max(1, ...values, reference ?? 0);
  const min = 0;
  const n = points.length;
  const x = (i: number): number => (n === 1 ? width / 2 : padX + (i / (n - 1)) * (width - padX * 2));
  const y = (v: number): number => height - padY - ((v - min) / (max - min)) * (height - padY * 2);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)} ${height - padY} L${x(0).toFixed(1)} ${height - padY} Z`;
  const hoverPoint = hover !== null ? points[hover] : undefined;

  return (
    <div className="spark" role="img" aria-label={ariaLabel}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="spark-svg"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const rel = ((event.clientX - rect.left) / rect.width) * width;
          let best = 0;
          let bestDist = Number.POSITIVE_INFINITY;
          for (let i = 0; i < n; i++) {
            const d = Math.abs(x(i) - rel);
            if (d < bestDist) {
              best = i;
              bestDist = d;
            }
          }
          setHover(best);
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {reference !== undefined && reference > 0 && (
          <line
            x1={padX}
            x2={width - padX}
            y1={y(Math.min(reference, max))}
            y2={y(Math.min(reference, max))}
            className="spark-ref"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} className="spark-line" vectorEffect="non-scaling-stroke" />
        {hoverPoint !== undefined && hover !== null && (
          <g className="spark-hover">
            <line x1={x(hover)} x2={x(hover)} y1={padY / 2} y2={height - padY / 2} vectorEffect="non-scaling-stroke" />
            <circle cx={x(hover)} cy={y(hoverPoint.value)} r={4} vectorEffect="non-scaling-stroke" />
          </g>
        )}
        {n === 1 && <circle cx={x(0)} cy={y(points[0]?.value ?? 0)} r={4} className="spark-dot" />}
      </svg>
      <div className="spark-caption num" aria-hidden="true">
        {hoverPoint !== undefined ? (
          <>
            <span className="spark-value">
              {hoverPoint.value.toLocaleString()} {unit}
            </span>
            <span className="spark-when">{formatDateTime(hoverPoint.at)}</span>
          </>
        ) : (
          <>
            <span className="spark-value">
              {formatCompact(values[values.length - 1] ?? 0)} {unit} latest
            </span>
            <span className="spark-when">
              {n} snapshot{n === 1 ? "" : "s"} · peak {formatCompact(Math.max(...values))}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
