import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { DocsSidebar } from "@/components/DocsSidebar";
import { CopyBlocks } from "@/components/CopyBlocks";

export const metadata: Metadata = {
  title: {
    template: "%s: ctxfile docs",
    default: "Docs: ctxfile",
  },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteNav />
      <div className="wrap docs-shell">
        <DocsSidebar />
        <article className="prose">{children}</article>
      </div>
      <CopyBlocks />
      <SiteFooter />
    </>
  );
}
