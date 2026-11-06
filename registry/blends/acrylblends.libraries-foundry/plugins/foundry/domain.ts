/**
 * The Foundry's domain: a curated catalogue of libraries and frameworks (metadata, versions, runtimes, peer requirements), the filters and search over
 * it, and the local stack a person assembles from it, with its manifest preview and its checks. Pure functions and plain data; the {@link Atlas} in
 * atlas.ts applies them to the saved state and the pages only read what it returns.
 *
 * The metadata is illustrative seed data: nothing is resolved from a registry and nothing is installed.
 */

export type Ecosystem = 'npm' | 'cargo' | 'pip'

export interface PackageVersion {
  readonly version: string
  /** `Latest`, `Stable`, `LTS compatible`, ... */
  readonly channel: string
}

export interface Requirement {
  readonly packageId: string
  /** The oldest major version of that package this one works with. */
  readonly minMajor: number
}

export interface Pkg {
  readonly id: string
  readonly name: string
  /** The filter group in the Type list. */
  readonly group: string
  /** The finer label under the name in the detail: `UI library`, `Web framework`. */
  readonly kind: string
  readonly framework?: string
  readonly languages: readonly string[]
  readonly tags: readonly string[]
  readonly summary: string
  readonly ecosystem: Ecosystem
  /** What is passed to the installer: `react react-dom`. */
  readonly install: string
  readonly dev: boolean
  /** Newest first. */
  readonly versions: readonly PackageVersion[]
  readonly runtimes: readonly string[]
  readonly requires: readonly Requirement[]
}

export interface StackEntry {
  readonly packageId: string
  readonly version: string
  readonly addedAt: string
}

export interface AtlasState {
  readonly version: 1
  readonly packages: readonly Pkg[]
  readonly stack: readonly StackEntry[]
}

export class AtlasError extends Error {
  override readonly name = 'AtlasError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

export const MAX_STACK = 12

/** The filter groups, in the order the explorer lists them. */
export const TYPE_GROUPS = ['UI libraries', 'Networking', 'Database', 'Crypto', 'Numerical', 'Multimedia', 'Utilities'] as const
export const FRAMEWORKS = ['Web', 'Mobile', 'Desktop', 'AI', 'Testing'] as const
export const LANGUAGES = ['TypeScript', 'Rust', 'Python'] as const

export const ECOSYSTEM_OF: Readonly<Record<string, Ecosystem>> = { TypeScript: 'npm', Rust: 'cargo', Python: 'pip' }

// ---- filtering -------------------------------------------------------------------------------------------------------------------------------

export interface Filter {
  readonly q?: string
  readonly group?: string
  readonly framework?: string
  readonly language?: string
}

/** Packages matching the filters; every word of the search must appear in the name, kind, summary, tags, languages or runtimes. */
export function filterPackages(packages: readonly Pkg[], f: Filter): Pkg[] {
  const words = (f.q ?? '').toLowerCase().split(/\s+/).filter((w) => w !== '')
  return packages.filter((p) => {
    if (f.group !== undefined && f.group !== '' && p.group !== f.group) return false
    if (f.framework !== undefined && f.framework !== '' && p.framework !== f.framework) return false
    if (f.language !== undefined && f.language !== '' && !p.languages.includes(f.language)) return false
    const hay = `${p.name} ${p.kind} ${p.group} ${p.summary} ${p.tags.join(' ')} ${p.languages.join(' ')} ${p.runtimes.join(' ')} ${p.framework ?? ''}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

/** How many packages each filter value has across the whole catalogue. */
export function counts(packages: readonly Pkg[]): { group: Record<string, number>; framework: Record<string, number>; language: Record<string, number> } {
  const group: Record<string, number> = {}
  const framework: Record<string, number> = {}
  const language: Record<string, number> = {}
  for (const p of packages) {
    group[p.group] = (group[p.group] ?? 0) + 1
    if (p.framework !== undefined) framework[p.framework] = (framework[p.framework] ?? 0) + 1
    for (const l of p.languages) language[l] = (language[l] ?? 0) + 1
  }
  return { group, framework, language }
}

// ---- versions and the stack ------------------------------------------------------------------------------------------------------------------

export const latestOf = (p: Pkg): string => p.versions[0]?.version ?? '0.0.0'

export const majorOf = (version: string): number => Number(version.split('.')[0])

/** Compare dotted versions numerically: negative when a is older. */
export function compareVersions(a: string, b: string): number {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** `Latest`, `1 behind`, ... : how far a pinned version is from the newest in the package's history. */
export function standing(p: Pkg, version: string): string {
  const index = p.versions.findIndex((v) => v.version === version)
  return index <= 0 ? 'Latest' : `${String(index)} behind`
}

export interface Warning {
  readonly packageId: string
  readonly text: string
}

/** Peer requirements the stack does not meet: a required package that is missing, or pinned below the oldest major the package supports. */
export function warningsOf(packages: readonly Pkg[], stack: readonly StackEntry[]): Warning[] {
  const out: Warning[] = []
  for (const entry of stack) {
    const pkg = packages.find((p) => p.id === entry.packageId)
    if (pkg === undefined) continue
    for (const req of pkg.requires) {
      const need = packages.find((p) => p.id === req.packageId)
      const have = stack.find((e) => e.packageId === req.packageId)
      const name = need?.name ?? req.packageId
      if (have === undefined) out.push({ packageId: pkg.id, text: `${pkg.name} needs ${name} ${String(req.minMajor)} or newer; add ${name} to the stack.` })
      else if (majorOf(have.version) < req.minMajor) out.push({ packageId: pkg.id, text: `${pkg.name} needs ${name} ${String(req.minMajor)} or newer; the stack pins ${have.version}.` })
    }
  }
  return out
}

export interface Manifest {
  readonly npm?: { readonly dependencies: Record<string, string>; readonly devDependencies: Record<string, string> }
  readonly cargo?: readonly string[]
  readonly pip?: readonly string[]
}

/** The names the installer knows a package by: the first word of its install arguments is the package; extras (react-dom) travel with it. */
const installNames = (p: Pkg): string[] => p.install.split(/\s+/).filter((w) => w !== '')

/** The manifest the stack would produce, per ecosystem. */
export function manifestOf(packages: readonly Pkg[], stack: readonly StackEntry[]): Manifest {
  const npm = { dependencies: {} as Record<string, string>, devDependencies: {} as Record<string, string> }
  const cargo: string[] = []
  const pip: string[] = []
  for (const entry of stack) {
    const p = packages.find((x) => x.id === entry.packageId)
    if (p === undefined) continue
    if (p.ecosystem === 'npm') {
      const target = p.dev ? npm.devDependencies : npm.dependencies
      for (const name of installNames(p)) target[name] = `^${entry.version}`
    } else if (p.ecosystem === 'cargo') cargo.push(`${installNames(p)[0] ?? p.id} = "${entry.version}"`)
    else pip.push(`${installNames(p)[0] ?? p.id}==${entry.version}`)
  }
  const sorted = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
  return {
    ...(Object.keys(npm.dependencies).length + Object.keys(npm.devDependencies).length === 0 ? {} : { npm: { dependencies: sorted(npm.dependencies), devDependencies: sorted(npm.devDependencies) } }),
    ...(cargo.length === 0 ? {} : { cargo: cargo.sort() }),
    ...(pip.length === 0 ? {} : { pip: pip.sort() }),
  }
}

/** The install commands that match the manifest, one per ecosystem. */
export function commandsOf(packages: readonly Pkg[], stack: readonly StackEntry[]): string[] {
  const names = (eco: Ecosystem, dev: boolean) => stack.flatMap((e) => packages.filter((p) => p.id === e.packageId && p.ecosystem === eco && p.dev === dev).flatMap(installNames))
  const out: string[] = []
  if (names('npm', false).length > 0) out.push(`npm install ${names('npm', false).join(' ')}`)
  if (names('npm', true).length > 0) out.push(`npm install -D ${names('npm', true).join(' ')}`)
  if (names('cargo', false).length > 0) out.push(`cargo add ${names('cargo', false).join(' ')}`)
  if (names('pip', false).length > 0) out.push(`pip install ${names('pip', false).join(' ')}`)
  return out
}

export function parseVersion(p: Pkg, raw: string | undefined): string {
  const v = (raw ?? '').trim() === '' ? latestOf(p) : (raw ?? '').trim()
  if (!p.versions.some((x) => x.version === v)) throw new AtlasError('invalid', `${p.name} has no version ${v} in this catalogue.`)
  return v
}
