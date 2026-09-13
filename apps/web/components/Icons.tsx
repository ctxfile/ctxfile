/**
 * Inline icon set, 24x24 stroke glyphs at 1.6px. Kept tiny and local so the
 * site ships no icon font and no third-party asset.
 */

export type IconName =
  | "shield"
  | "exchange"
  | "cloud-up"
  | "wave"
  | "tag"
  | "file"
  | "blind"
  | "island"
  | "lock"
  | "github"
  | "menu"
  | "close"
  | "sun"
  | "moon"
  | "plus"
  | "arrow";

const PATHS: Record<IconName, React.ReactNode> = {
  shield: (
    <>
      <path d="M12 3 4.5 6v5.2c0 4.6 3.2 8.4 7.5 9.8 4.3-1.4 7.5-5.2 7.5-9.8V6L12 3Z" />
      <path d="m9.2 12 1.9 1.9 3.7-3.8" />
    </>
  ),
  exchange: (
    <>
      <path d="M4 8h13m0 0-3-3m3 3-3 3" />
      <path d="M20 16H7m0 0 3-3m-3 3 3 3" />
    </>
  ),
  "cloud-up": (
    <>
      <path d="M7 18a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9H7Z" />
      <path d="M12 16v-5m0 0-2.5 2.5M12 11l2.5 2.5" />
    </>
  ),
  wave: (
    <>
      <path d="M3 12c2 0 2.5-4 4.5-4S9.5 16 12 16s2.5-8 4.5-8 2.5 4 4.5 4" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.5 12 4h7.5V11.5L11 20 3.5 12.5Z" />
      <circle cx="15.5" cy="8.5" r="1.3" />
    </>
  ),
  file: (
    <>
      <path d="M7 3.5h7l4 4V20.5H7z" />
      <path d="M14 3.5v4h4" />
      <path d="M9.5 12.5h5M9.5 16h5" />
    </>
  ),
  blind: (
    <>
      <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
      <path d="m4 4 16 16" />
    </>
  ),
  island: (
    <>
      <circle cx="7" cy="8" r="3" />
      <circle cx="17" cy="16" r="3" />
      <path d="M9.5 9.5 14.5 14.5" strokeDasharray="1.5 2.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <circle cx="12" cy="15.5" r="1.2" />
    </>
  ),
  github: (
    <path
      fill="currentColor"
      stroke="none"
      d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.84c.85 0 1.7.11 2.5.34 1.9-1.29 2.74-1.02 2.74-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
    />
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12M18 6 6 18" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6" />
    </>
  ),
  moon: (
    <>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14m0 0-5-5m5 5-5 5" />
    </>
  ),
};

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
