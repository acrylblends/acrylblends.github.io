import { useParams } from "react-router-dom";
import { Breadcrumbs, SiteLayout, usePageMeta } from "../components/layouts";
import { Status } from "../components/ui";
import { posts } from "../lib/blog";
import NotFound from "./NotFound";

export default function BlogPost() {
  const { slug } = useParams();
  const p = posts.find(x => x.slug === slug);
  usePageMeta(p?.title ?? "Article", p?.excerpt ?? "ACRYL Blends article");
  if (!p) return <NotFound/>;
  return <SiteLayout><article className="mx-auto max-w-3xl px-5 py-14 md:px-8"><Breadcrumbs items={[{ label: "Blog", to: "/blog" }, { label: p.title }]}/><div className="mt-10 flex items-center gap-3"><Status>{p.tag}</Status><span className="font-mono text-[10px] text-muted-foreground">{p.date}</span></div><h1 className="mt-6 text-4xl font-semibold leading-tight md:text-6xl">{p.title}</h1><p className="mt-6 text-xl leading-8 text-muted-foreground">{p.excerpt}</p><div className="doc-copy"><p>The useful unit of software is not always a product or a package. Often it is a working arrangement of small capabilities around a real task.</p><h2>Composition without concealment</h2><p>ACRYL Blends keeps that arrangement explicit. The manifest says what is present, Cordis says how those pieces cooperate, and the registry gives the arrangement a durable place to be found.</p><blockquote>Start from something that works. Keep every boundary open to inspection.</blockquote><h2>What comes next</h2><p>We are building the public language and catalog first. Automation will follow only where the underlying contracts are honest and stable.</p></div></article></SiteLayout>;
}
