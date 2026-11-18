import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Breadcrumbs, PageIntro, SiteLayout, usePageMeta } from "../components/layouts";
import { categories, type SubcategoryDetail } from "../lib/content";
import { blendPath, placeEntries } from "../lib/registry-placement";
import { byOrigin, entries, OriginBadge, OriginChips, Screenshot, type OriginFilter } from "../components/registry";

export default function BlendsSubcategory() {
  const { category, subcategory } = useParams<{ category: string; subcategory: string }>();
  const c = categories.find(x => x.slug === category);
  const sub = c?.subs.find(s => s.slug === subcategory);
  const label = sub?.name ?? (subcategory ?? "").replaceAll("-", " ");
  const detail = sub?.detail;
  usePageMeta(label, detail?.summary ?? "Browse Blends in this focused registry subcategory.");
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const placed = placeEntries(entries).filter(p => p.placement.category === c?.name && p.placement.subcategory === sub?.name);
  const list = byOrigin(placed.map(p => ({ ...p, origin: p.entry.origin })), origin);
  return <SiteLayout><PageIntro kicker={c?.name ?? "Category"} title={label} description={detail?.summary ?? `Focused compositions for ${label.toLowerCase()}. Every taxonomy node remains visible, even before its first publication.`}/><div className="mx-auto max-w-[1100px] px-5 py-10 md:px-8"><Breadcrumbs items={[{ label: "Blends", to: "/blends" }, { label: c?.name ?? category ?? "", to: `/blends/${category}` }, { label }]}/>{placed.length > 0 && <div className="mt-8"><OriginChips value={origin} onChange={setOrigin} list={placed.map(p => p.entry)}/></div>}{list.length ? <div className="mt-6 grid gap-4 md:grid-cols-2">{list.map(({ entry }) => <Link key={entry.id} to={blendPath(entry.id)} className="border border-border p-6 hover:bg-surface"><Screenshot entry={entry} className="mb-5 h-56"/><OriginBadge entry={entry}/><h2 className="mt-3 text-xl font-semibold">{entry.name}</h2><p className="mt-2 text-sm text-muted-foreground">{entry.description}</p>{entry.origin === "community" && <p className="mt-3 font-mono text-[11px] text-muted-foreground">by @{entry.publisher}</p>}</Link>)}</div> : <div className="mt-10 border border-dashed border-border bg-surface p-14 text-center"><h2 className="text-2xl font-semibold">No Blends here yet.</h2><p className="mt-3 text-muted-foreground">The address is ready. The first composition is not.</p><Link to="/docs/blends/building-and-publishing/publish-to-acrylblends" className="btn-primary mt-7">Publish a Blend</Link></div>}{detail && <About detail={detail}/>}</div></SiteLayout>;
}

/** A subcategory with a page of its own: what it is, then what its Blends look like. */
function About({ detail }: { detail: SubcategoryDetail }) {
  return <section className="mt-14 border-t border-border pt-10">
    <div className="max-w-3xl space-y-4 text-base leading-7 text-muted-foreground">{detail.paragraphs.map(p => <p key={p}>{p}</p>)}</div>
    <div className="mt-10 grid gap-6">{detail.gallery.map(shot => <figure key={shot.src} className="m-0 border border-border bg-surface"><img src={shot.src} alt={shot.caption} loading="lazy" className="block w-full"/><figcaption className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{shot.caption}</figcaption></figure>)}</div>
  </section>;
}
