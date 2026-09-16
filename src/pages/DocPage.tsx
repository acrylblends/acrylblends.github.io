import { useParams } from "react-router-dom";
import { DocsShell, Article } from "../components/docs";
import { SiteLayout, usePageMeta } from "../components/layouts";
import { docGroups, slugify } from "../lib/content";

export default function DocPage() {
  const { group: groupSlug, item } = useParams<{ group: string; item?: string }>();
  const group = docGroups.find(g => g.slug === groupSlug) ?? docGroups[0]!;
  const title = group.items.find(i => slugify(i) === item) ?? group.title;
  usePageMeta(title, `ACRYL Blends documentation: ${title}.`);
  return <SiteLayout><DocsShell><Article group={group.title} title={title} contentKey={item ? `${group.slug}/${item}` : undefined} exploratory={group.slug === "nesting-and-composition"}/></DocsShell></SiteLayout>;
}
