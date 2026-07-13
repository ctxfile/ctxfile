import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export interface NavLink {
  href: string;
  label: string;
  hideSm?: boolean;
}

const DEFAULT_LINKS: NavLink[] = [
  { href: "/docs", label: "Docs" },
  { href: "/pricing", label: "Pricing" },
  { href: "/changelog", label: "Changelog", hideSm: true },
];

export function SiteNav({ links = DEFAULT_LINKS }: { links?: NavLink[] }) {
  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <Link href="/" className="wordmark">
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
        </Link>
        <nav className="nav-links" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={l.hideSm ? "hide-sm" : undefined}>
              {l.label}
            </Link>
          ))}
          <a className="nav-cta" href="/#install">
            install
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
