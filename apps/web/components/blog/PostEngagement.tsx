"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

/**
 * Two anonymous counters per post, so the blog can be judged on more than
 * page views: "Post read" fires once when the reader reaches the end of the
 * article, and "Post CTA" fires when a link inside the article leads to the
 * demo, the docs, or the install path. Both carry only the post slug.
 */
export function PostEngagement({ slug }: { slug: string }) {
  useEffect(() => {
    const article = document.querySelector<HTMLElement>(".post-article");
    if (article === null) return;

    const end = article.querySelector<HTMLElement>(".post-rule") ?? article;
    let readSent = false;
    const io = new IntersectionObserver((entries) => {
      if (readSent || !entries.some((e) => e.isIntersecting)) return;
      readSent = true;
      track("Post read", { post: slug });
      io.disconnect();
    });
    io.observe(end);

    const onClick = (event: MouseEvent): void => {
      const target = event.target instanceof Element ? event.target.closest("a") : null;
      if (target === null) return;
      const href = target.getAttribute("href") ?? "";
      if (/^\/(demo|docs|pricing)/.test(href) || href.startsWith("/#install")) {
        track("Post CTA", { post: slug });
      }
    };
    article.addEventListener("click", onClick);

    return () => {
      io.disconnect();
      article.removeEventListener("click", onClick);
    };
  }, [slug]);

  return null;
}
