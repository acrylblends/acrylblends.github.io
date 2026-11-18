// The pure parts of sync-blends.ts: who counts as official, the blocklist, and where a discovered Blend sits in the site's categories.
import { categories } from "../../src/lib/content.ts";

export type Origin = "official" | "community";
export interface Official { owners: { login: string; id: number }[]; reservedIdPrefixes: string[] }
export interface Blocklist { owners: string[]; repositories: string[] }
export interface Placement { category: string; subcategory?: string }

/** Official when the repository's owner, by its numeric GitHub id (a login can be renamed and taken), is one of ours. Nothing the author writes changes it. */
export const originOf = (ownerId: number | undefined, official: Official): Origin =>
  official.owners.some(owner => owner.id === ownerId) ? "official" : "community";

/** Why a community Blend's id may not be listed: it starts with one of our id prefixes. Undefined when it may. */
export function reservedIdReason(id: string, official: Official): string | undefined {
  const prefix = official.reservedIdPrefixes.find(reserved => id.toLowerCase().startsWith(reserved));
  return prefix === undefined ? undefined : `its id ${id} starts with ${prefix}, which only official repositories may use`;
}

/** Why a repository is left out by blocklist.json (an owner or one owner/repo, any case). Undefined when it is not on it. */
export function blockedReason(fullName: string, blocklist: Blocklist): string | undefined {
  const lower = fullName.toLowerCase();
  const owner = lower.split("/")[0];
  if (blocklist.owners.some(blocked => blocked.toLowerCase() === owner)) return `its owner ${owner} is on the blocklist`;
  if (blocklist.repositories.some(blocked => blocked.toLowerCase() === lower)) return "it is on the blocklist";
  return undefined;
}

/**
 * The category is blend.yaml's `metadata.category`, matched to one of /blends' categories by its address (`gaming`, `e-commerce`) or its name. The
 * subcategory is optional: a repository topic that is one of that category's subcategory addresses (`games`). A string is the reason it cannot be placed.
 */
export function placementOf(category: string | undefined, topics: readonly string[]): Placement | string {
  if (category === undefined) return "its blend.yaml names no metadata.category";
  const wanted = category.toLowerCase();
  const found = categories.find(c => c.slug === wanted || c.name.toLowerCase() === wanted);
  if (found === undefined) return `its category ${category} is not one of the categories on acrylblends.github.io/blends (use the last part of a category's address, such as gaming)`;
  const sub = found.subs.find(s => topics.includes(s.slug));
  return sub === undefined ? { category: found.name } : { category: found.name, subcategory: sub.name };
}
