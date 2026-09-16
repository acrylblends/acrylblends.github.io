import { useParams } from "react-router-dom";
import { Article } from "../components/docs";
import { SiteLayout, usePageMeta } from "../components/layouts";

export default function EcosystemPage() {
  const { page } = useParams();
  const raw = page ?? "ecosystem";
  const title = raw.replaceAll("-", " ").replace(/\b\w/g, c => c.toUpperCase());
  usePageMeta(title, "How the ACRYL Blends ecosystem fits together.");
  return <SiteLayout><div className="mx-auto max-w-[1000px] px-5 py-14 md:px-8"><Article group="Ecosystem" title={title} contentKey={raw} exploratory={raw === "roadmap"}/></div></SiteLayout>;
}
