"use client";

import { useCallback } from "react";

/**
 * Cursor-tracking spotlight: children with class "spot" get --mx/--my custom
 * properties while the pointer moves over the grid, powering a radial
 * highlight that follows the cursor across card borders.
 */
export function SpotlightGrid({ className, children }: { className: string; children: React.ReactNode }) {
  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    for (const card of e.currentTarget.querySelectorAll<HTMLElement>(".spot")) {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - rect.left}px`);
      card.style.setProperty("--my", `${e.clientY - rect.top}px`);
    }
  }, []);

  return (
    <div className={className} onMouseMove={onMove}>
      {children}
    </div>
  );
}
