import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Header, Footer } from "./site-chrome";

export function SiteLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground"><Header/><main>{children}</main><Footer/></div>;
}
export function PageIntro({ kicker, title, description, actions }: { kicker: string; title: string; description: string; actions?: ReactNode }) {
  return <section className="relative overflow-hidden border-b border-border bg-surface"><div className="geo-grid absolute inset-0 opacity-55"/><div className="relative mx-auto max-w-[1440px] px-5 py-16 md:px-8 md:py-24"><div className="max-w-4xl"><p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-accent-foreground">{kicker}</p><h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-normal md:text-7xl">{title}</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">{description}</p>{actions && <div className="mt-8 flex flex-wrap gap-3">{actions}</div>}</div></div></section>;
}
export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{items.map((x, i) => <span key={x.label} className="flex items-center gap-1.5">{i > 0 && <ChevronRight size={12}/>} {x.to ? <Link to={x.to} className="hover:text-foreground">{x.label}</Link> : <span className="text-foreground">{x.label}</span>}</span>)}</nav>;
}

// Client-side <head> management: this is a static-hosted SPA (GitHub Pages
// has no per-route server render), so each page sets its own title/description
// on mount rather than relying on server-rendered <head> tags.
export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    const fullTitle = `${title} — ACRYL Blends`;
    document.title = fullTitle;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", description);
  }, [title, description]);
}
