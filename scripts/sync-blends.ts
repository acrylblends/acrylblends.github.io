#!/usr/bin/env bun
// sync-blends: write registry/discovered.json, the Blends that live in their own public repositories: every repository with the topic
// `acrylblends-blend` whose blend.yaml, at its latest release (else its newest tag), passes the same checks as an entry in registry/blends/
// (@acryl/blends-core's validation, public, licensed) and is an app create-acrylblends can start from (`--from github:owner/repo#tag`).
// Each is marked official or community by its owner (official-owners.json), minus blocklist.json. Anything that cannot be listed is left out
// with its reason in the log; the site never breaks because of one repository. The entries in registry/blends/ stay as they are and win over a
// discovered one with the same id. Runs in the Pages workflow on each push, by hand and every hour: the hour is how a Blend published anywhere
// appears here without anyone pushing to this repository. BLENDS_CORE points at blends-core's src (CI checks it out into .acryl/).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { MARKER, packageProblems, templateProblems } from "./lib/entry-checks.ts";
import { blockedReason, keywordPlacement, originOf, placementOf, reservedIdReason, type Blocklist, type Official } from "./lib/discover-blends.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const core = process.env.BLENDS_CORE ?? join(root, ".acryl", "runtime", "blends-core", "src");
const { buildRegistryIndex } = (await import(join(core, "registry.ts"))) as {
  buildRegistryIndex(sources: { path: string; manifestText: string }[]): { index: { entries: Record<string, unknown>[] }; problems: { path: string; message: string }[] };
};
const read = <T>(file: string): T => JSON.parse(readFileSync(join(root, file), "utf8")) as T;
const official = read<Official>("official-owners.json");
const blocklist = read<Blocklist>("blocklist.json");
const listed = new Set(read<{ entries: { id: string }[] }>("registry/index.json").entries.map(entry => entry.id));

const TOPIC = "acrylblends-blend";
const headers: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "User-Agent": "acrylblends-sync (+https://acrylblends.github.io)",
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

async function get(url: string, json = true): Promise<unknown> {
  const response = await fetch(url, { headers: json ? headers : { "User-Agent": headers["User-Agent"] as string }, signal: AbortSignal.timeout(20_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return json ? response.json() : response.text();
}

interface Repository { full_name: string; html_url: string; fork: boolean; topics?: string[]; owner: { login: string; id: number } }

const repositories: Repository[] = [];
for (let page = 1; page <= 10; page += 1) {
  const result = (await get(`https://api.github.com/search/repositories?q=${encodeURIComponent(`topic:${TOPIC} is:public archived:false`)}&per_page=100&page=${page}`)) as { items?: Repository[] } | null;
  if (!Array.isArray(result?.items)) throw new Error("GitHub returned an invalid search result");
  repositories.push(...result.items);
  if (result.items.length < 100) break;
}

const entries: Record<string, unknown>[] = [];
let skipped = 0;
const skip = (repository: Repository, reason: string) => {
  skipped += 1;
  console.warn(`skipped ${repository.full_name}: ${reason}`);
};
for (const repository of repositories) {
  try {
    const name = repository.full_name;
    const blocked = blockedReason(name, blocklist);
    if (blocked !== undefined) { skip(repository, blocked); continue; }
    const origin = originOf(repository.owner.id, official);
    // A release names the version people start from; a tag is enough. A fork has neither of its own until its owner makes one.
    const release = (await get(`https://api.github.com/repos/${name}/releases/latest`)) as { tag_name: string; published_at?: string } | null;
    const tags = release === null ? ((await get(`https://api.github.com/repos/${name}/tags?per_page=1`)) as { name: string }[] | null) : null;
    const ref = release?.tag_name ?? tags?.[0]?.name;
    if (ref === undefined) { skip(repository, repository.fork ? "a fork without its own release or tag" : "no release or tag"); continue; }
    const raw = (file: string) => get(`https://raw.githubusercontent.com/${name}/${encodeURIComponent(ref)}/${file}`, false) as Promise<string | null>;
    const manifestText = await raw("blend.yaml");
    if (manifestText === null) { skip(repository, `no blend.yaml at ${ref}`); continue; }
    const metadata = (parse(manifestText) as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    const id = String(metadata.id ?? "");
    const { index, problems } = buildRegistryIndex([{ path: `blends/${id}`, manifestText }]);
    const entry = index.entries[0];
    if (problems.length > 0 || entry === undefined) { skip(repository, `blend.yaml at ${ref}: ${problems.map(p => p.message).join("; ")}`); continue; }
    if (metadata.visibility !== "public") { skip(repository, "its blend.yaml is not visibility: public"); continue; }
    if (typeof metadata.description !== "string") { skip(repository, "its blend.yaml has no metadata.description"); continue; }
    const reserved = origin === "community" ? reservedIdReason(id, official) : undefined;
    if (reserved !== undefined) { skip(repository, reserved); continue; }
    if (listed.has(id)) { skip(repository, `${id} is already in registry/blends`); continue; }
    if (entries.some(e => e.id === id)) { skip(repository, `${id} is already listed from another repository`); continue; }
    const template = await raw(MARKER);
    if (template === null) { skip(repository, `no ${MARKER} at ${ref}, so create-acrylblends cannot start from it`); continue; }
    const pkg = await raw("package.json");
    const appProblems = [...templateProblems(template), ...(pkg === null ? ["has no package.json"] : packageProblems(pkg))];
    if (appProblems.length > 0) { skip(repository, appProblems.join("; ")); continue; }
    // The place ACRYL's share writes into package.json wins; blend.yaml's category with a subcategory topic is the older way, still read.
    const placement = keywordPlacement((JSON.parse(pkg as string) as { keywords?: unknown }).keywords)
      ?? placementOf(typeof metadata.category === "string" ? metadata.category : undefined, repository.topics ?? []);
    if (typeof placement === "string") { skip(repository, placement); continue; }
    entries.push({
      ...entry,
      runtime: "acrylblends",
      origin,
      publisher: repository.owner.login,
      repository: repository.html_url,
      ref,
      source: `github:${name}#${ref}`,
      placement,
      ...(release?.published_at ? { published: release.published_at.slice(0, 10) } : {}),
    });
  } catch (cause) {
    skip(repository, cause instanceof Error ? cause.message : String(cause));
  }
}
entries.sort((a, b) => String(a.id).localeCompare(String(b.id)));
writeFileSync(join(root, "registry", "discovered.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), topic: TOPIC, searched: repositories.length, entries }, null, 2)}\n`);
const count = (origin: string) => entries.filter(e => e.origin === origin).length;
console.log(`${entries.length} Blends among ${repositories.length} repositories with the topic ${TOPIC} (${count("official")} official, ${count("community")} community, ${skipped} skipped)`);
