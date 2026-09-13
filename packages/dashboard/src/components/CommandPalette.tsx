import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fuzzyMatch } from "../lib/fuzzy";
import { Icon, type IconName } from "./Icon";

export interface PaletteCommand {
  id: string;
  label: string;
  /** Right-aligned hint: a shortcut or a tag such as "pro". */
  hint?: string;
  group?: string;
  icon?: IconName;
  /** Extra words that should match but are not displayed. */
  keywords?: string;
  run: () => void;
}

export interface CommandPaletteProps {
  commands: PaletteCommand[];
  onClose: () => void;
}

function Highlighted({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>;
  const set = new Set(indices);
  const out: ReactNode[] = [];
  let buf = "";
  let mode: boolean | null = null;
  const flush = (): void => {
    if (buf === "") return;
    out.push(mode ? <mark key={out.length}>{buf}</mark> : buf);
    buf = "";
  };
  for (let i = 0; i < text.length; i++) {
    const hit = set.has(i);
    if (mode !== null && hit !== mode) flush();
    mode = hit;
    buf += text[i];
  }
  flush();
  return <>{out}</>;
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim();
    const scored = commands
      .map((c) => ({ command: c, match: fuzzyMatch(q, `${c.label} ${c.keywords ?? ""}`) }))
      .filter((e): e is { command: PaletteCommand; match: NonNullable<ReturnType<typeof fuzzyMatch>> } => e.match !== null);
    if (q !== "") scored.sort((a, b) => b.match.score - a.match.score);
    return scored.map((e) => ({
      command: e.command,
      indices: e.match.indices.filter((i) => i < e.command.label.length),
    }));
  }, [commands, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const run = (entry: { command: PaletteCommand } | undefined): void => {
    if (!entry) return;
    onClose();
    entry.command.run();
  };

  // Group headers only when not searching (ranking would interleave groups).
  const grouped = query.trim() === "";
  let lastGroup: string | undefined;

  return (
    <div className="sheet-backdrop palette-backdrop" onClick={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="palette-input-row">
          <Icon name="search" size={16} className="palette-search-icon" />
          <input
            ref={inputRef}
            className="palette-input"
            type="text"
            placeholder="Jump to a view, run a snapshot, switch theme…"
            aria-label="Search commands"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              else if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((c) => Math.min(c + 1, filtered.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                run(filtered[cursor]);
              }
            }}
          />
          <kbd className="palette-esc">esc</kbd>
        </div>
        <ul ref={listRef} className="palette-list" role="listbox" aria-label="Commands">
          {filtered.length === 0 && <li className="palette-empty">No matching commands</li>}
          {filtered.map((entry, index) => {
            const header =
              grouped && entry.command.group !== undefined && entry.command.group !== lastGroup ? (
                <li key={`g-${entry.command.group}`} className="palette-group" aria-hidden="true">
                  {entry.command.group}
                </li>
              ) : null;
            lastGroup = entry.command.group;
            return (
              <Fragment key={entry.command.id}>
                {header}
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === cursor}
                    className={`palette-item${index === cursor ? " palette-cursor" : ""}`}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => run(entry)}
                  >
                    <span className="palette-item-icon">
                      <Icon name={entry.command.icon ?? "chevron-right"} size={15} />
                    </span>
                    <span className="palette-item-label">
                      <Highlighted text={entry.command.label} indices={entry.indices} />
                    </span>
                    {entry.command.hint !== undefined && (
                      <kbd className={`palette-hint${entry.command.hint === "pro" ? " palette-hint-pro" : ""}`}>
                        {entry.command.hint}
                      </kbd>
                    )}
                  </button>
                </li>
              </Fragment>
            );
          })}
        </ul>
        <div className="palette-footer" aria-hidden="true">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> run
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

