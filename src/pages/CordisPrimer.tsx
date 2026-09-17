import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Compass, Hammer, Wrench } from "lucide-react";
import { PageIntro, SiteLayout, usePageMeta } from "../components/layouts";
import { cordisGroups } from "../lib/cordis-tutorial";
import { slugify } from "../lib/content";

const icons = [BookOpen, Compass, Hammer, Wrench];

export default function CordisPrimer() {
  usePageMeta("Cordis Primer", "The exhaustive Cordis and Harness developer curriculum — tutorial, basics, framework reference, and applied practice — extended with ACRYL's own plugin-authoring bridge.");
  return (
    <SiteLayout>
      <PageIntro
        kicker="Protocol primer — exhaustive edition"
        title="Cordis, in full."
        description="The seven-chapter Cordis tutorial, the Basics/Framework/Practice reference, and the bridge into building a plugin for ACRYL itself — every code sample taken verbatim from the real DeepSeek Harness documentation."
        actions={<a href="https://deepseek-harness.github.io/deepseek-harness/en/develop/cordis-tutorial/" target="_blank" rel="noreferrer" className="btn-secondary">Read the original at the source</a>}
      />
      <section className="mx-auto max-w-[1200px] px-5 py-16 md:px-8">
        <div className="grid gap-4 md:grid-cols-2">
          {cordisGroups.map((g, i) => {
            const Icon = icons[i] ?? BookOpen;
            return (
              <div key={g.slug} className="border border-border p-6">
                <Icon size={19} />
                <h2 className="mt-6 text-xl font-semibold">{g.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{g.description}</p>
                <div className="mt-5 space-y-2">
                  {g.items.map((item) => <Link key={item} to={`/cordis/${g.slug}/${slugify(item)}`} className="group flex items-center justify-between py-1 text-sm text-muted-foreground hover:text-foreground"><span>{item}</span><ArrowRight size={13} className="opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" /></Link>)}
                </div>
                <Link to={`/cordis/${g.slug}`} className="mt-6 inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase">Open section <ArrowRight size={13} /></Link>
              </div>
            );
          })}
        </div>
      </section>
      <section className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-[1200px] flex-col justify-between gap-6 px-5 py-12 md:flex-row md:items-center md:px-8">
          <div>
            <h2 className="text-2xl font-semibold">Where this leads: your own ACRYL plugin.</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">The tutorial's chapter 7 ends by registering a tool against a real tools service — the last item in that section takes the exact same pattern and points it at a real, published ACRYL plugin.</p>
          </div>
          <Link to="/cordis/tutorial/your-first-acryl-harness-plugin" className="btn-primary">Your first ACRYL Harness Plugin <ArrowRight size={15} /></Link>
        </div>
      </section>
    </SiteLayout>
  );
}
