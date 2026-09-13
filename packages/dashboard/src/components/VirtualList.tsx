import { useEffect, useRef, useState, type ReactNode } from "react";

export interface VirtualListProps<T> {
  items: readonly T[];
  /** Fixed row height in px; all rows must share it. */
  rowHeight: number;
  /** Rows rendered above/below the viewport. */
  overscan?: number;
  renderRow: (item: T, index: number) => ReactNode;
  itemKey: (item: T, index: number) => string;
  className?: string;
  /** Below this count, render everything (no windowing, simpler DOM). */
  threshold?: number;
  ariaLabel?: string;
  role?: string;
}

/**
 * Minimal fixed-height windowing. Renders only the visible slice so trees
 * with thousands of key files stay smooth. Falls back to a plain list for
 * small inputs so screen readers and find-in-page keep working.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  overscan = 8,
  renderRow,
  itemKey,
  className,
  threshold = 120,
  ariaLabel,
  role = "list",
}: VirtualListProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);
  const windowed = items.length > threshold;

  useEffect(() => {
    if (!windowed) return;
    const el = ref.current;
    if (el === null) return;
    const measure = (): void => setHeight(el.clientHeight);
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [windowed]);

  if (!windowed) {
    return (
      <div ref={ref} className={`vlist${className !== undefined ? ` ${className}` : ""}`} role={role} aria-label={ariaLabel}>
        {items.map((item, i) => (
          <div key={itemKey(item, i)} className="vlist-row" style={{ minHeight: rowHeight }}>
            {renderRow(item, i)}
          </div>
        ))}
      </div>
    );
  }

  const total = items.length * rowHeight;
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const count = Math.ceil((height || 600) / rowHeight) + overscan * 2;
  const last = Math.min(items.length, first + count);

  return (
    <div
      ref={ref}
      className={`vlist vlist-windowed${className !== undefined ? ` ${className}` : ""}`}
      role={role}
      aria-label={ariaLabel}
      aria-rowcount={items.length}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: total, position: "relative" }}>
        {items.slice(first, last).map((item, offset) => {
          const index = first + offset;
          return (
            <div
              key={itemKey(item, index)}
              className="vlist-row"
              style={{ position: "absolute", top: index * rowHeight, height: rowHeight, left: 0, right: 0 }}
            >
              {renderRow(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
