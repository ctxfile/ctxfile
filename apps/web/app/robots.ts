import type { MetadataRoute } from "next";

// Explicitly crawler- and AI-friendly: ctxfile WANTS to be read, indexed, and
// cited by search engines and generative engines alike. Shipping our own
// robots.txt also displaces Cloudflare's injected content-signals default,
// whose reservations would discourage exactly the AI crawlers we welcome.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: "https://ctxfile.dev/sitemap.xml",
  };
}

export const dynamic = "force-static";
