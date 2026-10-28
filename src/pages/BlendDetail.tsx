import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowUpRight, Download } from "lucide-react";
import { Breadcrumbs, SiteLayout, usePageMeta } from "../components/layouts";
import { CodeBlock, Status } from "../components/ui";
import { entries, level, type RegistryEntry, runtimeOf, startCommand } from "../components/registry";
import NotFound from "./NotFound";

/** A Blend's page: only the starters that are really in the registry have one, so every page here is something a reader can pull today. */
export default function BlendDetail() {
  const { slug } = useParams();
  const entry = entries.find(x => x.id === slug);
  if (!entry) return <NotFound/>;
  return <RegistryDetail entry={entry}/>;
}

function RegistryDetail({ entry }: { entry: RegistryEntry }) {
  usePageMeta(entry.name, entry.description ?? "ACRYL Blend");
  const file = `/registry/${entry.path}/blend.yaml`;
  const [yaml, setYaml] = useState<string | null>(null);
  useEffect(() => { fetch(file).then(r => r.ok ? r.text() : Promise.reject()).then(setYaml, () => setYaml(null)); }, [file]);
  const command = startCommand(entry);
  return <SiteLayout><section className="border-b border-border bg-surface"><div className="mx-auto max-w-[1200px] px-5 py-14 md:px-8"><Breadcrumbs items={[{ label: "Blends", to: "/blends" }, { label: entry.name }]}/><div className="mt-10 grid gap-8 lg:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap gap-2"><Status tone={runtimeOf(entry) === "acrylblends" ? "success" : "default"}>{runtimeOf(entry) === "acrylblends" ? "acrylblends app" : "ACRYL app starter"}</Status><Status tone="success">{level(entry)}</Status>{entry.category && <Status>{entry.category}</Status>}</div><h1 className="mt-5 text-4xl font-semibold md:text-6xl">{entry.name}</h1>{entry.description && <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">{entry.description}</p>}</div><div className="grid min-w-60 grid-cols-2 border border-border bg-background"><Metric value={entry.version} label="Version"/><Metric value={entry.license} label="License"/><Metric value={entry.kind} label="Kind"/><Metric value={entry.id} label="Id"/><Metric value={runtimeOf(entry)} label="Runtime"/></div></div></div></section><div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-12 md:px-8 lg:grid-cols-[1fr_300px]"><main className="min-w-0"><h2 className="text-2xl font-semibold">Start a project from this</h2><div className="mt-4"><CodeBlock label="Terminal" code={command}/>{runtimeOf(entry) === "acryl" && <p className="mt-3 text-sm leading-6 text-muted-foreground">This is a starter for the ACRYL app: its plugins run only inside it. <code>npm create acrylblends</code> makes acrylblends apps and refuses this one with a line that says so.</p>}</div><h2 className="mt-12 text-2xl font-semibold">blend.yaml</h2><div className="mt-4">{yaml === null ? <p className="text-sm text-muted-foreground">Loading the definition from the registry. <a className="font-semibold underline underline-offset-4" href={file}>Open it directly</a>.</p> : <CodeBlock label="blend.yaml" code={yaml}/>}</div></main><aside className="space-y-6"><Info label="Id" value={entry.id}/><Info label="Version" value={entry.version}/>{entry.parent && <div><span className="font-mono text-[10px] uppercase text-muted-foreground">Grew from</span><p className="mt-1 text-sm font-semibold"><Link to={`/blends/b/${entry.parent}`} className="underline underline-offset-4">{entry.parent}</Link></p></div>}<div className="border-t border-border pt-6"><a href={file} className="flex items-center gap-2 text-sm font-semibold"><Download size={15}/> Raw blend.yaml</a><a href="/registry/index.json" className="mt-4 flex items-center gap-2 text-sm font-semibold"><ArrowUpRight size={15}/> index.json</a></div></aside></div></SiteLayout>;
}
function Metric({ value, label }: { value: string; label: string }) { return <div className="border-b border-r border-border p-4"><strong className="block text-lg">{value}</strong><span className="font-mono text-[10px] uppercase text-muted-foreground">{label}</span></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div><span className="font-mono text-[10px] uppercase text-muted-foreground">{label}</span><p className="mt-1 text-sm font-semibold">{value}</p></div>; }
