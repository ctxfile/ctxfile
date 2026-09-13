/** Display helpers shared between the shell chrome and views. */

export function formatAge(ms: number): string {
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

/** Relative time for an ISO/epoch timestamp; falls back to "unknown" when unparsable. */
export function formatRelative(value: string | number | null | undefined, now = Date.now()): string {
  if (value === null || value === undefined) return "unknown";
  const ts = typeof value === "number" ? value : Date.parse(value);
  if (Number.isNaN(ts)) return "unknown";
  const delta = now - ts;
  if (delta < 0) return "just now";
  return formatAge(delta);
}

/** Compact token counts: 950 → "950", 18 432 → "18.4k", 1 250 000 → "1.25M". */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs < 1000) return n.toLocaleString();
  if (abs < 10_000) return `${(n / 1000).toFixed(2).replace(/\.?0+$/, "")}k`;
  if (abs < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
}

/** Duration in ms → "12ms", "1.4s", "2m 05s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

/** Locale date+time, short form, for tooltips and meta rows. */
export function formatDateTime(value: string | number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Calendar day label used to group timelines ("Today", "Yesterday", or a date). */
export function formatDayLabel(value: string | number, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const startOf = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Middle-truncates long paths so head and tail both stay readable. */
export function truncateMiddle(value: string, max = 48): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) / 2);
  const tail = max - 1 - head;
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

/** Splits a path into directory and basename for two-tone rendering. */
export function splitPath(path: string): { dir: string; base: string } {
  const idx = path.lastIndexOf("/");
  if (idx === -1) return { dir: "", base: path };
  return { dir: path.slice(0, idx + 1), base: path.slice(idx + 1) };
}

/** Two-letter initials for avatars ("claude-code" → "CC", "Ada Lovelace" → "AL"). */
export function initials(name: string): string {
  const parts = name
    .split(/[\s\-_./]+/)
    .filter((p) => p.length > 0)
    .slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => (p[0] ?? "").toUpperCase()).join("");
}

/** Percentage, clamped to [0, 100] and rounded. */
export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}
