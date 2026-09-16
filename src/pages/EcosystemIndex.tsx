import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Blocks, Boxes, CircleDot, GitBranch, LockKeyhole, PackageOpen } from "lucide-react";
import { PageIntro, SiteLayout, usePageMeta } from "../components/layouts";
import { Status, TriangleMark } from "../components/ui";

const sites = [
  { name: "acryl.dev", href: "https://acryl.dev", description: "The flagship product — ACRYL itself, the maxed-out Blend." },
  { name: "cordisplugins.github.io", href: "https://cordisplugins.github.io", description: "The atom-level registry every Blend on this site pulls plugins from." },
  { name: "github.com/acryldev/acryl", href: "https://github.com/acryldev/acryl", description: "The product source, the desktop/CLI/web surfaces, and this whole ecosystem's specs." },
] as const;

const nodes = [
  [CircleDot, "Cordis plugins", "Small capability units with lifecycle, services and injection."],
  [Blocks, "cordis-plugin-market", "Discovery and installation inside a running Cordis-based instance."],
  [Boxes, "ACRYL Blends", "Complete compositions: pullable, inspectable, and ready to grow."],
  [GitBranch, "DeepSeek Harness", "Cordis-native compatibility beyond the ACRYL runtime."],
  [PackageOpen, "ACRYL", "The flagship, maxed-out Blend: one complete expression of the model."],
  [LockKeyhole, "Private registries", "Proprietary catalogs and enterprise-only compositions for teams."],
] as const;

export default function EcosystemIndex() {
  usePageMeta("Ecosystem", "Understand the Cordis plugin, ACRYL Blend, and registry layers—and what exists today.");
  return <SiteLayout><PageIntro kicker="One ecosystem, three layers" title="Every boundary stays legible." description="Plugins provide capabilities. Blends compose complete instances. Registries make both discoverable without turning them into the same thing."/><section className="mx-auto max-w-[1200px] px-5 py-20 md:px-8"><div className="grid items-center gap-14 lg:grid-cols-[.8fr_1.2fr]"><div className="relative mx-auto"><TriangleMark className="h-72 w-72"/><div className="absolute -left-8 top-4 font-mono text-[10px]">ATOM</div><div className="absolute -right-12 top-1/2 font-mono text-[10px]">BLEND</div><div className="absolute bottom-0 left-1/3 font-mono text-[10px]">REGISTRY</div></div><div className="grid gap-px bg-border sm:grid-cols-2">{nodes.map(([Icon, t, b]) => <div key={t} className="bg-background p-6"><Icon size={18}/><h2 className="mt-6 text-lg font-semibold">{t}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{b}</p></div>)}</div></div></section><section className="border-y border-border py-16"><div className="mx-auto max-w-[1200px] px-5 md:px-8"><h2 className="text-sm font-mono uppercase tracking-[0.14em] text-muted-foreground">Explore the ecosystem sites</h2><div className="mt-6 grid gap-4 sm:grid-cols-3">{sites.map((s) => <a key={s.href} href={s.href} target="_blank" rel="noreferrer" className="group border border-border p-6 hover:border-foreground/40"><div className="flex items-center justify-between"><span className="font-mono text-sm font-semibold">{s.name}</span><ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"/></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{s.description}</p></a>)}</div></div></section><section className="border-y border-border bg-surface"><div className="mx-auto max-w-[1200px] px-5 py-16 md:px-8"><div className="grid gap-10 md:grid-cols-2"><div><Status tone="success">Open core</Status><h2 className="mt-5 text-3xl font-semibold">Public foundations. Private advantage.</h2><p className="mt-4 leading-7 text-muted-foreground">The protocol, framework and public registries stay open. Webboxes supports teams with consulting, proprietary Blends and private registries.</p><Link to="/ecosystem/business-model" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">Business model <ArrowRight size={15}/></Link></div><div><Status tone="warning">Honest roadmap</Status><h2 className="mt-5 text-3xl font-semibold">Not every layer is finished.</h2><p className="mt-4 leading-7 text-muted-foreground">The Differentiation Engine, plugin-from-template workflow, and nested plugin grouping remain active design work—not shipped promises.</p><Link to="/ecosystem/roadmap" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">See current gaps <ArrowRight size={15}/></Link></div></div></div></section></SiteLayout>;
}
