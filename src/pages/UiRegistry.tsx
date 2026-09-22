import { useMemo, useState } from "react";
import { Github, Copy, Check } from "lucide-react";
import { PageIntro, SiteLayout, usePageMeta } from "../components/layouts";
import manifestJson from "../ui-registry/manifest.json";
import categoriesJson from "../ui-registry/categories.json";
import { demos } from "../ui-registry/demos";
import "../ui-registry/tokens.css";

interface ManifestEntry {
  id: string; version: string; summary: string; props: Record<string, unknown>;
  origin: string; from: string; source: string; componentFile: string | null; exportName: string | null;
}
interface Category { name: string; componentIds: string[] }

const manifest = manifestJson as ManifestEntry[];
const categories = (categoriesJson as { categories: Category[] }).categories;
// categories.json's componentIds are contract names ("Badge"), not registry item ids
// ("acryl.ui.badge") - match by the manifest's own exportName, which carries the same name.
const byExportName = new Map(manifest.map(entry => [entry.exportName, entry]));
const hasRealEntry = (category: Category) => category.componentIds.some(name => byExportName.has(name));

function usageSnippet(entry: ManifestEntry): string {
  const propsList = Object.keys(entry.props).slice(0, 3).map(name => `${name}={...}`).join(" ");
  return `acryl ui add ${entry.id} .\n\nimport { ${entry.exportName} } from './ui/${entry.id.replace(/^acryl\.ui\./u, "")}/${entry.componentFile}'\n\n<${entry.exportName} ${propsList} />`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }}
      className="inline-flex items-center gap-1 border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy usage"}
    </button>
  );
}

function ComponentCard({ entry }: { entry: ManifestEntry }) {
  const Demo = demos[entry.id];
  return (
    <div className="border border-border bg-background p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{entry.id}</h3>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{entry.summary}</p>
        </div>
        <a href={`https://github.com/acryldev/acryl-ui-registry/tree/main/registry/${entry.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground hover:text-foreground">
          <Github size={12} /> source
        </a>
      </div>
      <div className="mt-4 border border-dashed border-border bg-surface p-4">
        {Demo !== undefined ? <Demo /> : <span className="text-xs text-muted-foreground">No live demo written yet.</span>}
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <pre className="flex-1 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">{usageSnippet(entry)}</pre>
        <CopyButton text={usageSnippet(entry)} />
      </div>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground">{entry.origin} · {entry.source}</p>
    </div>
  );
}

export default function UiRegistry() {
  usePageMeta("UI component registry", "Source-owned components for @acryl/ui: copy one into your plugin, or install the package.");
  const [active, setActive] = useState<string | null>(null);
  const populated = useMemo(() => categories.filter(hasRealEntry), []);
  const empty = useMemo(() => categories.filter(category => !hasRealEntry(category)), []);
  const shown = active === null ? categories : categories.filter(category => category.name === active);

  return (
    <SiteLayout>
      <PageIntro
        kicker="Component registry"
        title="One catalogue, copy or install."
        description="Source-owned components for @acryl/ui (spec 038-ui-component-library). Copy one with acryl ui add <id> and own it, or install the package as a dependency. Categories follow shadcnblocks.com's taxonomy (naming only, no code); every category is shown, built or not."
        actions={<span className="self-center font-mono text-xs text-muted-foreground">{populated.length} built · {empty.length} not yet built · <a href="https://github.com/acryldev/acryl-ui-registry" target="_blank" rel="noreferrer" className="underline">acryl-ui-registry</a></span>}
      />
      <section className="mx-auto flex max-w-[1440px] gap-8 px-5 py-12 md:px-8">
        <aside className="w-56 shrink-0">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Categories</h2>
          <button type="button" onClick={() => setActive(null)} className={`mt-3 block w-full px-2 py-1 text-left text-sm ${active === null ? "bg-muted" : "hover:bg-muted"}`}>All</button>
          <div className="mt-1 max-h-[70vh] overflow-y-auto">
            {populated.map(category => (
              <button key={category.name} type="button" onClick={() => setActive(category.name)} className={`flex w-full items-center justify-between px-2 py-1 text-left text-sm ${active === category.name ? "bg-muted" : "hover:bg-muted"}`}>
                {category.name} <span className="text-muted-foreground">{category.componentIds.filter(name => byExportName.has(name)).length}</span>
              </button>
            ))}
            <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Not yet built</div>
            {empty.map(category => <div key={category.name} className="px-2 py-1 text-xs text-muted-foreground/60">{category.name}</div>)}
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          {shown.filter(hasRealEntry).map(category => (
            <div key={category.name} className="mb-8">
              <h2 className="border-b border-border pb-2 text-lg font-semibold">{category.name}</h2>
              <div className="mt-4 grid gap-4">
                {category.componentIds.map((name) => {
                  const entry = byExportName.get(name);
                  return entry === undefined ? null : <ComponentCard key={name} entry={entry} />;
                })}
              </div>
            </div>
          ))}
          {active !== null && shown.every(category => !hasRealEntry(category)) && (
            <p className="py-10 text-center text-muted-foreground">Nothing built in this category yet.</p>
          )}
        </div>
      </section>
    </SiteLayout>
  );
}
