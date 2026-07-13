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
};

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
      </head>
      <body>{children}</body>
    </html>
  );
}
