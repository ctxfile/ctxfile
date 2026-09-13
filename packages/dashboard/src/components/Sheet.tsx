import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

export interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Visual tone of the title area (danger for destructive confirms). */
  tone?: "neutral" | "danger";
  size?: "sm" | "md";
}

/** Modal dialog with a glass backdrop; Escape and the scrim close it. */
export function Sheet({ title, onClose, children, tone = "neutral", size = "sm" }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "Tab" && panelRef.current !== null) {
        // Keep focus inside the dialog.
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (first === undefined || last === undefined) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    const firstButton = panelRef.current?.querySelector<HTMLElement>(".sheet-actions button:last-child, button");
    (firstButton ?? panelRef.current)?.focus();
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className={`sheet-panel sheet-${size} sheet-${tone}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-head">
          <div className="sheet-title">
            {tone === "danger" && <Icon name="alert" size={16} className="sheet-title-icon" />}
            {title}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
