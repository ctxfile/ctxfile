"use client";

/**
 * Markup is static (a flick switch whose knob position comes from CSS via
 * [data-theme]), so there is no hydration mismatch and no state needed.
 * The no-flash script in layout.tsx owns the initial value.
 */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try {
      localStorage.setItem("cb-theme", next);
    } catch {
      // Storage unavailable (private mode). Theme still switches for this page.
    }
  }

  return (
    <button className="theme-toggle" onClick={toggle} aria-label="Toggle color theme" title="Toggle color theme">
      <span className="switch" aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </button>
  );
}
