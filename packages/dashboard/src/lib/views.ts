export type ViewId =
  | "overview"
  | "context"
  | "git"
  | "sessions"
  | "memory"
  | "playbooks"
  | "consult"
  | "settings";

export interface ViewDef {
  id: ViewId;
  label: string;
  /** Compact glyph shown in the nav rail. */
  glyph: string;
  pro?: boolean;
}

export const VIEWS: readonly ViewDef[] = [
  { id: "overview", label: "Overview", glyph: "◉" },
  { id: "context", label: "Context", glyph: "❐" },
  { id: "git", label: "Git", glyph: "⎇" },
  { id: "sessions", label: "Sessions", glyph: "◷", pro: true },
  { id: "memory", label: "Memory", glyph: "▤", pro: true },
  { id: "playbooks", label: "Playbooks", glyph: "▶", pro: true },
  { id: "consult", label: "Consult", glyph: "⇄", pro: true },
  { id: "settings", label: "Settings", glyph: "⚙" },
];
