/**
 * What an app costs, read from the real processes: every process whose command line names the app's folder or its window bundle (its
 * `acryl-desktop` launcher, its Electron main) and every process under those (renderer, GPU and helper processes, its host), their memory
 * (resident set) and CPU time. Command lines, not the pid in the app's door.json: that file outlives the app, so its pid can be stale. Activity shows the memory; idle sleep reads the CPU time, which barely moves while
 * nobody uses an app.
 */
import { execFile } from 'node:child_process'

export interface Proc { readonly pid: number; readonly ppid: number; readonly rss: number; readonly cpu: number; readonly command: string }
export interface Usage { readonly processes: number; readonly rss: number; readonly cpu: number }

/** `[[h:]m]m:ss[.cc]` (ps TIME on macOS and Linux) in seconds. */
export function seconds(time: string): number {
  const [clock, days] = time.includes('-') ? [time.split('-')[1] ?? '', Number(time.split('-')[0])] : [time, 0]
  return clock.split(':').reduce((sum, part) => sum * 60 + Number(part), 0) + days * 86400
}

/** `ps -A -o pid=,ppid=,rss=,time=,command=` (rss in KiB). */
export function parsePs(text: string): Proc[] {
  return text.split('\n').map((line) => line.trim().split(/\s+/u)).filter((f) => f.length >= 4)
    .map(([pid, ppid, rss, time, ...command]) => ({ pid: Number(pid), ppid: Number(ppid), rss: Number(rss) * 1024, cpu: seconds(String(time)), command: command.join(' ') }))
    .filter((p) => Number.isFinite(p.pid) && Number.isFinite(p.rss))
}

/** PowerShell's Win32_Process as CSV lines `pid,ppid,workingSet,cpu100ns,commandLine` (the command line may hold commas). */
export function parseWindows(text: string): Proc[] {
  return text.split(/\r?\n/u).map((line) => line.trim().split(',')).filter((f) => f.length >= 4 && /^\d+$/u.test(f[0] ?? ''))
    .map(([pid, ppid, ws, cpu, ...command]) => ({ pid: Number(pid), ppid: Number(ppid), rss: Number(ws), cpu: Number(cpu) / 1e7, command: command.join(',') }))
}

const run = (file: string, args: string[]): Promise<string> => new Promise((resolve, reject) =>
  execFile(file, args, { maxBuffer: 16 * 1024 * 1024, windowsHide: true, timeout: 20000 }, (error, stdout) => (error ? reject(error) : resolve(stdout))))

/** Every process on the computer, once. */
export async function processTable(platform: NodeJS.Platform = process.platform): Promise<Proc[]> {
  if (platform !== 'win32') return parsePs(await run('ps', ['-A', '-ww', '-o', 'pid=,ppid=,rss=,time=,command=']))
  const script = 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId),$($_.ParentProcessId),$($_.WorkingSetSize),$($_.KernelModeTime + $_.UserModeTime),$($_.CommandLine)" }'
  return parseWindows(await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]))
}

const fold = (path: string): string => path.replaceAll('\\', '/').toLowerCase()

/** The processes whose command line holds one of `marks` (folders), and everything under them, added up; undefined when none runs. */
export function usageOf(table: readonly Proc[], marks: readonly string[]): Usage | undefined {
  const wanted = marks.map(fold)
  const roots = table.filter((p) => p.pid !== process.pid && wanted.some((mark) => fold(p.command).includes(mark)))
  if (roots.length === 0) return undefined
  const children = new Map<number, Proc[]>()
  for (const p of table) if (p.pid !== p.ppid) children.set(p.ppid, [...(children.get(p.ppid) ?? []), p])
  let processes = 0; let rss = 0; let cpu = 0
  const seen = new Set<number>()
  const walk = (p: Proc): void => {
    if (seen.has(p.pid)) return
    seen.add(p.pid)
    processes += 1; rss += p.rss; cpu += p.cpu
    for (const child of children.get(p.pid) ?? []) walk(child)
  }
  for (const root of roots) walk(root)
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
