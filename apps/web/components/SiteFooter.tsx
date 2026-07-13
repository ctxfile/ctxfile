import Link from "next/link";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#pro", label: "Pro" },
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
      { href: "/convention", label: "The .ctxfile convention" },
      { href: "/docs/clients", label: "Claude Code setup" },
      { href: "/docs/clients", label: "Cursor setup" },
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
              <svg className="brand-mark" viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">
                <rect width="32" height="32" rx="7" fill="#f55300" />
                <path
                  d="M11 8.5h7l3.5 3.5v11.5h-10.5z"
                  fill="none"
                  stroke="#1c0b02"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <path d="M18 8.5v3.5h3.5" fill="none" stroke="#1c0b02" strokeWidth="2" strokeLinejoin="round" />
                <circle cx="16" cy="18" r="2.1" fill="#1c0b02" />
              </svg>
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
          <span>© 2026 ctxfile</span>
          <span className="foot-tag">Local-first by architecture, not by policy.</span>
        </div>
      </div>
    </footer>
  );
}
