/**
 * What this machine is doing right now: its memory, its disks and its processes. Pure parsing and small readers, with the operating system behind
 * one `Sources` object, so a test hands in a fake machine and the page shows a believable one without touching the real one.
 */
import { execFile } from 'node:child_process'
import { readFile, statfs } from 'node:fs/promises'
import os from 'node:os'
import { basename, parse } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

export interface Memory {
  readonly totalBytes: number
  readonly usedBytes: number
  readonly freeBytes: number
  readonly usedPercent: number
}

export interface Disk {
  readonly mount: string
  readonly totalBytes: number
  readonly usedBytes: number
  readonly freeBytes: number
  readonly usedPercent: number
}

export interface ProcessInfo {
  readonly pid: number
  /** The program's name, without its folder. */
  readonly name: string
  /** CPU share in percent, as the system's process list reports it (can pass 100 on a machine with several cores). */
  readonly cpu: number
  readonly memoryBytes: number
  /** The account that runs it; empty where the system does not say. */
  readonly user: string
}

export interface Snapshot {
  readonly at: number
  readonly host: string
  readonly platform: string
  readonly uptimeSeconds: number
  readonly cpuCount: number
  /** The 1, 5 and 15 minute load averages; zeros where the system has none (Windows). */
  readonly load: readonly [number, number, number]
  readonly memory: Memory
  readonly disks: readonly Disk[]
  readonly processes: readonly ProcessInfo[]
}

/** The operating system, as far as the monitor needs it. */
export interface Sources {
  now(): number
  host(): string
  platform(): string
  uptimeSeconds(): number
  cpuCount(): number
  load(): readonly [number, number, number]
  /** Memory a program could still use: free plus what the system gives back on demand (caches), not just the pages nobody touched. */
  memory(): Promise<{ readonly totalBytes: number; readonly freeBytes: number }>
  /** Total and free bytes of the disk that holds `path`. */
  disk(path: string): Promise<{ readonly totalBytes: number; readonly freeBytes: number }>
  /** The raw process list: `ps` output on macOS and Linux, `tasklist` CSV on Windows. */
  processList(): Promise<string>
}

const percent = (part: number, whole: number): number => (whole <= 0 ? 0 : Math.round((part / whole) * 1000) / 10)

export function memoryOf(total: number, free: number): Memory {
  const used = Math.max(0, total - free)
  return { totalBytes: total, usedBytes: used, freeBytes: free, usedPercent: percent(used, total) }
}

export function diskOf(mount: string, total: number, free: number): Disk {
  const used = Math.max(0, total - free)
  return { mount, totalBytes: total, usedBytes: used, freeBytes: free, usedPercent: percent(used, total) }
}

/** The memory a program could still use, from `vm_stat` (macOS): the free, inactive and speculative pages, which the system gives back when asked. Undefined when the text is not `vm_stat`'s. */
export function parseVmStat(text: string): number | undefined {
  const size = /page size of (\d+) bytes/u.exec(text)?.[1]
  if (size === undefined) return undefined
  const pages = (label: string): number => Number(new RegExp(`^Pages ${label}:\\s+(\\d+)\\.`, 'mu').exec(text)?.[1] ?? 0)
  return (pages('free') + pages('inactive') + pages('speculative')) * Number(size)
}

/** `MemAvailable` from `/proc/meminfo` (Linux), in bytes: what a program could use without swapping. Undefined when the line is missing. */
export function parseMeminfo(text: string): number | undefined {
  const kib = /^MemAvailable:\s+(\d+) kB/mu.exec(text)?.[1]
  return kib === undefined ? undefined : Number(kib) * 1024
}

/** The command that lists processes here: id, CPU %, resident memory in KiB, account and program, with no header line. */
export const PS_ARGS = ['-axo', 'pid=,pcpu=,rss=,user=,comm='] as const

/** Parse `ps -axo pid=,pcpu=,rss=,user=,comm=`. A line that does not fit is skipped; the program's name loses its folder (macOS prints the full path). */
export function parsePs(text: string): ProcessInfo[] {
  const found: ProcessInfo[] = []
  for (const line of text.split('\n')) {
    const match = /^\s*(\d+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/u.exec(line)
    if (match === null) continue
    const name = basename((match[5] ?? '').trim())
    if (name === '') continue
    found.push({ pid: Number(match[1]), name, cpu: Number(match[2]), memoryBytes: Number(match[3]) * 1024, user: match[4] ?? '' })
  }
  return found
}

/** Parse `tasklist /fo csv /nh`: `"Image Name","PID","Session Name","Session#","Mem Usage"`, memory as `12,345 K`. Windows gives no CPU share here. */
export function parseTasklist(text: string): ProcessInfo[] {
  const found: ProcessInfo[] = []
  for (const line of text.split(/\r?\n/u)) {
    const cells = [...line.matchAll(/"([^"]*)"/gu)].map(cell => cell[1] ?? '')
    if (cells.length < 5) continue
    const pid = Number(cells[1])
    const kib = Number((cells[4] ?? '').replace(/[^\d]/gu, ''))
    if (!Number.isInteger(pid) || cells[0] === '') continue
    found.push({ pid, name: cells[0] ?? '', cpu: 0, memoryBytes: kib * 1024, user: '' })
  }
  return found
}

export function parseProcesses(platform: string, text: string): ProcessInfo[] {
  return platform === 'win32' ? parseTasklist(text) : parsePs(text)
}

/** The folders whose disks are shown: the root of the system drive, or `/`. */
export function defaultDiskPaths(platform: string, cwd: string): string[] {
  return platform === 'win32' ? [parse(cwd).root] : ['/']
}

/** Read everything. A disk that cannot be read is left out, and a process list that cannot be read is empty: the page says so instead of failing. */
export async function readSnapshot(sources: Sources, diskPaths: readonly string[]): Promise<Snapshot> {
  const platform = sources.platform()
  const memory = await sources.memory()
  const disks: Disk[] = []
  const seen = new Set<string>()
  for (const path of diskPaths) {
    try {
      const { totalBytes, freeBytes } = await sources.disk(path)
      const key = `${String(totalBytes)}:${String(freeBytes)}`
      if (seen.has(key)) continue
      seen.add(key)
      disks.push(diskOf(path, totalBytes, freeBytes))
    } catch {
      // a disk that cannot be read is not shown
    }
  }
  let processes: ProcessInfo[] = []
  try {
    processes = parseProcesses(platform, await sources.processList())
  } catch {
    // no process list on this machine
  }
  return {
    at: sources.now(),
    host: sources.host(),
    platform,
    uptimeSeconds: sources.uptimeSeconds(),
    cpuCount: sources.cpuCount(),
    load: sources.load(),
    memory: memoryOf(memory.totalBytes, memory.freeBytes),
    disks,
    processes,
  }
}

/** The real machine. */
export const machine: Sources = {
  now: () => Date.now(),
  host: () => os.hostname(),
  platform: () => process.platform,
  uptimeSeconds: () => Math.round(os.uptime()),
  cpuCount: () => os.availableParallelism(),
  load: () => {
    const [one = 0, five = 0, fifteen = 0] = os.loadavg()
    return [one, five, fifteen]
  },
  memory: async () => {
    // `os.freemem()` counts only untouched pages, so a machine that has been up a while looks full: ask the system what it could still give.
    let available: number | undefined
    try {
      if (process.platform === 'darwin') available = parseVmStat((await run('vm_stat')).stdout)
      else if (process.platform === 'linux') available = parseMeminfo(await readFile('/proc/meminfo', 'utf8'))
    } catch {
      available = undefined
    }
    return { totalBytes: os.totalmem(), freeBytes: Math.min(os.totalmem(), available ?? os.freemem()) }
  },
  disk: async (path) => {
    const stats = await statfs(path)
    return { totalBytes: stats.blocks * stats.bsize, freeBytes: stats.bavail * stats.bsize }
  },
  processList: async () => {
    if (process.platform === 'win32') return (await run('tasklist', ['/fo', 'csv', '/nh'], { maxBuffer: 16 * 1024 * 1024 })).stdout
    return (await run('ps', [...PS_ARGS], { maxBuffer: 16 * 1024 * 1024 })).stdout
  },
}
