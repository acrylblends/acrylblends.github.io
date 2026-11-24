/**
 * What an app costs, read from the real processes: its host (the pid its door names) and every process under it (its window's renderer, GPU and
 * helper processes), their memory (resident set) and CPU time. Activity shows the memory; idle sleep reads the CPU time, which barely moves while
 * nobody uses an app.
 */
import { execFile } from 'node:child_process'

export interface Proc { readonly pid: number; readonly ppid: number; readonly rss: number; readonly cpu: number }
export interface Usage { readonly processes: number; readonly rss: number; readonly cpu: number }

/** `[[h:]m]m:ss[.cc]` (ps TIME on macOS and Linux) in seconds. */
export function seconds(time: string): number {
  const [clock, days] = time.includes('-') ? [time.split('-')[1] ?? '', Number(time.split('-')[0])] : [time, 0]
  return clock.split(':').reduce((sum, part) => sum * 60 + Number(part), 0) + days * 86400
}

/** `ps -A -o pid=,ppid=,rss=,time=` (rss in KiB). */
export function parsePs(text: string): Proc[] {
  return text.split('\n').map((line) => line.trim().split(/\s+/u)).filter((f) => f.length >= 4)
    .map(([pid, ppid, rss, time]) => ({ pid: Number(pid), ppid: Number(ppid), rss: Number(rss) * 1024, cpu: seconds(String(time)) }))
    .filter((p) => Number.isFinite(p.pid) && Number.isFinite(p.rss))
}

/** PowerShell's Win32_Process as CSV lines `pid,ppid,workingSet,cpu100ns`. */
export function parseWindows(text: string): Proc[] {
  return text.split(/\r?\n/u).map((line) => line.trim().split(',')).filter((f) => f.length === 4 && /^\d+$/u.test(f[0] ?? ''))
    .map(([pid, ppid, ws, cpu]) => ({ pid: Number(pid), ppid: Number(ppid), rss: Number(ws), cpu: Number(cpu) / 1e7 }))
}

const run = (file: string, args: string[]): Promise<string> => new Promise((resolve, reject) =>
  execFile(file, args, { maxBuffer: 16 * 1024 * 1024, windowsHide: true, timeout: 20000 }, (error, stdout) => (error ? reject(error) : resolve(stdout))))

/** Every process on the computer, once. */
export async function processTable(platform: NodeJS.Platform = process.platform): Promise<Proc[]> {
  if (platform !== 'win32') return parsePs(await run('ps', ['-A', '-o', 'pid=,ppid=,rss=,time=']))
  const script = 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId),$($_.ParentProcessId),$($_.WorkingSetSize),$($_.KernelModeTime + $_.UserModeTime)" }'
  return parseWindows(await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]))
}

/** A process and everything under it, added up. */
export function usageOf(table: readonly Proc[], root: number): Usage | undefined {
  if (!table.some((p) => p.pid === root)) return undefined
  const children = new Map<number, Proc[]>()
  for (const p of table) if (p.pid !== p.ppid) children.set(p.ppid, [...(children.get(p.ppid) ?? []), p])
  let processes = 0; let rss = 0; let cpu = 0
  const seen = new Set<number>()
  const walk = (pid: number): void => {
    if (seen.has(pid)) return
    seen.add(pid)
    const self = table.find((p) => p.pid === pid)
    if (self !== undefined) { processes += 1; rss += self.rss; cpu += self.cpu }
    for (const child of children.get(pid) ?? []) walk(child.pid)
  }
  walk(root)
  return { processes, rss, cpu }
}

/**
 * Idle sleep: an app whose processes spent less than `busyCpu` seconds of CPU in each check for `after` ms is asleep-worthy. Pure, so a test feeds it
 * readings. Opening an app (or AOS driving it) counts as use.
 */
export class IdleClock {
  private readonly seen = new Map<string, { cpu: number, active: number }>()
  private readonly busyCpu: number
  constructor(busyCpu = 0.5) { this.busyCpu = busyCpu }
  /** Note a reading; answers whether the app has been idle for `after` ms. */
  idle(id: string, cpu: number, now: number, after: number): boolean {
    const last = this.seen.get(id)
    const busy = last === undefined || cpu < last.cpu || cpu - last.cpu >= this.busyCpu
    const active = busy ? now : last.active
    this.seen.set(id, { cpu, active })
    return !busy && after > 0 && now - active >= after
  }
  used(id: string, now: number): void { const last = this.seen.get(id); if (last !== undefined) last.active = now }
  forget(id: string): void { this.seen.delete(id) }
}
