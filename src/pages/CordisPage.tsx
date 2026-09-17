import { useParams } from "react-router-dom";
import { CordisShell, CordisArticle } from "../components/cordis-docs";
import { SiteLayout, usePageMeta } from "../components/layouts";
import { cordisGroups } from "../lib/cordis-tutorial";
import { cordisContent } from "../lib/cordis-content";
import { slugify } from "../lib/content";

export default function CordisPage() {
  const { group: groupSlug, item } = useParams<{ group: string; item?: string }>();
  const group = cordisGroups.find((g) => g.slug === groupSlug) ?? cordisGroups[0]!;
  const title = group.items.find((i) => slugify(i) === item) ?? group.title;
  usePageMeta(title, `Cordis Primer: ${title}.`);
  const entry = item ? cordisContent[`${group.slug}/${item}`] : undefined;
  return (
    <SiteLayout>
      <CordisShell>
        <CordisArticle group={group.title} title={title} entry={entry} />
      </CordisShell>
    </SiteLayout>
  );
}
