import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Boxes, Compass, Hammer, Wrench } from "lucide-react";
import { PageIntro, SiteLayout, usePageMeta } from "../components/layouts";
import { cordisGroups } from "../lib/cordis-tutorial";
import { slugify } from "../lib/content";

const icons = [BookOpen, Compass, Boxes, Hammer, Wrench];

export default function CordisPrimer() {
  usePageMeta("Cordis Primer", "The exhaustive Cordis and Harness developer curriculum — the four-part ACRYL curriculum plus a standalone framework reference — every code sample taken verbatim from the real DeepSeek Harness documentation.");
  return (
    <SiteLayout>
      <PageIntro
        kicker="Protocol primer — exhaustive edition"
        title="Cordis, in full."
        description="Cordis core, ACRYL Harness basics, ACRYL's own built-in services, and applied practice — plus a standalone framework reference for lookup. Every code sample taken verbatim from the real DeepSeek Harness documentation."
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
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">Part 1's chapter 7 ends by registering a tool against a real tools service — Part 2 opens with the exact same pattern pointed at a real, published ACRYL plugin.</p>
          </div>
          <Link to="/cordis/basics/your-first-acryl-harness-plugin" className="btn-primary">Your first ACRYL Harness Plugin <ArrowRight size={15} /></Link>
        </div>
      </section>
    </SiteLayout>
  );
}
