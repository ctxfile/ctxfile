import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const archivo = localFont({
  src: "../fonts/archivo-var-latin.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-sans-src",
});

const plexMono = localFont({
  src: [
    { path: "../fonts/plex-mono-400-latin.woff2", weight: "400" },
    { path: "../fonts/plex-mono-500-latin.woff2", weight: "500" },
    { path: "../fonts/plex-mono-600-latin.woff2", weight: "600" },
  ],
  display: "swap",
  variable: "--font-mono-src",
});

const doto = localFont({
  src: "../fonts/doto-var-latin.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-led-src",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://ctxfile.dev"),
  title: "ctxfile: one context, every agent, all local",
  description:
    "Stop re-explaining your project to every AI agent. ctxfile snapshots your working state into one context object any MCP agent loads instantly, and nothing leaves your machine.",
  // "./" resolves per-route against metadataBase: every page gets its own
  // canonical without per-page boilerplate.
  alternates: { canonical: "./" },
  openGraph: {
    siteName: "ctxfile",
    type: "website",
    url: "https://ctxfile.dev",
  },
  twitter: {
    card: "summary_large_image",
  },
};

// Structured data for search and generative engines: the product and the org.
const JSON_LD = JSON.stringify([
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ctxfile",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "macOS, Linux, Windows",
    description:
      "Local-first MCP server that snapshots a project's working state into one context object any AI agent can load. Open-source core; Pro adds session connectors, encrypted memory, consult, and playbooks.",
    url: "https://ctxfile.dev",
    downloadUrl: "https://www.npmjs.com/package/ctxfile",
    softwareHelp: "https://ctxfile.dev/docs",
    license: "https://www.apache.org/licenses/LICENSE-2.0",
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
      { "@type": "Offer", name: "Pro", price: "12", priceCurrency: "USD", description: "per month" },
      { "@type": "Offer", name: "Sync", price: "6", priceCurrency: "USD", description: "per month" },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ctxfile",
    url: "https://ctxfile.dev",
    logo: "https://ctxfile.dev/brand/logo-mark-256.png",
    sameAs: ["https://github.com/ctxfile/ctxfile", "https://www.npmjs.com/package/ctxfile"],
  },
]);

// Applies the stored (or OS-preferred) theme before first paint so neither
// theme ever flashes. Must stay inline and tiny.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("cb-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${plexMono.variable} ${doto.variable}`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON_LD }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
