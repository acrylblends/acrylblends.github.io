import { useMemo, useState } from "react";
import { Search, Github, LayoutGrid } from "lucide-react";
import { PageIntro, SiteLayout, usePageMeta } from "../components/layouts";
import { Status } from "../components/ui";
import { uiRegistry, type UiRegistryItem } from "../lib/ui-registry";

function ItemCard({ item }: { item: UiRegistryItem }) {
  return (
    <div className="group border border-border bg-background p-6 hover:border-foreground/30 hover:bg-surface">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Status tone="success">v{item.version}</Status>
          {item.surfaces.map(s => <Status key={s}>{s}</Status>)}
        </div>
        <LayoutGrid size={18} className="text-muted-foreground" />
      </div>
      <h2 className="mt-5 text-xl font-semibold">{item.id}</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{item.summary}</p>
      {item.props.length > 0 && <p className="mt-3 font-mono text-[11px] text-muted-foreground">props: {item.props.join(", ")}</p>}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 font-mono text-[11px] text-muted-foreground">
        <span>{item.origin} · {item.source}</span>
        <a href={`${uiRegistry.repository}/tree/main/registry/${item.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
          <Github size={13} /> source
        </a>
      </div>
    </div>
  );
}

export default function UiRegistry() {
  usePageMeta("UI component registry", "Source-owned components for @acryl/ui: copy one into your plugin, or install the package.");
  const [q, setQ] = useState("");
  const shown = useMemo(
    () => uiRegistry.items.filter(item => [item.id, item.summary, item.origin, ...item.surfaces].join(" ").toLowerCase().includes(q.toLowerCase())),
    [q],
  );
  return (
    <SiteLayout>
      <PageIntro
        kicker="Component registry"
        title="One catalogue, copy or install."
        description={`Source-owned components for @acryl/ui (spec 038-ui-component-library). Copy one with acryl ui add <id> and own it, or install ${uiRegistry.package} as a dependency. Every item is extracted from a pinned DeepSeek Harness commit, not redrawn.`}
        actions={<span className="self-center font-mono text-xs text-muted-foreground">{uiRegistry.items.length} items · <a href={uiRegistry.repository} target="_blank" rel="noreferrer" className="underline">{uiRegistry.repository.replace("https://", "")}</a></span>}
      />
      <section className="mx-auto max-w-[1440px] px-5 py-12 md:px-8">
        <div className="flex h-11 items-center gap-3 border border-input bg-background px-4">
          <Search size={16} className="text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Search by name, surface or origin" />
        </div>
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {shown.map(item => <ItemCard key={item.id} item={item} />)}
          {shown.length === 0 && <div className="col-span-full py-20 text-center text-muted-foreground">No registry item matches this search.</div>}
        </div>
      </section>
    </SiteLayout>
  );
}
