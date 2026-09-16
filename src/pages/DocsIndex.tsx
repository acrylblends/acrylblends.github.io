import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Box, Hammer, Radio, Rocket, Shield, Wrench } from "lucide-react";
import { SiteLayout, PageIntro, usePageMeta } from "../components/layouts";
import { docGroups, slugify } from "../lib/content";

const icons = [BookOpen, Box, Hammer, Radio, Rocket, Box, Shield, Wrench];

export default function DocsIndex() {
  usePageMeta("Documentation", "Learn how to pull, grow, compose and publish ACRYL Blends and Cordis plugins.");
  return <SiteLayout><PageIntro kicker="Documentation" title="Build from atoms. Keep the whole visible." description="Practical guides for pulling a Blend, authoring Cordis plugins in place, and publishing stable compositions."/><section className="mx-auto max-w-[1200px] px-5 py-14 md:px-8"><div className="grid gap-4 md:grid-cols-2">{docGroups.map((g, i) => { const Icon = icons[i] ?? BookOpen; return <div key={g.slug} className="border border-border p-6"><Icon size={19}/><h2 className="mt-6 text-xl font-semibold">{g.title}</h2><div className="mt-4 space-y-2">{g.items.map(item => <Link key={item} to={`/docs/${g.slug}/${slugify(item)}`} className="group flex items-center justify-between py-1 text-sm text-muted-foreground hover:text-foreground"><span>{item}</span><ArrowRight size={13} className="opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100"/></Link>)}</div><Link to={`/docs/${g.slug}`} className="mt-6 inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase">Open section <ArrowRight size={13}/></Link></div>; })}</div></section></SiteLayout>;
}
