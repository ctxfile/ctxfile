import { useEffect, useRef, type ReactNode } from "react";

export interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Modal dialog with glass backdrop, used for confirms; Escape closes. */
export function Sheet({ title, onClose, children }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-title">{title}</div>
        {children}
      </div>
    </div>
  );
}
