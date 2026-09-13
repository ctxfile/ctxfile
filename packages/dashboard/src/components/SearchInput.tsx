import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  /** Focus the input when `/` is pressed outside another field. */
  slashShortcut?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  slashShortcut = false,
  autoFocus = false,
  className,
}: SearchInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!slashShortcut) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      ref.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [slashShortcut]);

  return (
    <label className={`search${className !== undefined ? ` ${className}` : ""}`}>
      <Icon name="search" className="search-icon" />
      <input
        ref={ref}
        type="search"
        className="search-field"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value !== "") {
            event.stopPropagation();
            onChange("");
          }
        }}
      />
      {value !== "" ? (
        <button type="button" className="search-clear" onClick={() => onChange("")} aria-label="Clear search">
          <Icon name="close" size={12} />
        </button>
      ) : slashShortcut ? (
        <kbd className="search-kbd" aria-hidden="true">
          /
        </kbd>
      ) : null}
    </label>
  );
}
