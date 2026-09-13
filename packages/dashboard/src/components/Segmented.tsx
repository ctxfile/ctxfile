import { useLayoutEffect, useRef, useState } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional trailing count/badge. */
  badge?: string | number;
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
}

/** Segmented control with a sliding thumb; tabs semantics for a11y. */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel, size = "md" }: SegmentedProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (root === null) return;
    const active = root.querySelector<HTMLElement>('[aria-selected="true"]');
    if (active === null) return;
    setThumb({ left: active.offsetLeft, width: active.offsetWidth });
  }, [value, options]);

  return (
    <div ref={ref} className={`segmented segmented-${size}`} role="tablist" aria-label={ariaLabel}>
      {thumb !== null && (
        <span className="segmented-thumb" style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width }} />
      )}
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={opt.value === value}
          className="segmented-item"
          onClick={() => onChange(opt.value)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
            event.preventDefault();
            const idx = options.findIndex((o) => o.value === value);
            const next = options[(idx + (event.key === "ArrowRight" ? 1 : options.length - 1)) % options.length];
            if (next !== undefined) onChange(next.value);
          }}
        >
          {opt.label}
          {opt.badge !== undefined && <span className="segmented-badge num">{opt.badge}</span>}
        </button>
      ))}
    </div>
  );
}
