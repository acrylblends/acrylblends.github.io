import { Link, useParams } from "react-router-dom";
import { Markdown } from "../components/markdown";
import { SiteLayout, usePageMeta } from "../components/layouts";
import { docUrl, keyFromUrl, nav, pages } from "../lib/framework-docs";
import NotFound from "./NotFound";

/** The framework docs at /docs: the sidebar lists every page, the body is the page's markdown. */
export default function FrameworkDocPage() {
  const { "*": splat } = useParams();
  const key = keyFromUrl(splat);
  const page = pages.get(key);
  usePageMeta(page?.title ?? "Documentation", `Acryl framework documentation: ${page?.title ?? "pages"}.`);
  if (!page) return <NotFound/>;
  const order = nav.flatMap((section) => section.keys);
  const at = order.indexOf(key);
  const previous = at > 0 ? pages.get(order[at - 1]!) : undefined;
  const next = at >= 0 ? pages.get(order[at + 1] ?? "") : undefined;
  const sidebar = <nav aria-label="Documentation">{nav.map((section) => <div key={section.title} className="mt-6 first:mt-0"><p className="font-mono text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{section.title}</p><div className="mt-2 space-y-0.5">{section.keys.map((k) => <Link key={k} to={docUrl(k)} aria-current={k === key ? "page" : undefined} className={`block py-1 text-[13px] leading-5 ${k === key ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{pages.get(k)?.title}</Link>)}</div></div>)}</nav>;
  return <SiteLayout><div className="mx-auto grid max-w-[1440px] lg:grid-cols-[270px_1fr]"><aside className="hidden border-r border-border px-6 py-10 lg:block">{sidebar}</aside><div className="min-w-0 px-5 py-10 md:px-10 lg:px-14"><details className="mb-8 border border-border p-3 lg:hidden"><summary className="cursor-pointer text-sm font-semibold">Documentation menu</summary><div className="mt-4">{sidebar}</div></details><article className="max-w-3xl"><Markdown key={key} pageKey={key}>{page.markdown}</Markdown>
    <div className="mt-14 flex justify-between gap-6 border-t border-border pt-6 text-sm font-semibold">{previous ? <Link to={docUrl(previous.key)}>&larr; {previous.title}</Link> : <span/>}{next ? <Link to={docUrl(next.key)}>{next.title} &rarr;</Link> : <span/>}</div></article></div></div></SiteLayout>;
}
