/**
 * Termforge's domain: a simulated terminal workspace. A workspace has tabs (sessions); a tab keeps the commands run in it and what the simulator
 * answered. Commands are parsed against a strict allowlist and answered from fixtures: nothing here starts a process, reads a file or touches the
 * environment, and the output is a pure function of the command, the workspace and the clock.
 */

export class ForgeError extends Error {
  override readonly name = 'ForgeError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

/** The whole allowlist; every other input is refused. */
export const COMMANDS = ['help', 'pwd', 'ls', 'date', 'whoami', 'history', 'clear', 'git status', 'git log', 'npm test', 'npm run build', 'deploy --dry-run'] as const
export type Command = (typeof COMMANDS)[number]

export const isCommand = (text: string): text is Command => (COMMANDS as readonly string[]).includes(text)

export const MAX_COMMAND = 80
export const MAX_ENTRIES = 100
export const MAX_TABS = 5
export const MAX_SNIPPETS = 12

export interface Entry {
  readonly id: string
  /** What was typed (collapsed); a refused entry keeps the text so the terminal shows it, but only allowlist commands are ever recalled. */
  readonly command: string
  readonly output: string
  /** 0 success, 1 failed, 126 refused operator, 127 not allowed. */
  readonly status: number
  readonly at: string
}

export interface Tab {
  readonly id: string
  readonly name: string
  readonly entries: readonly Entry[]
  /** True after `clear`, until the next command: the terminal shows its "cleared" line instead of the banner. */
  readonly cleared: boolean
}

export interface Workspace {
  readonly id: string
  readonly name: string
  readonly user: string
  readonly host: string
  readonly cwd: string
  readonly profile: string
  readonly tabs: readonly Tab[]
}

export interface Snippet {
  readonly id: string
  readonly label: string
  readonly command: Command
}

export interface ForgeState {
  readonly version: 1
  readonly workspaces: readonly Workspace[]
  readonly snippets: readonly Snippet[]
}

/** The command deck: the shortcut buttons, with their key chords. */
export const DECK: readonly { readonly label: string; readonly command: Command; readonly keys: string }[] = [
  { label: 'Git status', command: 'git status', keys: 'g s' },
  { label: 'Run tests', command: 'npm test', keys: 'n t' },
  { label: 'Build project', command: 'npm run build', keys: 'n b' },
  { label: 'Current time', command: 'date', keys: 'd' },
]

/** The task launcher: a routine is a fixed list of allowed commands run in order in the current tab. */
export interface Task {
  readonly id: string
  readonly name: string
  readonly about: string
  readonly steps: readonly Command[]
}

export const TASKS: readonly Task[] = [
  { id: 'build', name: 'Build', about: 'Type-check and bundle', steps: ['npm run build'] },
  { id: 'test', name: 'Test', about: 'Run the test suite', steps: ['npm test'] },
  { id: 'deploy', name: 'Deploy (dry run)', about: 'Status, tests, build, then a dry run', steps: ['git status', 'npm test', 'npm run build', 'deploy --dry-run'] },
]

export type Parsed = { readonly ok: true; readonly command: Command } | { readonly ok: false; readonly status: 126 | 127; readonly message: string }

/**
 * Check what was typed against the allowlist: whitespace is collapsed and case is kept (commands are lower case), shell operators and substitutions are
 * refused by name, anything else not on the list is "not available". Empty input is a mistake, not a command.
 */
export function parseCommand(raw: string | undefined): Parsed {
  const text = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (text === '') throw new ForgeError('invalid', 'Type a command first.')
  if (text.length > MAX_COMMAND) throw new ForgeError('invalid', `A command is at most ${String(MAX_COMMAND)} characters.`)
  if (/[;&|<>`$(){}\\\n]/.test(text)) return { ok: false, status: 126, message: 'shell operators are not interpreted in safe demo mode; run one allowed command at a time.' }
  const command = COMMANDS.find((c) => c === text)
  if (command === undefined) return { ok: false, status: 127, message: 'command not available in safe demo mode. Type "help" to see the allowlist.' }
  return { ok: true, command }
}

type Fixture = Readonly<Record<Exclude<Command, 'help' | 'date' | 'whoami' | 'history' | 'clear' | 'pwd'>, { out: string; status?: number }>>

/** What each workspace answers; the same allowlist everywhere, different data. */
const FIXTURES: Readonly<Record<string, Fixture>> = {
  acryl: {
    ls: { out: 'README.md  package.json  src/  tests/  blends/  tsconfig.json' },
    'git status': { out: 'On branch main\nYour branch is up to date with origin/main.\nnothing to commit, working tree clean' },
    'git log': { out: 'a91c20d  Add connector registry\n7f30b14  Refine plugin loader\n182ac0a  Initial workspace scaffold' },
    'npm test': { out: '✓ 42 tests passed\n✓ 0 failed\nCompleted in 1.82s' },
    'npm run build': { out: '✓ TypeScript check passed\n✓ Bundled 18 modules\n✓ Build completed in 2.41s' },
    'deploy --dry-run': { out: '— dry run · 18 modules would be published to staging\n— nothing was deployed' },
  },
  infra: {
    ls: { out: 'main.tf  modules/  staging.tfvars  README.md' },
    'git status': { out: 'On branch staging\nChanges not staged for commit:\n\tmodified:   staging.tfvars' },
    'git log': { out: '5be19d2  Raise worker count to 4\nc02a7f1  Add queue module\n0d3e8aa  Initial staging plan' },
    'npm test': { out: '✓ 12 plan checks passed\n✓ 0 failed\nCompleted in 0.64s' },
    'npm run build': { out: '✓ Plan rendered\n✓ 3 resources to change\n✓ Build completed in 1.10s' },
    'deploy --dry-run': { out: '— dry run · 3 resources would change (1 add, 2 update)\n— nothing was applied' },
  },
  scratch: {
    ls: { out: 'backup.sh  notes.txt  parse-logs.py' },
    'git status': { out: 'fatal: not a git repository (or any of the parent directories): .git', status: 1 },
    'git log': { out: 'fatal: not a git repository (or any of the parent directories): .git', status: 1 },
    'npm test': { out: '✗ 1 failed: parse-logs handles empty input\n✓ 6 passed\nCompleted in 0.40s', status: 1 },
    'npm run build': { out: '✓ Nothing to bundle\n✓ Build completed in 0.20s' },
    'deploy --dry-run': { out: 'error: no deploy target configured for this workspace', status: 1 },
  },
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const two = (n: number): string => String(n).padStart(2, '0')

/** `Thu Nov 05 2026 11:00:00`. */
export const dateLine = (now: Date): string => `${DAYS[now.getDay()]} ${MONTHS[now.getMonth()]} ${two(now.getDate())} ${String(now.getFullYear())} ${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`

/** The prompt text a workspace shows: `alex@acryl ~/projects/acryl $`. */
export const promptOf = (w: Workspace): string => `${w.user}@${w.host} ${w.cwd} $`

/** The simulator's answer to an allowed command. `clear` has none (it empties the tab). */
export function execute(command: Exclude<Command, 'clear'>, workspace: Workspace, tab: Tab, now: Date): { output: string; status: number } {
  switch (command) {
    case 'help':
      return { output: `Available: ${COMMANDS.join(', ')}`, status: 0 }
    case 'pwd':
      return { output: workspace.cwd.replace(/^~/, `/Users/${workspace.user}`), status: 0 }
    case 'date':
      return { output: dateLine(now), status: 0 }
    case 'whoami':
      return { output: workspace.user, status: 0 }
    case 'history': {
      const ran = [...tab.entries.filter((e) => isCommand(e.command)).map((e) => e.command), 'history']
      return { output: ran.map((c, i) => `${String(i + 1).padStart(3)}  ${c}`).join('\n'), status: 0 }
    }
    default: {
      const fixtures = FIXTURES[workspace.id.split('-')[0] ?? ''] ?? FIXTURES.acryl
      const hit = fixtures?.[command]
      return { output: hit?.out ?? '', status: hit?.status ?? 0 }
    }
  }
}

/** Newest-first distinct commands run in a workspace, for the history panel and recall. */
export function recentCommands(workspace: Workspace, limit = 6): Command[] {
  const all = workspace.tabs.flatMap((t) => t.entries).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
  const seen = new Set<Command>()
  for (const e of all) if (isCommand(e.command)) seen.add(e.command)
  return [...seen].slice(0, limit)
}

export const lastStatus = (tab: Tab): number => tab.entries.at(-1)?.status ?? 0
