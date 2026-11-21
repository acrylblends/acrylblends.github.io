#!/usr/bin/env bun
// registry-index <registry folder> [--check]
// What the registry's CI runs. It is @acryl/blends-core's index tool (validate every starter under blends/<id>/blend.yaml, refuse a private, unlicensed, misplaced or repeated one,
// write index.json) plus two things the format does not carry: the runtime an entry is for, and its `origin` (always "official" here: the entry lives in the acrylblends organisation's registry).
//   - An entry with an `acryl.template.json` is a whole app for acrylblends (`runtime: acrylblends`): `npm create acrylblends@latest my-app -- --from <id>` makes it. It is checked
//     further: the template manifest, a package.json without install scripts, src/, no links, no node_modules or .git, size limits, and nothing that looks like a key.
//   - Every other entry is a starter for the ACRYL app (`runtime: acryl`).
// With --check nothing is written and a stale index fails. BLENDS_CORE points at blends-core's src (CI checks it out into .acryl/).
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MARKER, packageProblems, templateProblems } from "./lib/entry-checks.ts";

const here = dirname(fileURLToPath(import.meta.url));
const core = process.env.BLENDS_CORE ?? join(here, "..", ".acryl", "runtime", "blends-core", "src");
const { buildRegistryIndex } = (await import(join(core, "registry.ts"))) as {
  buildRegistryIndex(sources: { path: string; manifestText: string }[]): { index: { formatVersion: number; entries: Record<string, unknown>[] }; problems: { path: string; message: string }[] };
};

const { pluginFiles } = (await import(join(core, "plugin-identity", "folder-digest.ts"))) as {
  pluginFiles(dir: string): unknown[];
};
const { portabilityIssues } = (await import(join(core, "plugin-identity", "plugin-portability.ts"))) as {
  portabilityIssues(files: unknown[]): { path: string; reason: string }[];
};

// 64 MB: a whole game (its models, textures and sounds) is a starter too; the largest, the action RPG, is 54 MB.
const LIMITS = { files: 5000, bytes: 64 * 1024 * 1024 };
const SECRETS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/\bsk-[A-Za-z0-9_-]{24,}/, "an API key (sk-...)"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, "a GitHub token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key"],
  [/\bnpm_[A-Za-z0-9]{30,}/, "an npm token"],
];

/** Everything wrong with an app entry; empty when it is a sound starter for acrylblends. */
function checkApp(dir: string): string[] {
  const problems: string[] = [];
  let files = 0;
  let bytes = 0;
  const walk = (folder: string) => {
    for (const name of readdirSync(folder)) {
      const path = join(folder, name);
      const info = lstatSync(path);
      const rel = path.slice(dir.length + 1);
      if (info.isSymbolicLink()) problems.push(`${rel} is a link; links are not allowed`);
      else if (info.isDirectory()) {
        if (name === "node_modules" || name === ".git") problems.push(`${rel} must not be in an entry`);
        else walk(path);
      } else {
        files += 1;
        bytes += info.size;
        if (info.size < 1024 * 1024 && !/\.(png|jpe?g|gif|ico|woff2?|tgz|gz|zip)$/i.test(name)) {
          const text = readFileSync(path, "utf8");
          for (const [pattern, what] of SECRETS) if (pattern.test(text)) problems.push(`${rel} looks like it holds ${what}`);
        }
      }
    }
  };
  walk(dir);
  if (files > LIMITS.files) problems.push(`has ${files} files; the limit is ${LIMITS.files}`);
  if (bytes > LIMITS.bytes) problems.push(`is ${Math.round(bytes / 1024 / 1024)} MB; the limit is ${LIMITS.bytes / 1024 / 1024} MB`);
  problems.push(...templateProblems(readFileSync(join(dir, MARKER), "utf8")));
  if (!existsSync(join(dir, "package.json"))) problems.push("has no package.json");
  else problems.push(...packageProblems(readFileSync(join(dir, "package.json"), "utf8")));
  if (!existsSync(join(dir, "src"))) problems.push("has no src/ folder");
  return problems;
}

/** Why an entry would not work the same on every OS: the format's own rules, for an app or a starter alike. */
function checkPortable(dir: string): string[] {
  try {
    return portabilityIssues(pluginFiles(dir)).map(({ path, reason }) => `${path}: ${reason}`);
  } catch (cause) {
    return [`could not be read: ${cause instanceof Error ? cause.message : String(cause)}`];
  }
}

export function indexText(root: string): { text: string; problems: string[] } {
  const blends = join(root, "blends");
  const folders = existsSync(blends) ? readdirSync(blends, { withFileTypes: true }).filter(e => e.isDirectory() && existsSync(join(blends, e.name, "blend.yaml"))) : [];
  const { index, problems } = buildRegistryIndex(folders.map(e => ({ path: `blends/${e.name}`, manifestText: readFileSync(join(blends, e.name, "blend.yaml"), "utf8") })));
  const out = problems.map(p => `${p.path}: ${p.message}`);
  const entries = index.entries.map(entry => {
    const dir = join(root, String(entry.path));
    out.push(...checkPortable(dir).map((message) => `${String(entry.path)}: ${message}`));
    // Every folder under registry/blends/ is in this repository, which belongs to the acrylblends organisation: official. A community Blend is never a folder here;
    // it is found in its own repository (scripts/sync-blends.ts writes discovered.json with origin decided from the repository owner's id).
    // A starter for the ACRYL app (the DSH-engine app of the earlier IDE) cannot be made by create-acrylblends, run in a WebBox or started from Control Center: it is being converted to an
    // acrylblends app, one entry at a time (a converted entry gains its acryl.template.json and becomes runtime acrylblends, same id). `status` tells every listing to offer it no button.
    if (!existsSync(join(dir, MARKER))) return { ...entry, runtime: "acryl", status: "converting", origin: "official" };
    const apps = checkApp(dir);
    out.push(...apps.map(message => `${String(entry.path)}: ${message}`));
    return { ...entry, runtime: "acrylblends", origin: "official" };
  });
  return { text: `${JSON.stringify({ ...index, entries }, null, 2)}\n`, problems: out };
}

// indexText is also the products step's writer (scripts/sync-products.ts); the CLI runs only when this file is the program.
if (import.meta.main) {
  const argv = process.argv.slice(2);
  const positional = argv.filter(arg => !arg.startsWith("--"));
  if (positional.length !== 1) {
    console.log("usage: bun scripts/registry-index.ts <registry folder> [--check]");
    process.exit(2);
  }
  const root = resolve(positional[0] as string);
  const { text, problems } = indexText(root);
  for (const problem of problems) console.log(`refused ${problem}`);
  const file = join(root, "index.json");
  if (argv.includes("--check")) {
    if ((existsSync(file) ? readFileSync(file, "utf8") : "") !== text) {
      console.log(`${file} is stale: run bun scripts/registry-index.ts ${positional[0]}`);
      process.exit(1);
    }
  } else {
    writeFileSync(file, text);
    console.log(`wrote ${file}`);
  }
  process.exit(problems.length > 0 ? 1 : 0);
}
