import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, Download } from "lucide-react";
import index from "../../registry/index.json";
import discovered from "../../registry/discovered.json";
import { CodeBlock, Status } from "./ui";
import { blendPath } from "../lib/registry-placement";
import { registrySources } from "../lib/registry-sources";

/** One entry of registry/index.json (written by blends-registry-index from @acryl/blends-core; CI refuses a stale index). */
/** `runtime` says what the entry is for: an app for the acrylblends framework, or a starter for the ACRYL app (the index of a registry written before the field existed has none: those are ACRYL's). */
export type Runtime = "acrylblends" | "acryl";
/** Official or community: decided by the sync from the repository owner's numeric GitHub id (official-owners.json), never by anything the author writes. */
export type Origin = "official" | "community";
interface RegistryEntry {
  id: string; name: string; kind: "Blueprint" | "Blend"; version: string; path: string; license: string; runtime?: Runtime; category?: string; description?: string; parent?: string;
  origin: Origin;
  /** A Blend found in its own repository (registry/discovered.json, written by scripts/sync-blends.ts): its owner, its page, the tag it is listed at and the create source. */
  publisher?: string; repository?: string; ref?: string; source?: string;
  /** `converting`: a starter for the earlier ACRYL app that is being rebuilt as an acrylblends app; no listing offers a way to start from it until it is. */
  status?: "converting";
}

export type { RegistryEntry };
type Discovered = Omit<RegistryEntry, "kind"> & { kind: string };
/** The entries in registry/blends/ (ours, reviewed) and the Blends found in their own repositories; an id in registry/blends/ is never discovered twice. */
export const entries: RegistryEntry[] = [
  ...(index as { entries: Omit<RegistryEntry, "origin">[] }).entries.map((entry) => ({ ...entry, origin: "official" as const })),
  ...(discovered.entries as Discovered[]).map((entry) => entry as RegistryEntry),
];

/** Where an entry's file is served: from this site for an entry in registry/blends/, from its own repository at its tag for a discovered one. */
export function fileUrl(entry: RegistryEntry, file: string): string {
  if (entry.repository && entry.ref) return `${entry.repository.replace("https://github.com/", "https://raw.githubusercontent.com/")}/${encodeURIComponent(entry.ref)}/${file}`;
  return `/registry/${entry.path}/${file}`;
}

export function OriginBadge({ entry }: { entry: RegistryEntry }) {
  return <Status tone={entry.origin === "official" ? "success" : "default"}>{entry.origin === "official" ? "Official" : "Community"}</Status>;
}

export type OriginFilter = Origin | "all";
const ORIGINS: { value: OriginFilter; label: string }[] = [{ value: "all", label: "All" }, { value: "official", label: "Official" }, { value: "community", label: "Community" }];

/** All (the default), Official or Community; the counts are of the list it filters. */
export function OriginChips({ value, onChange, list }: { value: OriginFilter; onChange: (value: OriginFilter) => void; list: readonly { origin: Origin }[] }) {
  return <div role="group" aria-label="Who made it" className="flex flex-wrap gap-2">{ORIGINS.map(o => <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} className={`border px-3 py-1.5 font-mono text-xs ${value === o.value ? "border-foreground bg-foreground text-background" : "border-input text-muted-foreground hover:text-foreground"}`}>{o.label} · {o.value === "all" ? list.length : list.filter(e => e.origin === o.value).length}</button>)}</div>;
}

/** The entries the filter keeps, official first; the order within each stays as it was. */
export function byOrigin<T extends { origin: Origin }>(list: readonly T[], filter: OriginFilter): T[] {
  return list.filter(e => filter === "all" || e.origin === filter).sort((a, b) => Number(b.origin === "official") - Number(a.origin === "official"));
}

/** An entry's docs/screenshot.png, served from the registry like its blend.yaml; an entry without one shows nothing (the image hides itself when it does not load). */
export function Screenshot({ entry, className = "" }: { entry: RegistryEntry; className?: string }) {
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  return <img src={fileUrl(entry, "docs/screenshot.png")} alt={`${entry.name}, the first page`} loading="lazy" onError={() => setShown(false)} className={`block w-full border border-border bg-surface object-cover object-top ${className}`}/>;
}

/** One screen of a Blend: a file in its docs/ folder and a line saying what it shows. */
export interface Screen { readonly file: string; readonly caption: string }

/** An entry's screens, in order, from its docs/screenshots.json (`{ "screens": [{ "file": "canvas.png", "caption": "..." }] }`); an entry without the list has its docs/screenshot.png alone. */
export function useScreens(entry: RegistryEntry): readonly Screen[] {
  const fallback: readonly Screen[] = [{ file: "screenshot.png", caption: `${entry.name}, the first page` }];
  const [screens, setScreens] = useState<readonly Screen[]>(fallback);
  useEffect(() => {
    setScreens(fallback);
    fetch(fileUrl(entry, "docs/screenshots.json")).then(r => r.ok ? r.json() : Promise.reject())
      .then((list: { screens?: Screen[] }) => { const valid = (list.screens ?? []).filter(s => typeof s.file === "string" && /^[\w.-]+\.(png|jpe?g|webp|gif)$/i.test(s.file)); if (valid.length) setScreens(valid); }, () => undefined);
  }, [entry.id]);
  return screens;
}

/** Every screen of a Blend as a slider: arrows, keys, swipe and thumbnails, so a visitor sees what the app is before reading about it. A screen that does not load drops out. */
export function Gallery({ entry, className = "" }: { entry: RegistryEntry; className?: string }) {
  const all = useScreens(entry);
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const screens = all.filter(s => !broken.has(s.file));
  const [at, setAt] = useState(0);
  const touch = useRef<number | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => { strip.current?.children[at]?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); }, [at]);
  if (screens.length === 0) return null;
  const i = Math.min(at, screens.length - 1);
  const count = screens.length;
  const go = (step: number) => setAt(a => (Math.min(a, count - 1) + step + count) % count);
  const screen = screens[i];
  const url = (s: Screen) => fileUrl(entry, `docs/${s.file}`);
  const drop = (s: Screen) => setBroken(b => new Set(b).add(s.file));
  const many = screens.length > 1;
  return <section aria-roledescription="carousel" aria-label={`${entry.name} screens`} className={className} tabIndex={0} onKeyDown={e => { if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); }}>
    <div className="relative border border-border bg-surface" onTouchStart={e => { touch.current = e.touches[0].clientX; }} onTouchEnd={e => { const from = touch.current; touch.current = null; if (from === null) return; const dx = e.changedTouches[0].clientX - from; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); }}>
      <a href={url(screen)} target="_blank" rel="noreferrer" title="Open full size"><img src={url(screen)} alt={screen.caption} onError={() => drop(screen)} className="block aspect-[16/10] w-full object-contain"/></a>
      {many && <><button type="button" aria-label="Previous screen" onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 border border-border bg-background/90 p-2 hover:bg-background"><ChevronLeft size={18}/></button><button type="button" aria-label="Next screen" onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 border border-border bg-background/90 p-2 hover:bg-background"><ChevronRight size={18}/></button></>}
    </div>
    <div className="mt-3 flex items-baseline justify-between gap-4"><p className="text-sm leading-6" aria-live="polite">{screen.caption}</p>{many && <span className="shrink-0 font-mono text-xs text-muted-foreground">{i + 1} / {screens.length}</span>}</div>
    {many && <div ref={strip} className="mt-3 flex gap-2 overflow-x-auto pb-1">{screens.map((s, n) => <button key={s.file} type="button" aria-label={s.caption} aria-current={n === i} onClick={() => setAt(n)} className={`shrink-0 border ${n === i ? "border-foreground" : "border-border opacity-60 hover:opacity-100"}`}><img src={url(s)} alt="" loading="lazy" onError={() => drop(s)} className="block h-16 w-28 object-cover object-top"/></button>)}</div>}
  </section>;
}

export function runtimeOf(entry: RegistryEntry): Runtime { return entry.runtime === "acrylblends" ? "acrylblends" : "acryl"; }

/** The command that starts a project from an entry: for acrylblends, @acryldev/create-blends (npm needs the `--`); an ACRYL starter opens in the ACRYL app, and its CLI form is shown as it is. */
export function startCommand(entry: RegistryEntry): string {
  if (runtimeOf(entry) === "acrylblends") return `npm create @acryldev/blends my-app -- --from ${entry.source ?? entry.id}`;
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
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const shown = byOrigin(entries.filter(entry => entry.id !== CORE_ID && (filter === "all" || runtimeOf(entry) === filter)), origin);
  return <section className="mx-auto max-w-[1440px] px-5 pt-12 md:px-8">
    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div><h2 className="text-2xl font-semibold">Start here: in the registry now</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Real starting points you can create a project from today. The project is yours: private and proprietary until you decide otherwise. <code>npm create acrylblends</code> is the short alias of <code>npm create @acryldev/blends</code>.</p></div>
      <a href="/registry/index.json" className="font-mono text-xs text-muted-foreground hover:text-foreground">index.json · {entries.length} {entries.length === 1 ? "entry" : "entries"}</a>
    </div>
    <div role="group" aria-label="Filter by runtime" className="mt-6 flex flex-wrap gap-2">
      {FILTERS.map(f => <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)} className={`border px-3 py-1.5 font-mono text-xs ${filter === f.value ? "border-foreground bg-foreground text-background" : "border-input text-muted-foreground hover:text-foreground"}`}>{f.label} · {f.value === "all" ? entries.length : entries.filter(entry => runtimeOf(entry) === f.value).length}</button>)}
    </div>
    <div className="mt-3"><OriginChips value={origin} onChange={setOrigin} list={entries}/></div>
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {shown.map(entry => <article key={entry.id} className="min-w-0 border border-border bg-background p-6">
        <div className="flex flex-wrap gap-2"><OriginBadge entry={entry}/><Status tone={runtimeOf(entry) === "acrylblends" ? "success" : "default"}>{runtimeOf(entry) === "acrylblends" ? "acrylblends app" : "ACRYL app starter"}</Status><Status tone="success">{level(entry)}</Status>{entry.category && <Status>{entry.category}</Status>}<Status>v{entry.version}</Status><Status>{entry.license}</Status></div>
        <h3 className="mt-5 text-2xl font-semibold"><Link to={blendPath(entry.id)} className="hover:text-accent-foreground">{entry.name}</Link></h3>
        {entry.description && <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{entry.description}</p>}
        {entry.origin === "community" && <p className="mt-2 font-mono text-[11px] text-muted-foreground">by @{entry.publisher}</p>}
        {entry.parent && <p className="mt-3 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">grew from {entry.parent} <ArrowRight size={12}/> {entry.id}</p>}
        <div className="mt-5">{entry.status === "converting"
          ? <p className="border border-border bg-muted px-4 py-3 text-sm leading-6 text-muted-foreground" data-test="converting"><strong className="text-foreground">Being converted to an acrylblends app.</strong> It starts from nothing yet: <code>create-acrylblends</code>, Control Center and Deploy to WebBoxes.ai will offer it as soon as it is.</p>
          : <><CodeBlock label={runtimeOf(entry) === "acrylblends" ? "Start a project" : "Start a project in the ACRYL app"} code={startCommand(entry)}/>{runtimeOf(entry) === "acryl" && <p className="mt-2 text-xs leading-5 text-muted-foreground">Runs only inside the ACRYL app. <code>create-acrylblends</code> makes acrylblends apps and refuses this one.</p>}</>}</div>
      </article>)}
    </div>
  </section>;
}
