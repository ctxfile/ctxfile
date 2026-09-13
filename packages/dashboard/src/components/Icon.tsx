import type { SVGProps } from "react";

/**
 * Inline stroke icons (24-unit grid, 1.75 stroke, round joins). Hand-drawn so
 * the dashboard ships no icon font and makes no network request.
 */
export type IconName =
  | "overview"
  | "context"
  | "git"
  | "sessions"
  | "memory"
  | "playbooks"
  | "consult"
  | "settings"
  | "search"
  | "command"
  | "sun"
  | "moon"
  | "copy"
  | "check"
  | "refresh"
  | "close"
  | "chevron-right"
  | "chevron-down"
  | "chevron-left"
  | "lock"
  | "sparkle"
  | "file"
  | "folder"
  | "branch"
  | "commit"
  | "clock"
  | "shield"
  | "alert"
  | "info"
  | "external"
  | "terminal"
  | "trash"
  | "filter"
  | "play"
  | "stop"
  | "arrow-up"
  | "arrow-down"
  | "wrap"
  | "hash"
  | "code"
  | "json"
  | "list"
  | "eye-off"
  | "network"
  | "key"
  | "plus"
  | "minus"
  | "sidebar"
  | "bolt"
  | "globe"
  | "cpu"
  | "notion"
  | "user";

const PATHS: Record<IconName, string> = {
  overview: "M4 13h6V4H4zM14 20h6V4h-6zM4 20h6v-3H4z",
  context: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h4",
  git: "M6 3v12M6 15a3 3 0 1 0 0 6 3 3 0 1 0 0-6zM18 3a3 3 0 1 0 0 6 3 3 0 1 0 0-6zM18 9c0 4-3 4-6 5.5S6 15 6 15",
  sessions: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM12 7v5l3 2",
  memory: "M4 6h16v4H4zM4 14h16v4H4zM8 8h.01M8 16h.01",
  playbooks: "M6 4l13 8-13 8z",
  consult: "M4 6h10a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3H9l-4 3v-3a3 3 0 0 1-1-2V9a3 3 0 0 1 0-3zM17 10h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2v3l-3-3",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 1 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14zM20 20l-4-4",
  command:
    "M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  copy: "M9 9h10v11H9zM5 15V4h10",
  check: "M5 12l5 5L20 7",
  refresh: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  close: "M6 6l12 12M18 6L6 18",
  "chevron-right": "M9 6l6 6-6 6",
  "chevron-down": "M6 9l6 6 6-6",
  "chevron-left": "M15 6l-6 6 6 6",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  folder: "M3 6h6l2 2h10v11H3z",
  branch: "M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 1 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 1 0 0 6zM18 9a9 9 0 0 1-9 9",
  commit: "M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM2 12h6M16 12h6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM12 7v5l3 2",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  alert: "M12 3l10 18H2zM12 10v4M12 17.5h.01",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM12 11v5M12 8h.01",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  terminal: "M4 5h16v14H4zM8 9l3 3-3 3M13 15h4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6",
  filter: "M3 5h18l-7 8v6l-4-2v-4z",
  play: "M7 4l12 8-12 8z",
  stop: "M6 6h12v12H6z",
  "arrow-up": "M12 20V4M5 11l7-7 7 7",
  "arrow-down": "M12 4v16M5 13l7 7 7-7",
  wrap: "M4 6h16M4 12h11a3 3 0 0 1 0 6h-3M4 18h5M12 15l-3 3 3 3",
  hash: "M5 9h14M5 15h14M10 3L8 21M16 3l-2 18",
  code: "M8 6l-6 6 6 6M16 6l6 6-6 6M14 4l-4 16",
  json: "M8 4a3 3 0 0 0-3 3v2a3 3 0 0 1-2 3 3 3 0 0 1 2 3v2a3 3 0 0 0 3 3M16 4a3 3 0 0 1 3 3v2a3 3 0 0 0 2 3 3 3 0 0 0-2 3v2a3 3 0 0 1-3 3",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  "eye-off": "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10 10 0 0 1 12 5c5 0 9 4 10 7a11 11 0 0 1-2.5 3.6M6.6 6.6C4.3 8 2.8 10 2 12c1 3 5 7 10 7 1.4 0 2.7-.3 3.9-.8",
  network: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  key: "M15 3a6 6 0 1 0-5.6 8.2L3 17.6V21h3.4l6.4-6.4A6 6 0 0 0 15 3zM15 9h.01",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  sidebar: "M3 5h18v14H3zM9 5v14",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  cpu: "M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4",
  notion: "M5 4h11l3 3v13H5zM9 16V8l6 8V8",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 1 0 0 8zM4 21a8 8 0 0 1 16 0",
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className !== undefined ? `icon ${className}` : "icon"}
      data-icon={name}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Brand chip: the orange square with the document glyph. */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#f55300" />
      <path
        d="M11 8.5h7l3.5 3.5v11.5h-10.5z"
        fill="none"
        stroke="#1c0b02"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M18 8.5v3.5h3.5" fill="none" stroke="#1c0b02" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="16" cy="18" r="2.1" fill="#1c0b02" />
    </svg>
  );
}

/** Icon for a session source / connector name. */
export function sourceIcon(source: string): IconName {
  const s = source.toLowerCase();
  if (s.includes("claude")) return "sparkle";
  if (s.includes("cursor")) return "code";
  if (s.includes("codex") || s.includes("openai")) return "cpu";
  if (s.includes("gemini")) return "bolt";
  if (s.includes("notion")) return "notion";
  if (s.includes("git")) return "branch";
  if (s.includes("file")) return "file";
  if (s.includes("ollama")) return "cpu";
  if (s.includes("session")) return "sessions";
  return "terminal";
}
