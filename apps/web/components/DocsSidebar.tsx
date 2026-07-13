"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const DOCS_NAV = [
  { href: "/docs", label: "Quickstart" },
  { href: "/docs/cli", label: "CLI reference" },
  { href: "/docs/mcp", label: "MCP surface" },
  { href: "/docs/configuration", label: "Configuration" },
  { href: "/docs/connectors", label: "Connectors" },
  { href: "/docs/automatic", label: "Make it automatic" },
  { href: "/docs/ingest", label: "Session sync" },
  { href: "/docs/threads", label: "Threads & handoff" },
  { href: "/docs/sync", label: "Sync & roaming" },
  { href: "/docs/dashboard", label: "Dashboard" },
  { href: "/docs/export", label: "Cloud agents" },
  { href: "/docs/privacy", label: "Privacy" },
  { href: "/docs/pro", label: "Pro" },
  { href: "/docs/clients", label: "Client setup" },
  { href: "/convention", label: "Convention" },
];

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="docs-side" aria-label="Documentation">
      <span className="docs-side-label">Docs</span>
      {DOCS_NAV.map((item) => (
        <Link key={item.href} href={item.href} data-active={pathname === item.href || undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
