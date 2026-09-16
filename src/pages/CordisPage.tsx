import { useParams } from "react-router-dom";
import { Article } from "../components/docs";
import { SiteLayout, usePageMeta } from "../components/layouts";

export default function CordisPage() {
  const { page } = useParams();
  const p = page ?? "cordis";
  const title = p.replaceAll("-", " ").replace(/\b\w/g, c => c.toUpperCase());
  usePageMeta(title, "A concise Cordis protocol guide.");
  return <SiteLayout><div className="mx-auto max-w-[1000px] px-5 py-14 md:px-8"><Article group="Cordis Primer" title={title} contentKey={p}/></div></SiteLayout>;
}
