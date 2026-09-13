import Link from "next/link";
import { BrandMark } from "@/components/SiteNav";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#pricing", label: "Pro" },
      { href: "/pricing", label: "Pricing" },
      { href: "/security", label: "Security" },
      { href: "/changelog", label: "Changelog" },
      { href: "/design", label: "Design system" },
    ],
  },
  {
    title: "Docs",
    links: [
      { href: "/docs", label: "Quickstart" },
      { href: "/docs/configuration", label: "Configuration" },
      { href: "/docs/connectors", label: "Connectors" },
      { href: "/docs/privacy", label: "Privacy & redaction" },
      { href: "/docs/clients", label: "MCP clients" },
    ],
  },
  {
    title: "Ecosystem",
    links: [
      { href: "https://modelcontextprotocol.io", label: "MCP specification", external: true },
      { href: "https://github.com/ctxfile/ctxfile", label: "GitHub", external: true },
      { href: "https://www.npmjs.com/package/ctxfile", label: "npm", external: true },
      { href: "/convention", label: "The .ctxfile convention" },
      { href: "/docs/pro", label: "Offline licensing" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer>
      <div className="wrap">
        <div className="foot-grid">
          <div className="foot-brand">
            <p className="wordmark">
              <BrandMark />
              ctxfile
            </p>
            <p className="foot-claims">
              <strong>The privacy claims on this site are the literal behavior of the code.</strong> Default path:
              zero network calls. Every opt-in (Notion, Ollama summaries, consult providers, the anonymous install
              ping) is off until you enable it.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <nav key={col.title} className="foot-col" aria-label={col.title}>
              <p className="foot-col-title">{col.title}</p>
              {col.links.map((l) =>
                "external" in l && l.external ? (
                  <a key={l.label} href={l.href} rel="noopener">
                    {l.label}
                  </a>
                ) : (
                  <Link key={l.label} href={l.href}>
                    {l.label}
                  </Link>
                )
              )}
            </nav>
          ))}
        </div>
        <div className="foot-base">
          <span>© 2026 ctxfile · Apache-2.0</span>
          <span className="foot-tag">Local-first by architecture, not by policy.</span>
        </div>
      </div>
    </footer>
  );
}
