import type { ProFeatures } from "./types";

export type ViewId =
  | "overview"
  | "context"
  | "git"
  | "sessions"
  | "memory"
  | "playbooks"
  | "consult"
  | "settings";

export type ViewGroup = "workspace" | "pro" | "system";

export interface ViewDef {
  id: ViewId;
  label: string;
  /** One-line description shown in the palette and on hover. */
  description: string;
  group: ViewGroup;
  /** Digit shortcut (pressed without modifiers). */
  shortcut: string;
  /** Which Pro feature flag unlocks the view, if any. */
  pro?: keyof ProFeatures;
}

export const VIEWS: readonly ViewDef[] = [
  { id: "overview", label: "Overview", description: "Snapshot health, connectors, token budget", group: "workspace", shortcut: "1" },
  { id: "context", label: "Context", description: "Browse the captured ContextObject", group: "workspace", shortcut: "2" },
  { id: "git", label: "Git", description: "Branch, changes, commits, diff summary", group: "workspace", shortcut: "3" },
  { id: "sessions", label: "Sessions", description: "Agent session digests, redacted", group: "pro", shortcut: "4", pro: "sessions" },
  { id: "memory", label: "Memory", description: "Encrypted cross-session memory", group: "pro", shortcut: "5", pro: "memory" },
  { id: "playbooks", label: "Playbooks", description: "Reusable prompts distilled from sessions", group: "pro", shortcut: "6", pro: "memory" },
  { id: "consult", label: "Consult", description: "Ask several providers over live context", group: "pro", shortcut: "7", pro: "consult" },
  { id: "settings", label: "Settings", description: "Configuration, license, privacy", group: "system", shortcut: "8" },
];

export const VIEW_IDS: readonly ViewId[] = VIEWS.map((v) => v.id);

export function isViewId(value: string): value is ViewId {
  return (VIEW_IDS as readonly string[]).includes(value);
}

export function viewDef(id: ViewId): ViewDef {
  const def = VIEWS.find((v) => v.id === id);
  if (def === undefined) throw new Error(`unknown view ${id}`);
  return def;
}

/** True when the view is gated behind a Pro feature the license does not include. */
export function isLocked(view: ViewDef, features: ProFeatures): boolean {
  return view.pro !== undefined && !features[view.pro];
}

/** Read the view from the URL hash (`#/context`), defaulting to overview. */
export function viewFromHash(hash: string): ViewId {
  const m = /^#\/?([a-z]+)/.exec(hash);
  const candidate = m?.[1] ?? "";
  return isViewId(candidate) ? candidate : "overview";
}

export function hashForView(view: ViewId): string {
  return `#/${view}`;
}
