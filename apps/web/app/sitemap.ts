import { getSortedPosts } from "@/data/blog";
import type { MetadataRoute } from "next";

const BASE = "https://ctxfile.dev";

// Every route the static export produces, hand-listed so nothing ships
// unindexed by accident. Keep in lockstep with app/ when adding pages
// (the release checklist's "docs ship with features" step covers this).
const ROUTES: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/pricing", priority: 0.9 },
  { path: "/docs", priority: 0.9 },
  { path: "/docs/clients", priority: 0.8 },
  { path: "/docs/webchat", priority: 0.8 },
  { path: "/docs/local-models", priority: 0.8 },
  { path: "/docs/playbooks", priority: 0.8 },
  { path: "/docs/threads", priority: 0.7 },
  { path: "/docs/sync", priority: 0.7 },
  { path: "/docs/cli", priority: 0.6 },
  { path: "/docs/mcp", priority: 0.6 },
  { path: "/docs/configuration", priority: 0.6 },
  { path: "/docs/connectors", priority: 0.6 },
  { path: "/docs/automatic", priority: 0.6 },
  { path: "/docs/ingest", priority: 0.6 },
  { path: "/docs/dashboard", priority: 0.6 },
  { path: "/docs/export", priority: 0.6 },
  { path: "/docs/privacy", priority: 0.7 },
  { path: "/docs/pro", priority: 0.7 },
  { path: "/convention", priority: 0.7 },
  { path: "/blog", priority: 0.7 },
  { path: "/security", priority: 0.6 },
  { path: "/changelog", priority: 0.5 },
  { path: "/design", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = ROUTES.map((r) => ({
    url: `${BASE}${r.path}`,
    changeFrequency: r.path === "/changelog" ? "weekly" : "monthly",
    priority: r.priority,
  }));

  // Posts are derived rather than hand-listed: the whole point of a blog is
  // that entries get added often, and a sitemap you have to remember to edit
  // is a sitemap that silently goes stale.
  const posts: MetadataRoute.Sitemap = getSortedPosts().map((post) => ({
    url: `${BASE}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...posts];
}

export const dynamic = "force-static";
