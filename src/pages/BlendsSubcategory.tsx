import { Link, useParams } from "react-router-dom";
import { Breadcrumbs, PageIntro, SiteLayout, usePageMeta } from "../components/layouts";
import { categories, slugify } from "../lib/content";
import { placeEntries } from "../lib/registry-placement";
import { entries } from "../components/registry";

export default function BlendsSubcategory() {
  const { category, subcategory } = useParams<{ category: string; subcategory: string }>();
  const c = categories.find(x => x.slug === category);
  const label = c?.subs.find(s => slugify(s) === subcategory) ?? (subcategory ?? "").replaceAll("-", " ");
  usePageMeta(label, "Browse Blends in this focused registry subcategory.");
  const list = placeEntries(entries).filter(p => p.placement.category === c?.name && slugify(p.placement.subcategory) === subcategory);
  return <SiteLayout><PageIntro kicker={c?.name ?? "Category"} title={label} description={`Focused compositions for ${label.toLowerCase()}. Every taxonomy node remains visible, even before its first publication.`}/><div className="mx-auto max-w-[1100px] px-5 py-10 md:px-8"><Breadcrumbs items={[{ label: "Blends", to: "/blends" }, { label: c?.name ?? category ?? "", to: `/blends/${category}` }, { label }]}/>{list.length ? <div className="mt-10 grid gap-4 md:grid-cols-2">{list.map(({ entry }) => <Link key={entry.id} to={`/blends/b/${entry.id}`} className="border border-border p-6 hover:bg-surface"><h2 className="text-xl font-semibold">{entry.name}</h2><p className="mt-2 text-sm text-muted-foreground">{entry.description}</p></Link>)}</div> : <div className="mt-10 border border-dashed border-border bg-surface p-14 text-center"><h2 className="text-2xl font-semibold">No Blends here yet.</h2><p className="mt-3 text-muted-foreground">The address is ready. The first composition is not.</p><Link to="/docs/blends/building-and-publishing/publish-to-acrylblends" className="btn-primary mt-7">Publish a Blend</Link></div>}</div></SiteLayout>;
}
