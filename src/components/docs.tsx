import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { docGroups, slugify } from "../lib/content";
import { docContent } from "../lib/doc-content";
import { Breadcrumbs } from "./layouts";
import { CodeBlock, Status } from "./ui";

export function DocsShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[270px_1fr]"><aside className="hidden border-r border-border px-6 py-10 lg:block"><p className="font-mono text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Documentation</p>{docGroups.map(g => <div key={g.slug} className="mt-7"><Link to={`/docs/${g.slug}`} className="text-sm font-semibold hover:text-accent-foreground">{g.title}</Link><div className="mt-2 space-y-1">{g.items.map(i => <Link key={i} to={`/docs/${g.slug}/${slugify(i)}`} className="block py-1 text-xs leading-5 text-muted-foreground hover:text-foreground">{i}</Link>)}</div></div>)}</aside><div className="min-w-0 px-5 py-10 md:px-10 lg:px-14">{children}</div></div>;
}
export function Article({ group, title, contentKey, exploratory = false }: { group: string; title: string; contentKey?: string; exploratory?: boolean }) {
  const entry = contentKey ? docContent[contentKey] : undefined;
  return <article className="max-w-3xl"><Breadcrumbs items={[{ label: "Docs", to: "/docs" }, { label: group }, { label: title }]}/>{exploratory && <div className="mt-8"><Status tone="warning">Exploratory · not stable</Status></div>}<h1 className="mt-6 text-4xl font-semibold leading-tight md:text-6xl">{title}</h1><p className="mt-5 text-lg leading-8 text-muted-foreground">{entry?.intro ?? articleIntro(title)}</p>
  {entry
    ? <div className="doc-copy">{entry.body.map((section, i) => <div key={i}>{section.heading && <h2>{section.heading}</h2>}{section.paragraphs.map((p, j) => <p key={j}>{p}</p>)}{section.note && <div className="doc-note"><strong>Note</strong><p>{section.note}</p></div>}</div>)}{entry.code && <div className="mt-8"><CodeBlock label={entry.code.label} code={entry.code.code}/></div>}</div>
    : <div className="doc-copy"><h2>The shape of it</h2><p>ACRYL Blends keeps the unit of change small and the resulting system legible. The framework records what is composed without hiding the Cordis primitives underneath.</p><div className="doc-note"><strong>Design rule</strong><p>A Blend is a recipe for a working instance, not a new package boundary. Every plugin stays independently understandable and replaceable.</p></div><h2>Working with this concept</h2><p>Start from the smallest viable composition. Add one capability at a time, test it in the running instance, and keep the manifest as the durable explanation of the system.</p><pre><code>{exampleFor(title)}</code></pre><h2>Next step</h2><p>Use this page as the conceptual boundary, then continue with the linked practical guide for the exact workflow.</p></div>}
  <div className="mt-14 flex justify-end border-t border-border pt-6"><Link to="/docs" className="group flex items-center gap-3 text-sm font-semibold">Back to documentation <ArrowRight size={15} className="transition-transform group-hover:translate-x-1"/></Link></div></article>;
}
const articleIntro = (t: string) => t.toLowerCase().includes("nesting") || t.toLowerCase().includes("grouping") ? "The protocol boundary for larger plugin groupings remains intentionally unresolved. This page records the question without presenting speculation as settled behavior." : `A practical guide to ${t.toLowerCase()} within a composable, Cordis-native development workflow.`;
const exampleFor = (t: string) => t.toLowerCase().includes("install") ? "npm install -g @acryl/cli\nacryl --version" : t.toLowerCase().includes("yaml") || t.toLowerCase().includes("compose") ? "name: my-blend\nplugins:\n  - cordis\n  - my-plugin\n  - web-surface" : "acryl blend inspect ./blend.yml\nacryl blend dev --hot";
