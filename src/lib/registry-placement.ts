// Where each published starter sits in the site's 100-category taxonomy. The registry's own index.json carries the publisher's short category
// (starter, finance, productivity, ...), which is not the taxonomy; this map is the site's presentation of it and is written by hand when an entry lands.
export interface Placement {
  category: string;
  subcategory: string;
}

/** The entries that have a taxonomy placement, with it; an entry without one is not shown in the browser until someone places it. */
export function placeEntries<T extends { id: string }>(entries: readonly T[]): Array<{ entry: T; placement: Placement }> {
  return entries
    .map((entry) => ({ entry, placement: registryPlacement[entry.id] }))
    .filter((item): item is { entry: T; placement: Placement } => item.placement !== undefined);
}

export const registryPlacement: Record<string, Placement> = {
  "acryl.blank": { category: "Software Factories", subcategory: "AI software factories" },
  "acryl.accounting": { category: "Business", subcategory: "Finance" },
  "acryl.gtd": { category: "Application", subcategory: "Productivity" },
  "acryl.music": { category: "Media", subcategory: "Music" },
  "acryl.orderdesk": { category: "E-commerce", subcategory: "Order management" },
  "acryl.organizer": { category: "Application", subcategory: "Productivity" },
};
