"use client";

import { useEffect, useRef } from "react";

/** Scroll-reveal wrapper: children rise+fade in when entering the viewport. */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  as?: "div" | "section";
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const show = (): void => {
      el.dataset.revealed = "true";
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      show();
      return;
    }
    // Already within (or above) the fold, e.g. the page loaded mid-scroll: no observer needed.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) {
      show();
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        reveal();
      }
    });
    // Fast anchor jumps (nav #links, End key) can cross an element between
    // observer ticks and never intersect it; the scroll fallback catches those.
    const onScroll = (): void => {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.98) reveal();
    };
    function reveal(): void {
      show();
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    }
    io.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <Tag ref={ref} className="reveal" style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}
