import { Link, useParams } from "react-router-dom";
import { ArrowRight, Upload } from "lucide-react";
import { Breadcrumbs, PageIntro, SiteLayout, usePageMeta } from "../components/layouts";
import { Status } from "../components/ui";
import { categories, slugify } from "../lib/content";
import { placeEntries } from "../lib/registry-placement";
import { entries } from "../components/registry";
import NotFound from "./NotFound";

export default function BlendsCategory() {
  const { category } = useParams();
  const c = categories.find(x => x.slug === category);
  usePageMeta(c?.name ?? "Category", `Explore ${c?.name ?? "category"} Blends and composable starting points.`);
  if (!c) return <NotFound/>;
  const related = placeEntries(entries).filter(p => p.placement.category === c.name);
  return <SiteLayout><PageIntro kicker="Registry category" title={c.name} description={`Explore ${c.name.toLowerCase()} starting points and the subcategories that organize them.`} actions={<Link to="/docs/blends/building-and-publishing/publish-to-acrylblends" className="btn-primary"><Upload size={15}/> Publish here</Link>}/><div className="mx-auto max-w-[1440px] px-5 py-10 md:px-8"><Breadcrumbs items={[{ label: "Blends", to: "/blends" }, { label: c.name }]}/><div className="mt-10 grid gap-10 lg:grid-cols-[.65fr_1.35fr]"><aside><h2 className="font-mono text-xs font-semibold uppercase tracking-[.14em]">Subcategories</h2><div className="mt-4 border-t border-border">{c.subs.map(s => <Link key={s} to={`/blends/${c.slug}/${slugify(s)}`} className="flex items-center justify-between border-b border-border py-4 text-sm hover:text-accent-foreground"><span>{s}</span><ArrowRight size={14}/></Link>)}</div></aside><section><div className="flex items-center justify-between"><h2 className="text-2xl font-semibold">Available Blends</h2><Status>{related.length} results</Status></div>{related.length ? <div className="mt-5 space-y-3">{related.map(({ entry }) => <Link key={entry.id} to={`/blends/b/${entry.id}`} className="block border border-border p-6 hover:bg-surface"><div className="flex flex-wrap gap-2"><Status tone="success">{entry.kind}</Status><Status>v{entry.version}</Status><Status>{entry.license}</Status></div><h3 className="mt-3 text-xl font-semibold">{entry.name}</h3><p className="mt-2 text-sm text-muted-foreground">{entry.description}</p><p className="mt-5 font-mono text-[11px] text-muted-foreground">{entry.id}</p></Link>)}</div> : <div className="mt-5 border border-dashed border-border bg-surface p-12 text-center"><h3 className="text-xl font-semibold">No Blends here yet.</h3><p className="mt-2 text-sm text-muted-foreground">This is a real category waiting for its first useful composition.</p><Link to="/docs/blends/building-and-publishing/publish-to-acrylblends" className="btn-secondary mt-6">Be the first to publish one</Link></div>}</section></div></div></SiteLayout>;
}
