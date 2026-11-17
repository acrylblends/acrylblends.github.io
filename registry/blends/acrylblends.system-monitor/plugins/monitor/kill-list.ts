/**
 * The kill-list: the heaviest processes, and the rules for ending one. Pure, so the rules are tested without ending anything.
 */
import type { ProcessInfo } from './system.ts'

export type SortBy = 'memory' | 'cpu'
export type Signal = 'SIGTERM' | 'SIGKILL'

/** Normal for the page: ask the program to stop (`SIGTERM`); `SIGKILL` is the forced stop for one that ignores it. */
export const SIGNALS: readonly Signal[] = ['SIGTERM', 'SIGKILL']

/** The heaviest `limit` processes, heaviest first (ties by pid, so the order never jumps for nothing). */
export function heaviest(processes: readonly ProcessInfo[], by: SortBy, limit: number): ProcessInfo[] {
  const weight = (process: ProcessInfo): number => (by === 'cpu' ? process.cpu : process.memoryBytes)
  return [...processes].sort((a, b) => weight(b) - weight(a) || a.pid - b.pid).slice(0, Math.max(0, limit))
}

/** Who the monitor is: its process, the program that started it and the account it runs as (the system lets it end only that account's programs). */
export interface Own {
  readonly pid: number
  readonly parentPid: number
  readonly user?: string
}

/** Why a process may not be ended from here, or undefined when it may. The system's first process, this app, the program that started it and other accounts' programs are never offered. */
export function protectedReason(process: Pick<ProcessInfo, 'pid'> & { readonly user?: string }, own: Own): string | undefined {
  if (process.pid <= 1) return 'the system needs it'
  if (process.pid === own.pid) return 'this is the monitor itself'
  if (process.pid === own.parentPid) return 'it started the monitor'
  if (own.user !== undefined && process.user !== undefined && process.user !== '' && process.user !== own.user) return `it belongs to ${process.user}`
  return undefined
}

export type KillOutcome =
  | { readonly ok: true; readonly pid: number; readonly name: string; readonly signal: Signal }
  | { readonly ok: false; readonly status: 403 | 404 | 409 | 500; readonly message: string }

export interface KillDeps {
  readonly processes: () => Promise<readonly ProcessInfo[]>
  readonly kill: (pid: number, signal: Signal) => void
  readonly own: Own
}

/**
 * End a process the person chose from the list. The process must still exist and still have the name the person saw (a pid is reused once its program ends), the
 * protected ones are refused, and a refusal by the system (another account's process) is answered, not thrown.
 */
export async function killProcess(deps: KillDeps, request: { readonly pid: number; readonly name: string; readonly signal: Signal }): Promise<KillOutcome> {
  const found = (await deps.processes()).find(process => process.pid === request.pid)
  if (found === undefined) return { ok: false, status: 404, message: `Process ${String(request.pid)} is not running any more.` }
  if (found.name !== request.name) return { ok: false, status: 409, message: `Process ${String(request.pid)} is now ${found.name}, not ${request.name}. Refresh the list.` }
  const reason = protectedReason(found, deps.own)
  if (reason !== undefined) return { ok: false, status: 403, message: `${found.name} is not offered for ending: ${reason}.` }
  try {
    deps.kill(request.pid, request.signal)
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code
    if (code === 'EPERM') return { ok: false, status: 403, message: `${found.name} belongs to another account; the system does not let this app end it.` }
    if (code === 'ESRCH') return { ok: false, status: 404, message: `Process ${String(request.pid)} is not running any more.` }
    return { ok: false, status: 500, message: `${found.name} could not be ended: ${cause instanceof Error ? cause.message : String(cause)}` }
  }
  return { ok: true, pid: found.pid, name: found.name, signal: request.signal }
}
