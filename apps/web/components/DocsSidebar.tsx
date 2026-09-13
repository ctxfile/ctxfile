"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface DocLink {
  href: string;
  label: string;
}

interface DocGroup {
  title: string;
  links: DocLink[];
}

const DOCS_NAV: DocGroup[] = [
  {
    title: "Getting started",
    links: [
      { href: "/docs", label: "Quickstart" },
      { href: "/docs/clients", label: "Client setup" },
      { href: "/docs/automatic", label: "Make it automatic" },
      { href: "/docs/dashboard", label: "Dashboard" },
    ],
  },
  {
    title: "Reference",
    links: [
      { href: "/docs/cli", label: "CLI reference" },
      { href: "/docs/mcp", label: "MCP surface" },
      { href: "/docs/configuration", label: "Configuration" },
      { href: "/docs/connectors", label: "Connectors" },
      { href: "/convention", label: "The .ctxfile convention" },
    ],
  },
  {
    title: "Guides",
    links: [
      { href: "/docs/ingest", label: "Session sync" },
      { href: "/docs/threads", label: "Threads & handoff" },
      { href: "/docs/export", label: "Cloud agents" },
      { href: "/docs/local-models", label: "Local models" },
      { href: "/docs/webchat", label: "Web chatbots" },
    ],
  },
  {
    title: "Pro & Sync",
    links: [
      { href: "/docs/pro", label: "Pro" },
      { href: "/docs/playbooks", label: "Playbooks" },
      { href: "/docs/sync", label: "Sync & roaming" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/docs/privacy", label: "Privacy & redaction" },
      { href: "/security", label: "Security overview" },
    ],
  },
];

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="docs-side" aria-label="Documentation">
      {DOCS_NAV.map((group) => (
        <div key={group.title} className="docs-group-wrap">
          <span className="docs-group">{group.title}</span>
          {group.links.map((item) => (
            <Link key={item.href} href={item.href} data-active={pathname === item.href || undefined}>
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
