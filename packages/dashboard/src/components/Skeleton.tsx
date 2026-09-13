export interface SkeletonProps {
  /** Number of shimmer lines. */
  lines?: number;
  /** Render as a card-height block instead of text lines. */
  block?: boolean;
  className?: string;
}

/** Loading placeholder that keeps layout stable while data arrives. */
export function Skeleton({ lines = 3, block = false, className }: SkeletonProps) {
  if (block) {
    return <div className={`skeleton skeleton-block${className !== undefined ? ` ${className}` : ""}`} aria-hidden="true" />;
  }
  return (
    <div className={`skeleton-lines${className !== undefined ? ` ${className}` : ""}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton skeleton-line" style={{ width: `${100 - ((i * 23) % 45)}%` }} />
      ))}
    </div>
  );
}

/** A page-level skeleton: header bar + panels. */
export function ViewSkeleton({ title }: { title: string }) {
  return (
    <div className="view" aria-busy="true" aria-label={`Loading ${title}`}>
      <header className="view-header">
        <div>
          <h1>{title}</h1>
        </div>
      </header>
      <div className="panel">
        <Skeleton lines={4} />
      </div>
      <div className="grid-2">
        <div className="panel">
          <Skeleton lines={3} />
        </div>
        <div className="panel">
          <Skeleton lines={3} />
        </div>
      </div>
    </div>
  );
}
