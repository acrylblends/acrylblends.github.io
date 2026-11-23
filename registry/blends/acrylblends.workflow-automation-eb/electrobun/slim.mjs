/**
 * Take out of the Electrobun bundle's Program what never runs there. The Program is the Electron pack's resources/app: made for Electron on Node, for
 * every OS, with each package's sources, types and docs. On Bun, for one OS and CPU, these are dead weight:
 *   - packages only Electron or a TypeScript build uses (Bun compiles TypeScript itself; nothing imports `typescript` at runtime);
 *   - node-pty: on macOS and Linux it is replaced by electrobun/bun-pty.cjs (node-pty's output never arrives on Bun); Windows keeps it (ConPTY);
 *   - native prebuilds for other OSes and CPUs;
 *   - type declarations, source maps, C/C++ sources of native modules, and the TypeScript sources third-party packages carry next to their build;
 *   - third-party READMEs and changelogs (licence files stay; ACRYL's and DSH's own docs stay: the agent reads them).
 *
 *   slim(nodeModules, { platform, arch, bunPty }) -> { removed: { [rule]: bytes }, files: { [rule]: count } }
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DEAD_PACKAGES = ['typescript', '@electron/get', '@electron-internal']
const OWN_SCOPES = new Set(['@acryldev', '@deepseek-ai', '@earendil-works'])
const KEEP_NAMES = /^(licen[cs]e|notice|copying|authors)/iu
const TYPES = /\.d\.[cm]?ts$|\.map$/u
const NATIVE_SOURCES = /\.(cc|cpp|cxx|c|h|hpp|hh|gyp|gypi)$/u
const DOCS = /\.(md|markdown)$|^(changelog|history)(\.|$)/iu

function size(path) {
  const stat = lstatSync(path, { throwIfNoEntry: false })
  if (stat === undefined || stat.isSymbolicLink()) return 0
  if (!stat.isDirectory()) return stat.size
  let total = 0
  for (const name of readdirSync(path)) total += size(join(path, name))
  return total
}

/** The package folders directly under node_modules (scoped ones as `@scope/name`). */
function packages(nodeModules) {
  const list = []
  for (const name of readdirSync(nodeModules)) {
    if (name.startsWith('.')) continue
    if (name.startsWith('@')) for (const inner of readdirSync(join(nodeModules, name))) list.push(`${name}/${inner}`)
    else list.push(name)
  }
  return list
}

/** Whether the package's own manifest points at TypeScript sources (then they run, and stay). */
function runsTypeScript(dir) {
  try {
    const text = readFileSync(join(dir, 'package.json'), 'utf8').replace(/\.d\.[cm]?ts"/gu, '"')
    return /\.[cm]?tsx?"/u.test(text)
  } catch {
    return true
  }
}

export function slim(nodeModules, { platform = process.platform, arch = process.arch, bunPty } = {}) {
  const removed = {}
  const files = {}
  const drop = (rule, path) => {
    removed[rule] = (removed[rule] ?? 0) + size(path)
    files[rule] = (files[rule] ?? 0) + 1
    rmSync(path, { recursive: true, force: true })
  }
  for (const name of DEAD_PACKAGES) if (existsSync(join(nodeModules, name))) drop('electron and build-only packages', join(nodeModules, name))
  const pty = join(nodeModules, 'node-pty')
  if (platform !== 'win32' && bunPty !== undefined && existsSync(pty)) {
    const { version } = JSON.parse(readFileSync(join(pty, 'package.json'), 'utf8'))
    drop('node-pty (Bun terminal instead)', pty)
    mkdirSync(pty)
    cpSync(bunPty, join(pty, 'index.cjs'))
    writeFileSync(join(pty, 'package.json'), `${JSON.stringify({ name: 'node-pty', version: `${version}+bun`, main: './index.cjs', license: 'MIT' }, null, 2)}\n`)
  }
  const target = `${platform}-${arch}`
  const walk = (dir, own, typeScript) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (entry.name === 'prebuilds') {
          for (const build of readdirSync(path)) if (!build.startsWith(target)) drop('prebuilds for other OSes and CPUs', join(path, build))
          continue
        }
        walk(path, own, typeScript)
        continue
      }
      if (TYPES.test(entry.name)) drop('types and source maps', path)
      else if (NATIVE_SOURCES.test(entry.name)) drop('C/C++ sources of native modules', path)
      else if (!typeScript && /\.[cm]?tsx?$/u.test(entry.name)) drop('TypeScript sources of built packages', path)
      else if (!own && DOCS.test(entry.name) && !KEEP_NAMES.test(entry.name)) drop('third-party docs', path)
    }
  }
  for (const name of packages(nodeModules)) {
    const dir = join(nodeModules, name)
    if (!lstatSync(dir).isDirectory()) continue
    const own = OWN_SCOPES.has(name.split('/')[0])
    // ACRYL's and DSH's own packages keep their .ts files: the frame and the app load some of them as code.
    walk(dir, own, own || runsTypeScript(dir))
  }
  return { removed, files }
}
