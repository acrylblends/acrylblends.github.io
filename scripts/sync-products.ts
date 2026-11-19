#!/usr/bin/env bun
// sync-products: the registry entries of the Blends released from acryldev/acryl (tags ade-v*, control-center-v*) are generated here from the
// tag, never copied by hand. Every deploy and every hour it reads that repository's tags; for a product whose tag is newer than its entry it
// downloads the monorepo tarball at the tag, copies apps/<product>/ over registry/blends/<id>/ under the registry's own file rules (.gitignore
// as gitignore; no node_modules/, dist/, data/, .git/, .github/, .acryl/, .acrylblends/, docs/framework/), sets metadata.version from the tag,
// and writes index.json with the same tool and checks as registry-index.ts. With no tag yet both entries stay byte-identical.
//
// The entries' dependencies pin `@acrylblends/web` at a 0.1 caret, which does not take 0.2.0, so their `acryl-web` row stays consistent with
// what they install until the first product tag regenerates them here.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { copyEntry, decide, type Product, PRODUCTS, runDecisions, setVersion } from "./lib/sync-products.ts";
import { indexText } from "./registry-index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const registry = resolve(here, "..", "registry");
const entryDir = (product: Product) => join(registry, "blends", product.id);
const fail = (message: string): never => {
  throw new Error(message);
};

/** The entry's metadata.version, or undefined when it has none. */
function entryVersion(product: Product): string | undefined {
  try {
    const manifest = parse(readFileSync(join(entryDir(product), "blend.yaml"), "utf8")) as { metadata?: { version?: unknown } } | null;
    return typeof manifest?.metadata?.version === "string" ? manifest.metadata.version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The tags of one product, by prefix. The matching-refs endpoint answers only the refs below that prefix, so no page cap can hide a product
 * behind the hundreds of framework and launcher tags in this repository (the plain tags list is by name, not by date).
 */
async function productTags(prefix: string): Promise<string[]> {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(`https://api.github.com/repos/acryldev/acryl/git/matching-refs/tags/${encodeURIComponent(prefix)}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "acrylblends-registry (+https://acrylblends.github.io)",
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`the ${prefix} tags of acryldev/acryl answered ${response.status}`);
  const refs = (await response.json()) as { ref: string }[];
  return refs.map(item => item.ref.replace(/^refs\/tags\//u, ""));
}

/** The app folder of one product at one tag, extracted under the run's temporary folder. */
async function extract(product: Product, tag: string, work: string): Promise<string> {
  const response = await fetch(`https://codeload.github.com/acryldev/acryl/tar.gz/refs/tags/${encodeURIComponent(tag)}`, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`${tag} answered ${response.status}`);
  const archive = join(work, "acryl.tar.gz");
  writeFileSync(archive, new Uint8Array(await response.arrayBuffer()));
  const tree = join(work, "tree");
  mkdirSync(tree, { recursive: true });
  const tar = Bun.spawnSync({ cmd: ["tar", "-xzf", archive, "-C", tree] });
  if (tar.exitCode !== 0) throw new Error(`${tag}: tar failed: ${tar.stderr.toString()}`);
  const [top] = readdirSync(tree);
  if (top === undefined) throw new Error(`${tag}: the archive is empty`);
  const source = join(tree, top, product.folder);
  const manifest = parse(readFileSync(join(source, "blend.yaml"), "utf8")) as { metadata?: { id?: unknown } } | null;
  if (manifest?.metadata?.id !== product.id) throw new Error(`${product.folder} at ${tag} is ${String(manifest?.metadata?.id)}, not ${product.id}`);
  return source;
}

const work = mkdtempSync(join(tmpdir(), "sync-products-"));
try {
  const decisions = decide((await Promise.all(PRODUCTS.map(product => productTags(product.tagPrefix)))).flat(), entryVersion);
  // Download and unpack first: runDecisions stays synchronous, and a failed download leaves every entry untouched.
  const sources = new Map<string, string>();
  for (const decision of decisions)
    if (decision.update && decision.tag !== undefined) sources.set(decision.product.id, await extract(decision.product, decision.tag.tag, work));
  const problems = runDecisions(decisions, {
    copy: (product, tag, version) => {
      copyEntry(sources.get(product.id) ?? fail(`no source was downloaded for ${product.id}`), entryDir(product));
      setVersion(join(entryDir(product), "blend.yaml"), version);
    },
    log: line => console.log(line),
    writeIndex: () => {
      const { text, problems } = indexText(registry);
      if (problems.length === 0) writeFileSync(join(registry, "index.json"), text);
      return problems;
    },
  });
  for (const problem of problems) console.log(`refused ${problem}`);
  if (problems.length > 0) process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
