import { Link } from "react-router-dom";
import { ArrowRight, Upload } from "lucide-react";
import { PageIntro, SiteLayout, usePageMeta } from "../components/layouts";
import { SectionTitle, Status } from "../components/ui";
import { categories } from "../lib/content";
import { frameworkParts } from "../lib/framework-parts";
import { entries, RegistryStarters } from "../components/registry";

export default function BlendsIndex() {
  usePageMeta("Browse Blends", "Every ACRYL Blend is Cordis plugins composed into one running app: the starting points in the registry, and the parts the framework is made of today.");
  return <SiteLayout>
    <PageIntro
      kicker="The registry"
      title="A starting point, not a ceiling."
      description="Every Blend is Cordis plugins composed into one running app. Start from a blueprint, grow it from the inside with an agent, and publish the form that proves useful."
      actions={<>
        <Link to="/docs/blends/building-and-publishing/publish-to-acrylblends" className="btn-primary"><Upload size={15}/> Publish a Blend</Link>
        <span className="self-center font-mono text-xs text-muted-foreground">{entries.length} starters in the registry · {categories.length} categories</span>
      </>}
    />
    <RegistryStarters/>
    <FrameworkMap/>
    <Categories/>
  </SiteLayout>;
}

/** What a Blend is built from today, in spec 049's order: the service a plugin injects, the providers that implement it, and how settled each one is. */
function FrameworkMap() {
  return <section className="border-t border-border">
    <div className="mx-auto max-w-[1440px] px-5 py-16 md:px-8">
      <SectionTitle eyebrow="What a Blend is made of" title="Every capability is one plugin behind one service."
        intro="An app's own plugins depend on the service name (inject), never on which plugin provides it. The framework ships a working default for each row; swapping SQLite for Postgres, Node for a desktop window, or one agent for another is a configuration change, not a rewrite."/>
      <div className="mt-12 border-t border-border">
        {frameworkParts.map((part, i) => <article key={part.layer} className="grid gap-5 border-b border-border py-7 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)_auto] md:gap-10">
          <div>
            <span className="font-mono text-[10px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="mt-2 text-lg font-semibold">{part.layer}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{part.question}</p>
          </div>
          <div className="min-w-0">
            <p className="font-mono text-xs text-accent-foreground">{part.service}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{part.providers.map(provider => <span key={provider} className="inline-flex items-center border border-input bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">{provider}</span>)}</div>
            {part.note && <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{part.note}</p>}
          </div>
          <div className="md:pt-1"><Status tone={part.status === "experimental" ? "warning" : part.status === "optional" ? "default" : "success"}>{part.status}</Status></div>
        </article>)}
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">A provider is accepted by passing its port's conformance suite, whoever wrote it. That is what lets an outside tool (a renderer, an ORM, an auth library, a hosted database) join as one more row without the framework becoming a mess.</p>
        <p className="text-sm leading-6 text-muted-foreground">The same code runs on Node.js 22.19 or newer. Bun is experimental, and the other hosting adapters of the upstream project are not part of 1.0. See <Link to="/docs/getting-started/other-runtimes" className="font-semibold text-foreground underline underline-offset-4">other runtimes</Link>.</p>
      </div>
    </div>
  </section>;
}

/** The software taxonomy the registry is organized around; a category with no Blend yet is still a real address, and says so. */
function Categories() {
  return <section className="border-t border-border bg-surface">
    <div className="mx-auto max-w-[1440px] px-5 py-16 md:px-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <SectionTitle eyebrow="The taxonomy" title="Browse by category" intro="The registry is organized by what software a Blend is for, not by what is trendy. Most categories have no Blend yet; the address is ready before the first publication."/>
        <Link to="/docs/blends/building-and-publishing/publish-to-acrylblends" className="btn-secondary shrink-0">Publish here <ArrowRight size={15}/></Link>
      </div>
      <div className="mt-10 grid border-l border-t border-border sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((c, i) => <Link key={c.slug} to={`/blends/${c.slug}`} className="group border-b border-r border-border bg-background p-5 hover:bg-muted">
          <span className="font-mono text-[10px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
          <h3 className="mt-5 text-base font-semibold">{c.name}</h3>
          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{c.subs.slice(0, 3).join(" · ")}</p>
          <ArrowRight size={14} className="mt-4 transition-transform group-hover:translate-x-1"/>
        </Link>)}
      </div>
    </div>
  </section>;
}
