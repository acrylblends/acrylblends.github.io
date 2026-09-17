import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { slugify } from "../lib/content";
import { cordisGroups } from "../lib/cordis-tutorial";
import type { CordisEntry } from "../lib/cordis-content";
import { Breadcrumbs } from "./layouts";
import { CodeBlock } from "./ui";

export function CordisShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[280px_1fr]">
      <aside className="hidden border-r border-border px-6 py-10 lg:block">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Cordis Primer</p>
        {cordisGroups.map((g) => (
          <div key={g.slug} className="mt-7">
            <Link to={`/cordis/${g.slug}`} className="text-sm font-semibold hover:text-accent-foreground">{g.title}</Link>
            <div className="mt-2 space-y-1">
              {g.items.map((i) => <Link key={i} to={`/cordis/${g.slug}/${slugify(i)}`} className="block py-1 text-xs leading-5 text-muted-foreground hover:text-foreground">{i}</Link>)}
            </div>
          </div>
        ))}
      </aside>
      <div className="min-w-0 px-5 py-10 md:px-10 lg:px-14">{children}</div>
    </div>
  );
}

export function CordisArticle({ group, title, entry }: { group: string; title: string; entry?: CordisEntry }) {
  return (
    <article className="max-w-3xl">
      <Breadcrumbs items={[{ label: "Cordis Primer", to: "/cordis" }, { label: group }, { label: title }]} />
      <h1 className="mt-6 text-3xl font-semibold leading-tight md:text-5xl">{title}</h1>
      {entry ? (
        <>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">{entry.intro}</p>
          <div className="doc-copy">
            {entry.body.map((section, i) => (
              <div key={i}>
                {section.heading && <h2>{section.heading}</h2>}
                {section.paragraphs.map((p, j) => <p key={j}>{p}</p>)}
                {section.table && (
                  <div className="mt-6 overflow-x-auto border border-border">
                    <table className="w-full min-w-[480px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border bg-surface">
                          {section.table.headers.map((h) => <th key={h} className="px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {section.table.rows.map((row, ri) => (
                          <tr key={ri} className="border-b border-border last:border-0">
                            {row.map((cell, ci) => <td key={ci} className="px-4 py-3 align-top leading-6 text-muted-foreground">{cell}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {section.code?.map((c, ci) => <div key={ci} className="mt-6"><CodeBlock label={c.label} code={c.code} /></div>)}
                {section.note && <div className="doc-note"><strong>Note</strong><p>{section.note}</p></div>}
              </div>
            ))}
          </div>
          <div className="mt-12 flex items-center gap-2 border-t border-border pt-6 font-mono text-xs text-muted-foreground">
            <a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
              {entry.sourceLabel ?? "Read the full page at the source"} <ArrowUpRight size={13} />
            </a>
          </div>
        </>
      ) : (
        <p className="mt-5 text-lg leading-8 text-muted-foreground">This page has not been written yet.</p>
      )}
      <div className="mt-10 flex justify-end"><Link to="/cordis" className="group flex items-center gap-3 text-sm font-semibold">Back to Cordis Primer <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" /></Link></div>
    </article>
  );
}
