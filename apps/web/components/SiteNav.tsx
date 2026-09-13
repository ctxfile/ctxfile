"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icons";
import { ThemeToggle } from "@/components/ThemeToggle";

export interface NavLink {
  href: string;
  label: string;
  hideSm?: boolean;
}

const DEFAULT_LINKS: NavLink[] = [
  { href: "/docs", label: "Docs" },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
  { href: "/changelog", label: "Changelog", hideSm: true },
];

const GITHUB_URL = "https://github.com/ctxfile/ctxfile";

export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
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
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href.startsWith("#") || href.startsWith("/#")) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav({ links = DEFAULT_LINKS }: { links?: NavLink[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the sheet on navigation and on Escape.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <Link href="/" className="wordmark" aria-label="ctxfile home">
          <BrandMark />
          ctxfile
        </Link>

        <nav className="nav-links" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} data-active={isActive(pathname, l.href) || undefined}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="nav-right">
          <a className="nav-icon" href={GITHUB_URL} rel="noopener" aria-label="ctxfile on GitHub" title="GitHub">
            <Icon name="github" size={20} />
          </a>
          <a className="nav-cta" href="/#install">
            Install
          </a>
          <ThemeToggle />
          <button
            type="button"
            className="nav-burger"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? "close" : "menu"} size={22} />
          </button>
        </div>
      </div>

      <div id="site-menu" className="nav-sheet" data-open={open}>
        <nav className="nav-sheet-links" aria-label="Main, mobile">
          {links.map((l) => (
            <Link key={l.href} href={l.href} data-active={isActive(pathname, l.href) || undefined}>
              {l.label}
            </Link>
          ))}
          <a href={GITHUB_URL} rel="noopener">
            GitHub
          </a>
          <a className="nav-cta" href="/#install" onClick={() => setOpen(false)}>
            Install ctxfile
          </a>
        </nav>
      </div>
    </header>
  );
}
