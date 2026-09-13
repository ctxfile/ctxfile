import { ImageResponse } from "next/og";
import { blogPosts, getPostBySlug } from "@/data/blog";

/**
 * One social card per post, rendered at build time so the static export can
 * ship it. Same canvas as the site card, with the post title as the headline
 * and its category as the eyebrow, so a shared link looks like the post and
 * not like the homepage.
 */
export const dynamic = "force-static";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams(): { slug: string }[] {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export default async function PostOpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  const title = post?.title ?? "ctxfile";
  const category = post?.category ?? "Blog";
  const readTime = post?.readTime ?? "";
  // Long titles step down a size so they stay on three lines.
  const fontSize = title.length > 70 ? 54 : title.length > 48 ? 62 : 72;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 96px 64px",
          backgroundColor: "#09090b",
          backgroundImage:
            "radial-gradient(700px 420px at 12% -10%, rgba(255,87,20,0.28), transparent 65%), radial-gradient(600px 400px at 95% 10%, rgba(78,196,230,0.18), transparent 65%), radial-gradient(700px 500px at 60% 120%, rgba(184,146,255,0.14), transparent 65%)",
          color: "#f2f1ed",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                display: "flex",
                width: 56,
                height: 56,
                borderRadius: 14,
                backgroundColor: "#f55300",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 8px 30px rgba(245,83,0,0.35)",
              }}
            >
              <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
                <path d="M11 8.5h7l3.5 3.5v11.5h-10.5z" stroke="#1c0b02" strokeWidth="2" strokeLinejoin="round" />
                <path d="M18 8.5v3.5h3.5" stroke="#1c0b02" strokeWidth="2" strokeLinejoin="round" />
                <circle cx="16" cy="18" r="2.1" fill="#1c0b02" />
              </svg>
            </div>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: "-1px" }}>ctxfile</div>
            <div style={{ display: "flex", fontSize: 26, color: "#6f6e68", marginLeft: 6 }}>/ blog</div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 16px",
              borderRadius: 999,
              border: "1px solid rgba(255,87,20,0.45)",
              backgroundColor: "rgba(255,87,20,0.12)",
              fontSize: 22,
              color: "#ff9a6b",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            <div style={{ display: "flex", width: 8, height: 8, borderRadius: 4, backgroundColor: "#ff5714" }} />
            {category}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize,
            fontWeight: 800,
            letterSpacing: "-2.5px",
            lineHeight: 1.06,
            maxWidth: 1000,
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 24, color: "#a5a49d" }}>
          <div style={{ display: "flex" }}>ctxfile.dev · one context file, every agent, all local</div>
          <div style={{ display: "flex" }}>{readTime}</div>
        </div>
      </div>
    ),
    size
  );
}
