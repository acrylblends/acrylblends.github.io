/**
 * What a scan reads and what it leaves alone. The policy is data the person can change per run; the defaults follow the plan's first-stage
 * exclusions (dependencies, build output, caches, VCS metadata, binaries).
 */
export interface ScanPolicy {
  /** Folder names skipped wherever they appear. */
  readonly excludeDirs: readonly string[]
  /** File name patterns skipped (simple globs: `*` matches within a name). */
  readonly excludeFiles: readonly string[]
  /** Files larger than this are listed in the inventory but not read. */
  readonly maxFileBytes: number
  /** The scan stops reading after this many files and says so. */
  readonly maxFiles: number
  /**
   * Words that name the project, its company, its customers or its products. They are replaced everywhere (identifiers, comments, paths) by
   * neutral synthetic names. The package name, the folder name and the authors found in manifests are added automatically.
   */
  readonly projectTerms: readonly string[]
}

export const DEFAULT_EXCLUDE_DIRS: readonly string[] = [
  'node_modules', 'vendor', 'dist', 'build', 'out', 'coverage', '.git', '.hg', '.svn', '.next', '.nuxt', '.cache', '.turbo', '.venv', 'venv',
  '__pycache__', '.pytest_cache', '.mypy_cache', 'target', 'generated', '.idea', '.vscode', '.acrylblends', '.acryl', 'bower_components',
]

export const DEFAULT_EXCLUDE_FILES: readonly string[] = [
  '*.min.js', '*.map', '*.lock', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', '*.png', '*.jpg', '*.jpeg', '*.gif',
  '*.webp', '*.ico', '*.pdf', '*.zip', '*.gz', '*.tgz', '*.jar', '*.class', '*.exe', '*.dll', '*.so', '*.dylib', '*.wasm', '*.woff', '*.woff2',
  '*.ttf', '*.mp3', '*.mp4', '*.mov', '*.sqlite', '*.db', '.DS_Store',
]

export const DEFAULT_POLICY: ScanPolicy = {
  excludeDirs: DEFAULT_EXCLUDE_DIRS,
  excludeFiles: DEFAULT_EXCLUDE_FILES,
  maxFileBytes: 512 * 1024,
  maxFiles: 20_000,
  projectTerms: [],
}

/** A policy from partial input: lists given replace the defaults, terms are trimmed and de-duplicated. */
export function policyFrom(input: Partial<ScanPolicy> = {}): ScanPolicy {
  const terms = [...new Set((input.projectTerms ?? []).map((term) => term.trim()).filter((term) => term.length >= 3))]
  return { ...DEFAULT_POLICY, ...input, projectTerms: terms }
}

/** Whether `name` matches a simple glob (`*` within one name, no folders). */
export function matchesGlob(name: string, glob: string): boolean {
  const pattern = new RegExp(`^${glob.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/gu, '\\$&')).join('.*')}$`, 'iu')
  return pattern.test(name)
}
