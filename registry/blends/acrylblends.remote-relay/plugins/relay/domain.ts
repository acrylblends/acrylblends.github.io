/**
 * Relay's domain: saved connection profiles, simulated sessions, the allowlisted demo commands, transfer jobs and the audit log. Pure functions and
 * plain data; the {@link Relay} in relay.ts applies them to the saved state and the pages only read what it returns.
 *
 * Everything is simulated: no command is executed, no file moves and no remote server is contacted.
 */

export interface Workspace {
  readonly id: string
  readonly name: string
}

export interface ConnectionProfile {
  readonly id: string
  readonly name: string
  readonly user: string
  readonly host: string
  readonly port: number
  readonly workspaceId: string
  /** `ok` is the green dot, `warn` the gold one. */
  readonly health: 'ok' | 'warn'
}

export interface TerminalEntry {
  readonly at: string
  readonly command: string
  readonly output: string
  readonly exit: number
}

export interface RemoteSession {
  /** `RLY-1042`. */
  readonly id: string
  readonly profileId: string
  readonly startedAt: string
  readonly lastActivityAt: string
  readonly closedAt?: string
  readonly entries: readonly TerminalEntry[]
}

export type TransferState = 'queued' | 'ready' | 'running' | 'completed' | 'cancelled'

export interface TransferJob {
  readonly id: string
  readonly sessionId: string
  readonly name: string
  /** `up` sends to the remote path, `down` fetches from it. */
  readonly direction: 'up' | 'down'
  readonly path: string
  readonly bytes: number
  readonly state: TransferState
}

export interface AuditEvent {
  readonly id: string
  readonly sessionId: string
  readonly at: string
  readonly text: string
  /** `OK`, `Exit 0`, `Denied`... shown as a badge. */
  readonly result?: string
}

export interface RelayState {
  readonly version: 1
  readonly workspaces: readonly Workspace[]
  readonly profiles: readonly ConnectionProfile[]
  readonly sessions: readonly RemoteSession[]
  readonly transfers: readonly TransferJob[]
  readonly audit: readonly AuditEvent[]
}

export class RelayError extends Error {
  override readonly name = 'RelayError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

/** A session with no command for this long times out. */
export const IDLE_MINUTES = 15

export type SessionStatus = 'active' | 'expired' | 'closed'

export function statusOf(session: RemoteSession, now: Date): SessionStatus {
  if (session.closedAt !== undefined) return 'closed'
  return now.getTime() - new Date(session.lastActivityAt).getTime() > IDLE_MINUTES * 60_000 ? 'expired' : 'active'
}

// ---- the demo commands -----------------------------------------------------------------------------------------------------------------------

export const ALLOWLIST = ['whoami', 'pwd', 'hostname', 'ls', 'uptime', 'docker ps', 'git status', 'df -h', 'free -m', 'help'] as const

export interface Result {
  readonly output: string
  readonly exit: number
  readonly allowed: boolean
}

const FILES: Readonly<Record<string, string>> = {
  'staging-api': 'api/  config/  logs/  package.json  README.md',
  'db-replica': 'backups/  data/  pg_hba.conf  scripts/',
  'edge-node': 'certs/  html/  logs/  nginx/',
}

const DOCKER: Readonly<Record<string, string>> = {
  'staging-api': 'CONTAINER ID   IMAGE                 STATUS\n5ad8e1         api:1.14.2            Up 6 days\n29a10c         worker:2.8.0          Up 6 days\n41fa90         redis:7.2             Up 18 days',
  'edge-node': 'CONTAINER ID   IMAGE                 STATUS\n7c21b0         nginx:1.27            Up 3 days',
}

/** The canned answer to a command on a profile. The same command on the same profile always answers the same. */
export function runCommand(profile: ConnectionProfile, raw: string): Result {
  const command = raw.trim().replace(/\s+/g, ' ')
  const home = profile.user === 'root' ? '/root' : `/home/${profile.user}`
  switch (command) {
    case 'whoami':
      return { output: profile.user, exit: 0, allowed: true }
    case 'pwd':
      return { output: home, exit: 0, allowed: true }
    case 'hostname':
      return { output: profile.name, exit: 0, allowed: true }
    case 'ls':
      return { output: FILES[profile.name] ?? 'workspace/  cache/  artifacts/', exit: 0, allowed: true }
    case 'uptime':
      return { output: '10:42:12 up 18 days, 4:21, 2 users, load average: 0.18, 0.24, 0.20', exit: 0, allowed: true }
    case 'docker ps': {
      const out = DOCKER[profile.name]
      return out === undefined ? { output: 'bash: docker: command not found', exit: 127, allowed: true } : { output: out, exit: 0, allowed: true }
    }
    case 'git status':
      return { output: 'On branch release\nYour branch is up to date with origin/release.\nnothing to commit, working tree clean', exit: 0, allowed: true }
    case 'df -h':
      return { output: 'Filesystem      Size  Used Avail Use%\n/dev/vda1        80G   31G   49G  39%', exit: 0, allowed: true }
    case 'free -m':
      return { output: 'Mem:  16384 total  9230 used  7154 free', exit: 0, allowed: true }
    case 'help':
      return { output: `Available demo commands: ${ALLOWLIST.filter((c) => c !== 'help').join(', ')}`, exit: 0, allowed: true }
    default:
      return { output: 'Command not in demo allowlist. Type help to see available commands.', exit: 126, allowed: false }
  }
}

// ---- transfers --------------------------------------------------------------------------------------------------------------------------------

export const NEXT_STATE: Readonly<Partial<Record<TransferState, TransferState>>> = { queued: 'ready', ready: 'running', running: 'completed' }

export const TRANSFER_LABEL: Readonly<Record<TransferState, string>> = { queued: 'Queued', ready: 'Ready', running: 'Running', completed: 'Completed', cancelled: 'Cancelled' }

/** The sample files "Queue sample transfer" offers, in order. */
export const SAMPLE_FILES: readonly { name: string; direction: 'up' | 'down'; path: string; bytes: number }[] = [
  { name: 'sample-bundle.zip', direction: 'up', path: '/tmp/', bytes: 640 * 1024 },
  { name: 'config-backup.tar', direction: 'down', path: '/etc/', bytes: 1_153_434 },
  { name: 'deploy-notes.md', direction: 'up', path: '/tmp/', bytes: 8 * 1024 },
  { name: 'access.log.gz', direction: 'down', path: '/var/log/', bytes: 3_250_586 },
]

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** `10:42:12`, local time. */
export function clockOf(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** `Today · 10:42`, `Yesterday · 16:19`, `Nov 3 · 13:02`. */
export function whenLabel(iso: string, now: Date): string {
  const at = new Date(iso)
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(at)) / 86_400_000)
  const hm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  if (days === 0) return `Today · ${hm}`
  if (days === 1) return `Yesterday · ${hm}`
  return `${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${hm}`
}

// ---- connection input ------------------------------------------------------------------------------------------------------------------------

export interface ProfileInput {
  readonly name: string
  readonly user: string
  readonly host: string
  readonly port: number
  readonly workspaceId: string
}

export function parseProfile(fields: Readonly<Record<string, string | undefined>>, workspaces: readonly Workspace[]): ProfileInput {
  const name = (fields.name ?? '').trim().toLowerCase()
  if (name === '') throw new RelayError('invalid', 'Give the connection a name.')
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(name)) throw new RelayError('invalid', 'A connection name is lowercase letters, digits and dashes, up to 40 characters.')
  const user = (fields.user ?? '').trim()
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(user)) throw new RelayError('invalid', 'The user is a Unix account name: lowercase letters, digits, dashes and underscores.')
  const host = (fields.host ?? '').trim().toLowerCase()
  const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(host)
  const dns = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host) && host.length <= 253
  // Digits and dots alone must be a real IPv4 address: 300.1.1.1 is not a host name.
  if (!ipv4 && (!dns || /^[\d.]+$/.test(host))) throw new RelayError('invalid', 'The host is an IPv4 address or a host name.')
  const portText = (fields.port ?? '').trim() === '' ? '22' : (fields.port ?? '')
  const port = Number(portText)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RelayError('invalid', 'The port is a whole number from 1 to 65535.')
  const workspaceId = fields.workspaceId ?? ''
  if (!workspaces.some((w) => w.id === workspaceId)) throw new RelayError('invalid', 'Pick a workspace from the list.')
  return { name, user, host, port, workspaceId }
}
