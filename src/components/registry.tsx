import { ArrowRight } from "lucide-react";
import index from "../../registry/index.json";
import { CodeBlock, Status } from "./ui";

/** One entry of registry/index.json (written by blends-registry-index from @acryl/blends-core; CI refuses a stale index). */
interface RegistryEntry { id: string; name: string; kind: "Blueprint" | "Blend"; version: string; path: string; license: string; category?: string; description?: string; parent?: string }

const entries = (index as { entries: RegistryEntry[] }).entries;

/** Blank, Blueprint (a starter kit) or Project: the three levels a user starts from and grows into. */
function level(entry: RegistryEntry): string {
  if (entry.kind === "Blend") return "Project";
  return entry.parent === undefined ? "Blank" : "Blueprint";
}

export function RegistryStarters() {
  return <section className="mx-auto max-w-[1440px] px-5 pt-12 md:px-8">
    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div><h2 className="text-2xl font-semibold">Start here: in the registry now</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Real starting points you can create a project from today. The project is yours: private and proprietary until you decide otherwise.</p></div>
      <a href="/registry/index.json" className="font-mono text-xs text-muted-foreground hover:text-foreground">index.json · {entries.length} {entries.length === 1 ? "entry" : "entries"}</a>
    </div>
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {entries.map(entry => <article key={entry.id} className="border border-border bg-background p-6">
        <div className="flex flex-wrap gap-2"><Status tone="success">{level(entry)}</Status>{entry.category && <Status>{entry.category}</Status>}<Status>v{entry.version}</Status><Status>{entry.license}</Status></div>
        <h3 className="mt-5 text-2xl font-semibold">{entry.name}</h3>
        {entry.description && <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{entry.description}</p>}
        {entry.parent && <p className="mt-3 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">grew from {entry.parent} <ArrowRight size={12}/> {entry.id}</p>}
        <div className="mt-5"><CodeBlock label="Start a project" code={entry.parent === undefined ? `acryl new my-app` : `acryl new my-app --from ${entry.id}`}/></div>
      </article>)}
    </div>
  </section>;
}
