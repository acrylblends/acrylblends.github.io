// The pure part of scripts/sync-products.ts: which product tag a deploy should take, and the decision per entry. The CLI downloads the
// monorepo tarball at that tag, copies the app's folder into registry/blends/<id>/, and writes index.json; these functions are what its tests
// exercise, with an injected tag list, never a real tag on acryldev/acryl.
//
// The products are released from acryldev/acryl (spec 051 T013/T032b) and cannot be discovered like a community Blend: one repository
// hosts several products, the release is never GitHub's "latest" (ACRYL's own release is), and blend.yaml sits in apps/<product>/, not at
// the repository root. So their entries are generated here from the tag instead of copied by hand.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

/** One product released from acryldev/acryl: its entry id, its folder at the tag, and its tag prefix (`ade-v0.1.21`). */
export interface Product {
  readonly id: string;
  readonly folder: string;
  readonly tagPrefix: string;
}

export const PRODUCTS: readonly Product[] = [
  { id: "acryl.ade", folder: "apps/acryl-ade", tagPrefix: "ade-v" },
  { id: "acryl.control-center", folder: "apps/acryl-control-center", tagPrefix: "control-center-v" },
];

/** The version a product tag names (`ade-v0.1.21` -> `0.1.21`); undefined when the tag is not this product's or is not a plain version. */
export function tagVersion(tag: string, prefix: string): string | undefined {
  if (!tag.startsWith(prefix)) return undefined;
  const version = tag.slice(prefix.length);
  return /^\d+(?:\.\d+){0,2}$/u.test(version) ? version : undefined;
}

/**
 * Compare two plain versions as numeric dot parts. shortcut: no prerelease ordering (`ade-v1.0.0-rc.1` does not parse at all); upgrade when a
 * product ships a prerelease tag.
 */
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** The highest version among one product's tags, or undefined when it has none. */
export function highestTag(tags: readonly string[], prefix: string): { tag: string; version: string } | undefined {
  let best: { tag: string; version: string } | undefined;
  for (const tag of tags) {
    const version = tagVersion(tag, prefix);
    if (version === undefined) continue;
    if (best === undefined || compareVersions(version, best.version) > 0) best = { tag, version };
  }
  return best;
}

/** What a deploy does with one entry: take this tag, or leave the entry exactly as it is. */
export interface Decision {
  readonly product: Product;
  /** The newest tag of this product, when it has one. */
  readonly tag?: { tag: string; version: string };
  /** The entry's metadata.version, when it has a readable one. */
  readonly current?: string;
  /** The entry is behind the tag and must be generated from it. */
  readonly update: boolean;
}

/** One decision per product: update only when a tag exists and is newer than the entry's own version. */
export function decide(
  tags: readonly string[],
  entryVersion: (product: Product) => string | undefined,
  products: readonly Product[] = PRODUCTS,
): Decision[] {
  return products.map((product) => {
    const tag = highestTag(tags, product.tagPrefix);
    const current = entryVersion(product);
    return {
      product,
      ...(tag === undefined ? {} : { tag }),
      ...(current === undefined ? {} : { current }),
      update: tag !== undefined && (current === undefined || compareVersions(tag.version, current) > 0),
    };
  });
}

/** What the registry README leaves out of an entry, plus the dot files an app keeps for itself. */
const SKIP = new Set([".acryl", ".acrylblends", ".DS_Store", ".git", ".github", "data", "dist", "node_modules"]);

/** Copy one app folder as its registry entry: `.gitignore` is the entry's `gitignore`, and `docs/framework/` stays out. */
export function copyEntry(source: string, target: string): void {
  rmSync(target, { recursive: true, force: true });
  const walk = (from: string, to: string) => {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (SKIP.has(entry.name) || entry.isSymbolicLink()) continue;
      const path = join(from, entry.name);
      // create adds docs/framework back from the framework; the entry never carries it.
      if (entry.name === "framework" && basename(to) === "docs") continue;
      const name = entry.name === ".gitignore" ? "gitignore" : entry.name;
      if (entry.isDirectory()) walk(path, join(to, name));
      else if (entry.isFile()) copyFileSync(path, join(to, name));
    }
  };
  walk(source, target);
}

/** Set metadata.version in an entry's blend.yaml, keeping every other line (and comment) as the app wrote it. */
export function setVersion(file: string, version: string): void {
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex(line => /^metadata:\s*$/u.test(line));
  for (let index = start + 1; start >= 0 && index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^\S/u.test(line)) break;
    if (/^\s+version:\s*\S.*$/u.test(line)) {
      lines[index] = line.replace(/^(\s+)version:\s*\S.*$/u, `$1version: ${version}`);
      writeFileSync(file, lines.join("\n"));
      return;
    }
  }
  throw new Error(`${file} has no metadata.version to set`);
}

/** What {@link runDecisions} needs, injected so the tests never touch the network or the real registry. */
export interface RunDeps {
  readonly copy: (product: Product, tag: string, version: string) => void;
  readonly log: (line: string) => void;
  /** Writes index.json for the regenerated tree; returns the registry's refusal lines, if any. */
  readonly writeIndex: () => readonly string[];
}

/** Apply the decisions: regenerate the entries that are behind their tag, then rewrite index.json. Returns the refusal lines, if any. */
export function runDecisions(decisions: readonly Decision[], deps: RunDeps): string[] {
  const generated: string[] = [];
  for (const decision of decisions) {
    const { product, tag } = decision;
    if (tag === undefined) {
      deps.log(`no ${product.tagPrefix}* tag yet; registry/blends/${product.id} is left as it is`);
      continue;
    }
    if (!decision.update) {
      deps.log(`kept registry/blends/${product.id}: ${decision.current ?? "its version"} is not behind ${tag.tag}`);
      continue;
    }
    deps.copy(product, tag.tag, tag.version);
    deps.log(`generated registry/blends/${product.id} from ${tag.tag}`);
    generated.push(product.id);
  }
  // Nothing was generated: index.json and the entries stay exactly as committed.
  return generated.length === 0 ? [] : [...deps.writeIndex()];
}
