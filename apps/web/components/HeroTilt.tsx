"use client";

import { useCallback, useRef } from "react";

/** Perspective tilt that follows the pointer. Disabled for touch and reduced motion. */
export function HeroTilt({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse)").matches) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(1100px) rotateY(${px * 3.2}deg) rotateX(${py * -3.2}deg)`;
  }, []);

  const onLeave = useCallback(() => {
    const el = ref.current;
    if (el) el.style.transform = "perspective(1100px) rotateY(0deg) rotateX(0deg)";
  }, []);

  return (
    <div className="tilt-wrap">
      <div ref={ref} className="tilt" onMouseMove={onMove} onMouseLeave={onLeave}>
        {children}
      </div>
    </div>
  );
}
