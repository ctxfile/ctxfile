import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import { getSortedPosts } from "@/data/blog";
import { formatPostDate } from "@/lib/date";
import { toJsonLd } from "@/lib/jsonld";
import type { Metadata } from "next";
import Link from "next/link";

const SITE_URL = "https://ctxfile.dev";

export const metadata: Metadata = {
  title: "Blog: ctxfile",
  description:
    "Guides on carrying project context between AI coding agents: Claude Code, Cursor, Codex CLI, Obsidian vaults, and building local-first MCP servers.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Blog: ctxfile",
    description: "Guides on carrying project context between AI coding agents.",
    type: "website",
    url: "/blog",
    siteName: "ctxfile",
  },
};

export default function BlogIndex() {
  const posts = getSortedPosts();

  // A Blog + itemList so the index itself is eligible to surface, not only the
  // individual posts.
  const listJsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "ctxfile blog",
    url: `${SITE_URL}/blog`,
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.metaTitle ?? post.title,
      description: post.metaDescription ?? post.excerpt,
      datePublished: post.date,
      url: `${SITE_URL}/blog/${post.slug}`,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(listJsonLd) }} />
      <div className="atmosphere" aria-hidden="true" />
      <SiteNav />

      <main className="wrap blog-index">
        <header className="blog-index-head">
          <p className="eyebrow">Blog</p>
          <h1>Making context travel.</h1>
          <p className="blog-index-sub">
            Practical guides on moving your working state between AI agents, connecting the tools you
            already use, and building local-first MCP servers.
          </p>
        </header>

        <ul className="blog-list">
          {posts.map((post) => (
            <li key={post.slug} className="blog-card">
              <p className="blog-card-meta">
                <span className="blog-card-cat">{post.category}</span>
                <time dateTime={post.date}>{formatPostDate(post.date)}</time>
                <span>{post.readTime}</span>
              </p>
              <h2>
                <Link href={`/blog/${post.slug}`}>{post.title}</Link>
              </h2>
              <p className="blog-card-excerpt">{post.excerpt}</p>
              <Link className="blog-card-more" href={`/blog/${post.slug}`}>
                Read →
              </Link>
            </li>
          ))}
        </ul>
      </main>

      <SiteFooter />
    </>
  );
}
