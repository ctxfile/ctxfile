"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Progressive enhancement: gives every `.prose pre` a copy key.
 * The text is captured before the button is injected, so the button's own
 * label never contaminates the clipboard. Re-runs on client-side navigation;
 * blocks that already have a key are skipped.
 */
export function CopyBlocks() {
  const pathname = usePathname();

  useEffect(() => {
    const blocks = document.querySelectorAll<HTMLPreElement>(".prose pre");
    for (const pre of blocks) {
      if (pre.querySelector(".pre-copy")) continue;
      const text = pre.innerText.replace(/\n$/, "");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pre-copy";
      button.textContent = "copy";
      button.setAttribute("aria-label", "Copy to clipboard");
      button.addEventListener("click", () => {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            button.dataset["copied"] = "true";
            button.textContent = "copied";
            setTimeout(() => {
              delete button.dataset["copied"];
              button.textContent = "copy";
            }, 1500);
          })
          .catch(() => {
            /* clipboard unavailable; the text stays selectable */
          });
      });
      pre.appendChild(button);
    }
  }, [pathname]);

  return null;
}
