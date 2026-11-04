/**
 * The monitor plugin: the page at `/`, the numbers at `/api/snapshot`, and the one way to end a process, `POST /api/kill`.
 * The machine it reads (`sources`) and the way it ends a process (`kill`) are config, so a test hands in a fake of each.
 */
import { userInfo } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../plugins/acryl-router/src/index.ts'
import { loopbackOnly } from '../plugins/acryl-router/src/middleware/index.ts'
import { validator } from '../plugins/acryl-router/src/helpers/index.ts'
import { heaviest, killProcess, protectedReason, SIGNALS, type KillDeps, type Own, type Signal, type SortBy } from './monitor/kill-list.ts'
import { monitorPage, type View } from './monitor/page.tsx'
import { defaultDiskPaths, machine, parseProcesses, readSnapshot, type Sources } from './monitor/system.ts'

export const APP_NAME = 'system-monitor'
export const name = 'monitor'
export const inject = ['router']

export interface MonitorConfig {
  /** The disks to show, by a folder on each. Default: the system drive. */
  readonly diskPaths?: readonly string[]
  /** How many processes the kill-list shows by default, and the most it may show. */
  readonly listSize?: number
  /** The machine to read; a test passes a fake. */
  readonly sources?: Sources
  /** How a process is ended; a test passes a recorder. */
  readonly kill?: (pid: number, signal: Signal) => void
  /** This app's own process and the program that started it, never offered for ending. */
  readonly own?: Own
}

const MOST = 50
const DEFAULT_SIZE = 10

/** A count from a query string: a whole number from 1 to `MOST`, else the default. */
export function listSize(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, MOST) : fallback
}

export function sortOf(value: string | undefined): SortBy {
  return value === 'cpu' ? 'cpu' : 'memory'
}

/** The account this process runs as; undefined where the system does not say (the monitor then offers every process the list shows). */
function userName(): string | undefined {
  try {
    return userInfo().username
  } catch {
    return undefined
  }
}

export function apply(ctx: Context, config: MonitorConfig = {}): void {
  const sources = config.sources ?? machine
  const own = config.own ?? { pid: process.pid, parentPid: process.ppid, user: userName() }
  const kill = config.kill ?? ((pid: number, signal: Signal) => { process.kill(pid, signal) })
  const size = listSize(String(config.listSize ?? ''), DEFAULT_SIZE)
  const diskPaths = config.diskPaths !== undefined && config.diskPaths.length > 0 ? config.diskPaths : defaultDiskPaths(sources.platform(), process.cwd())

  const view = async (sort: SortBy, limit: number): Promise<View> => {
    const snapshot = await readSnapshot(sources, diskPaths)
    const { processes, ...machineFacts } = snapshot
    return {
      ...machineFacts,
      sort,
      processCount: processes.length,
      heaviest: heaviest(processes, sort, limit).map((process) => {
        const reason = protectedReason(process, own)
        return reason === undefined ? process : { ...process, protectedReason: reason }
      }),
    }
  }
  const deps: KillDeps = {
    processes: async () => parseProcesses(sources.platform(), await sources.processList()),
    kill,
    own,
  }

  const app = new Acryl()
    .get('/', async (c) => c.html(monitorPage(await view(sortOf(c.req.query('sort')), size))))
    .get('/health', (c) => c.json({ ok: true }))
    .get('/api/snapshot', async (c) => c.json(await view(sortOf(c.req.query('sort')), listSize(c.req.query('limit'), size))))
    .post(
      '/api/kill',
      loopbackOnly(),
      validator('json', (value, c) => {
        const body = value as { pid?: unknown; name?: unknown; signal?: unknown }
        if (typeof body.pid !== 'number' || !Number.isInteger(body.pid) || body.pid < 1) return c.json({ error: 'pid must be a whole number from 1' }, 400)
        if (typeof body.name !== 'string' || body.name === '') return c.json({ error: 'name must say the program the list showed' }, 400)
        if (!SIGNALS.includes(body.signal as Signal)) return c.json({ error: `signal must be one of ${SIGNALS.join(', ')}` }, 400)
        return { pid: body.pid, name: body.name, signal: body.signal as Signal }
      }),
      async (c) => {
        const outcome = await killProcess(deps, c.req.valid('json'))
        return outcome.ok ? c.json(outcome) : c.json({ error: outcome.message }, outcome.status)
      },
    )
  ctx.router.route('/', app)
}
