import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Download } from "lucide-react";
import index from "../../registry/index.json";
import { CodeBlock, Status } from "./ui";
import { blendPath } from "../lib/registry-placement";
import { registrySources } from "../lib/registry-sources";

/** One entry of registry/index.json (written by blends-registry-index from @acryl/blends-core; CI refuses a stale index). */
/** `runtime` says what the entry is for: an app for the acrylblends framework, or a starter for the ACRYL app (the index of a registry written before the field existed has none: those are ACRYL's). */
export type Runtime = "acrylblends" | "acryl";
interface RegistryEntry { id: string; name: string; kind: "Blueprint" | "Blend"; version: string; path: string; license: string; runtime?: Runtime; category?: string; description?: string; parent?: string }

export type { RegistryEntry };
export const entries = (index as { entries: RegistryEntry[] }).entries;

/** An entry's docs/screenshot.png, served from the registry like its blend.yaml; an entry without one shows nothing (the image hides itself when it does not load). */
export function Screenshot({ entry, className = "" }: { entry: RegistryEntry; className?: string }) {
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  return <img src={`/registry/${entry.path}/docs/screenshot.png`} alt={`${entry.name}, the first page`} loading="lazy" onError={() => setShown(false)} className={`block w-full border border-border bg-surface object-cover object-top ${className}`}/>;
}

export function runtimeOf(entry: RegistryEntry): Runtime { return entry.runtime === "acrylblends" ? "acrylblends" : "acryl"; }

/** The command that starts a project from an entry: for acrylblends, create-acrylblends (npm needs the `--`); an ACRYL starter opens in the ACRYL app, and its CLI form is shown as it is. */
export function startCommand(entry: RegistryEntry): string {
  if (runtimeOf(entry) === "acrylblends") return `npm create acrylblends@latest my-app -- --from ${entry.id}`;
  return entry.parent === undefined ? `acryl new my-app` : `acryl new my-app --from ${entry.id}`;
}

/** Blank, Blueprint (a starter kit) or Project: the three levels a user starts from and grows into. */
export function level(entry: RegistryEntry): string {
  if (entry.kind === "Blend") return "Project";
  return entry.parent === undefined ? "Blank" : "Blueprint";
}

const FILTERS: { value: "all" | Runtime; label: string }[] = [
  { value: "all", label: "All" },
  { value: "acrylblends", label: "acrylblends apps" },
  { value: "acryl", label: "ACRYL app starters" },
];

/** The Blend every ACRYL user starts with: it lists, makes and starts the others. Shown first, above the registry list. */
export const CORE_ID = "acryl.control-center";

export function CoreBlend() {
  const entry = entries.find(e => e.id === CORE_ID);
  const source = registrySources[CORE_ID];
  if (!entry) return null;
  return <section className="mx-auto max-w-[1440px] px-5 pt-12 md:px-8">
    <article className="grid gap-8 border-2 border-foreground bg-surface p-6 md:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2"><Status tone="success">Start here</Status><Status>Core of ACRYL</Status><Status>v{entry.version}</Status><Status>{entry.license}</Status></div>
        <h2 className="mt-5 text-3xl font-semibold md:text-4xl"><Link to={blendPath(entry.id)} className="hover:text-accent-foreground">{entry.name}</Link></h2>
        {entry.description && <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{entry.description}</p>}
        <div className="mt-5"><CodeBlock label="Or from a terminal" code={"npx acryl --gui    # in its own window\nnpx acryl --web    # in your browser"}/></div>
      </div>
      {source?.downloads && <div className="min-w-0">
        <h3 className="text-lg font-semibold">Download the app</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{source.downloads.map(d => <a key={d.url} href={d.url} className="flex items-center justify-between gap-3 border border-border bg-background px-4 py-3 text-sm font-semibold hover:bg-muted"><span>{d.os} <span className="font-normal text-muted-foreground">{d.cpu}</span></span><Download size={15} className="shrink-0"/></a>)}</div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">Not signed yet: on macOS the first start is right-click &gt; Open; on Windows SmartScreen may ask (More info &gt; Run anyway). <Link to={blendPath(entry.id)} className="font-semibold text-foreground underline underline-offset-4">More about it</Link>.</p>
      </div>}
    </article>
  </section>;
}

export function RegistryStarters() {
  const [filter, setFilter] = useState<"all" | Runtime>("all");
  const shown = entries.filter(entry => entry.id !== CORE_ID && (filter === "all" || runtimeOf(entry) === filter));
  return <section className="mx-auto max-w-[1440px] px-5 pt-12 md:px-8">
    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div><h2 className="text-2xl font-semibold">Start here: in the registry now</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Real starting points you can create a project from today. The project is yours: private and proprietary until you decide otherwise.</p></div>
      <a href="/registry/index.json" className="font-mono text-xs text-muted-foreground hover:text-foreground">index.json · {entries.length} {entries.length === 1 ? "entry" : "entries"}</a>
    </div>
    <div role="group" aria-label="Filter by runtime" className="mt-6 flex flex-wrap gap-2">
      {FILTERS.map(f => <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)} className={`border px-3 py-1.5 font-mono text-xs ${filter === f.value ? "border-foreground bg-foreground text-background" : "border-input text-muted-foreground hover:text-foreground"}`}>{f.label} · {f.value === "all" ? entries.length : entries.filter(entry => runtimeOf(entry) === f.value).length}</button>)}
    </div>
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {shown.map(entry => <article key={entry.id} className="min-w-0 border border-border bg-background p-6">
        <div className="flex flex-wrap gap-2"><Status tone={runtimeOf(entry) === "acrylblends" ? "success" : "default"}>{runtimeOf(entry) === "acrylblends" ? "acrylblends app" : "ACRYL app starter"}</Status><Status tone="success">{level(entry)}</Status>{entry.category && <Status>{entry.category}</Status>}<Status>v{entry.version}</Status><Status>{entry.license}</Status></div>
        <h3 className="mt-5 text-2xl font-semibold"><Link to={blendPath(entry.id)} className="hover:text-accent-foreground">{entry.name}</Link></h3>
        {entry.description && <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{entry.description}</p>}
        {entry.parent && <p className="mt-3 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">grew from {entry.parent} <ArrowRight size={12}/> {entry.id}</p>}
        <div className="mt-5"><CodeBlock label={runtimeOf(entry) === "acrylblends" ? "Start a project" : "Start a project in the ACRYL app"} code={startCommand(entry)}/>{runtimeOf(entry) === "acryl" && <p className="mt-2 text-xs leading-5 text-muted-foreground">Runs only inside the ACRYL app. <code>create-acrylblends</code> makes acrylblends apps and refuses this one.</p>}</div>
      </article>)}
    </div>
  </section>;
}
