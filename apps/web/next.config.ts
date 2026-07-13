import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static marketing + docs site — export to plain HTML/CSS/JS so it can
  // be served from any static host (Cloudflare Pages). No server runtime.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
