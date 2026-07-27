import { ArticleBody } from "@/components/blog/ArticleBody";
import { CopyBlocks } from "@/components/CopyBlocks";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import { blogPosts, getPostBySlug, getSortedPosts } from "@/data/blog";
import { formatPostDate } from "@/lib/date";
import { toJsonLd } from "@/lib/jsonld";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

const SITE_URL = "https://ctxfile.dev";

export function generateStaticParams(): { slug: string }[] {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  const title = post.metaTitle ?? post.title;
  const description = post.metaDescription ?? post.excerpt;
  const path = `/blog/${slug}`;

  return {
    // `absolute` opts out of any parent title template: article titles are
    // already at the length Google will render, and a brand suffix would push
    // them past it.
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    // A page-level openGraph object replaces the root one rather than merging
    // into it, so siteName has to be repeated here.
    openGraph: {
      title,
      description,
      type: "article",
      url: path,
      siteName: "ctxfile",
      publishedTime: new Date(post.date).toISOString(),
      modifiedTime: new Date(post.date).toISOString(),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const url = `${SITE_URL}/blog/${slug}`;
  const iso = new Date(post.date).toISOString();
  const related = getSortedPosts()
    .filter((p) => p.slug !== slug)
    .slice(0, 3);

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.metaTitle ?? post.title,
    description: post.metaDescription ?? post.excerpt,
    url,
    inLanguage: "en",
    articleSection: post.category,
    ...(post.primaryKeyword ? { keywords: post.primaryKeyword } : {}),
    // Nothing has been revised since publication, so dateModified mirrors
    // datePublished. Bump it when a post is genuinely edited.
    datePublished: iso,
    dateModified: iso,
    author: { "@type": "Organization", name: "ctxfile", url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: "ctxfile",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/brand/logo-mark-256.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLd([articleJsonLd, breadcrumbJsonLd]) }}
      />
      <div className="atmosphere" aria-hidden="true" />
      <SiteNav />

      <div className="wrap post-shell">
        <article className="prose post-article">
          <nav className="post-crumbs" aria-label="Breadcrumb">
            <Link href="/blog">Blog</Link>
            <span aria-hidden="true">/</span>
            <span>{post.category}</span>
          </nav>

          <h1>{post.title}</h1>

          <p className="post-meta">
            <time dateTime={post.date}>{formatPostDate(post.date)}</time>
            <span>{post.readTime}</span>
          </p>

          <p className="lede">{post.excerpt}</p>

          <ArticleBody markdown={post.body} />

          <hr className="post-rule" />

          <aside className="post-related">
            <h2>Keep reading</h2>
            <ul>
              {related.map((r) => (
                <li key={r.slug}>
                  <Link href={`/blog/${r.slug}`}>{r.title}</Link>
                </li>
              ))}
            </ul>
          </aside>
        </article>
      </div>

      <CopyBlocks />
      <SiteFooter />
    </>
  );
}
