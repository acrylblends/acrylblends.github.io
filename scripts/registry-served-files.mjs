#!/usr/bin/env node
/**
 * Keep, in each entry's folder of the registry copy a site is about to deploy, only what a visitor or create-acrylblends reads from the web:
 * `blend.yaml` (the entry's page shows it), `docs/` (the first-page screenshot) and the entry's archive beside the folder. The rest of an entry is its source, already inside
 * the archive and in the repository; serving every file of it made GitHub Pages sync twelve thousand files per deploy, and that sync timed out. Run after
 * registry-archives.mjs and only on `dist/registry`, never on the repository.
 */
import { readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVED = new Set(['blend.yaml', 'docs'])

/** Remove everything but the served names from each entry folder under `<root>/blends`; the number of files and folders removed. */
export function pruneEntries(root) {
  const blends = join(root, 'blends')
  let removed = 0
  for (const entry of readdirSync(blends, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    for (const name of readdirSync(join(blends, entry.name))) {
      if (SERVED.has(name)) continue
      rmSync(join(blends, entry.name, name), { recursive: true, force: true })
      removed += 1
    }
  }
  return removed
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2]
  if (root === undefined) {
    console.error('usage: registry-served-files.mjs <registry folder>')
    process.exit(2)
  }
  console.log(`registry-served-files: ${pruneEntries(root)} entries of source left out of ${root}`)
}
