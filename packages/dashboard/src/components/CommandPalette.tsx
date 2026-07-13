import { useEffect, useMemo, useRef, useState } from "react";

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export interface CommandPaletteProps {
  commands: PaletteCommand[];
  onClose: () => void;
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  const run = (command: PaletteCommand | undefined): void => {
    if (!command) return;
    onClose();
    command.run();
  };

  return (
    <div className="sheet-backdrop palette-backdrop" onClick={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          placeholder="Type a command…"
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
        <ul className="palette-list" role="listbox" aria-label="Commands">
          {filtered.length === 0 && <li className="palette-empty">No matching commands</li>}
          {filtered.map((command, index) => (
            <li key={command.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === cursor}
                className={`palette-item${index === cursor ? " palette-cursor" : ""}`}
                onMouseEnter={() => setCursor(index)}
                onClick={() => run(command)}
              >
                <span>{command.label}</span>
                {command.hint !== undefined && (
                  <kbd className="palette-hint">{command.hint}</kbd>
                )}
              </button>
            </li>
          ))}
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
