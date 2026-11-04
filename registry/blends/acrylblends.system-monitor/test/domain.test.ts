import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CLIENT_FORMAT } from '../src/monitor/client.ts'
import { formatBytes, formatDuration } from '../src/monitor/format.ts'
import { heaviest, killProcess, protectedReason, type KillDeps, type Signal } from '../src/monitor/kill-list.ts'
import { defaultDiskPaths, diskOf, memoryOf, parseMeminfo, parsePs, parseTasklist, parseVmStat, readSnapshot, type ProcessInfo, type Sources } from '../src/monitor/system.ts'

const PS = `    1  0.0   9120 root     /sbin/launchd
  412  1.5 204800 alex     /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
  777 38.2 655360 alex     node
  901  0.1   1024 alex     /usr/bin/python3
nonsense line
`

test('parsePs reads ps output, keeps program names with spaces and drops the folder', () => {
  const found = parsePs(PS)
  assert.equal(found.length, 4)
  assert.deepEqual(found[1], { pid: 412, name: 'Google Chrome', cpu: 1.5, memoryBytes: 204800 * 1024, user: 'alex' })
  assert.equal(found[3]?.name, 'python3')
})

test('parseTasklist reads the CSV with thousands separators in the memory column', () => {
  const found = parseTasklist('"chrome.exe","4120","Console","1","201,328 K"\r\n"System","4","Services","0","144 K"\r\nINFO: nothing\r\n')
  assert.deepEqual(found, [
    { pid: 4120, name: 'chrome.exe', cpu: 0, memoryBytes: 201328 * 1024, user: '' },
    { pid: 4, name: 'System', cpu: 0, memoryBytes: 144 * 1024, user: '' },
  ])
})

test('memory and disk shares are rounded to a tenth and never negative', () => {
  assert.deepEqual(memoryOf(1000, 250), { totalBytes: 1000, usedBytes: 750, freeBytes: 250, usedPercent: 75 })
  assert.equal(memoryOf(0, 0).usedPercent, 0)
  assert.equal(diskOf('/', 3, 1).usedPercent, 66.7)
  assert.equal(diskOf('/', 10, 20).usedBytes, 0)
})

test('available memory is read from vm_stat (macOS) and /proc/meminfo (Linux)', () => {
  const vm = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               1000.
Pages active:                           500000.
Pages inactive:                           3000.
Pages speculative:                         200.
Pages purgeable:                            50.
`
  assert.equal(parseVmStat(vm), (1000 + 3000 + 200) * 16384)
  assert.equal(parseVmStat('something else'), undefined)
  assert.equal(parseMeminfo('MemTotal:       16384000 kB\nMemFree:          100000 kB\nMemAvailable:    8192000 kB\n'), 8192000 * 1024)
  assert.equal(parseMeminfo('MemTotal: 1 kB\n'), undefined)
})

test('the system drive is the disk shown by default', () => {
  assert.deepEqual(defaultDiskPaths('darwin', '/Users/a'), ['/'])
  assert.deepEqual(defaultDiskPaths('linux', '/home/a'), ['/'])
})

const process = (pid: number, name: string, cpu: number, mib: number): ProcessInfo => ({ pid, name, cpu, memoryBytes: mib * 1024 * 1024, user: 'alex' })
const SAMPLE = [process(10, 'a', 5, 100), process(11, 'b', 50, 20), process(12, 'c', 1, 900), process(13, 'd', 50, 20)]

test('heaviest sorts by memory or CPU, breaks ties by pid and cuts at the limit', () => {
  assert.deepEqual(heaviest(SAMPLE, 'memory', 2).map(p => p.name), ['c', 'a'])
  assert.deepEqual(heaviest(SAMPLE, 'cpu', 3).map(p => p.name), ['b', 'd', 'a'])
  assert.deepEqual(heaviest(SAMPLE, 'cpu', 0), [])
  assert.equal(SAMPLE[0]?.name, 'a')
})

test('the first process, the monitor and its parent are never offered for ending', () => {
  const own = { pid: 500, parentPid: 400 }
  assert.match(protectedReason({ pid: 1 }, own) ?? '', /system/)
  assert.match(protectedReason({ pid: 500 }, own) ?? '', /monitor itself/)
  assert.match(protectedReason({ pid: 400 }, own) ?? '', /started/)
  assert.equal(protectedReason({ pid: 401 }, own), undefined)
})

test("another account's programs are not offered, and a list that names no account offers all", () => {
  const own = { pid: 500, parentPid: 400, user: 'alex' }
  assert.equal(protectedReason({ pid: 600, user: 'alex' }, own), undefined)
  assert.equal(protectedReason({ pid: 600, user: 'root' }, own), 'it belongs to root')
  assert.equal(protectedReason({ pid: 600, user: '' }, own), undefined)
  assert.equal(protectedReason({ pid: 600, user: 'root' }, { pid: 500, parentPid: 400 }), undefined)
})

function killer(processes: readonly ProcessInfo[], fail?: string) {
  const sent: Array<[number, Signal]> = []
  const deps: KillDeps = {
    processes: async () => processes,
    kill: (pid, signal) => {
      if (fail !== undefined) throw Object.assign(new Error(fail), { code: fail })
      sent.push([pid, signal])
    },
    own: { pid: 500, parentPid: 400 },
  }
  return { deps, sent }
}

test('killProcess ends the process the person saw, with the signal they chose', async () => {
  const { deps, sent } = killer(SAMPLE)
  const outcome = await killProcess(deps, { pid: 12, name: 'c', signal: 'SIGTERM' })
  assert.deepEqual(outcome, { ok: true, pid: 12, name: 'c', signal: 'SIGTERM' })
  assert.deepEqual(sent, [[12, 'SIGTERM']])
})

test('killProcess refuses a process that is gone, renamed or protected, and sends nothing', async () => {
  const { deps, sent } = killer([...SAMPLE, process(1, 'launchd', 0, 9), process(500, 'node', 3, 80)])
  assert.deepEqual(await killProcess(deps, { pid: 99, name: 'x', signal: 'SIGTERM' }), { ok: false, status: 404, message: 'Process 99 is not running any more.' })
  const renamed = await killProcess(deps, { pid: 12, name: 'old-name', signal: 'SIGTERM' })
  assert.equal(renamed.ok === false && renamed.status, 409)
  assert.equal((await killProcess(deps, { pid: 1, name: 'launchd', signal: 'SIGKILL' })).ok, false)
  const self = await killProcess(deps, { pid: 500, name: 'node', signal: 'SIGKILL' })
  assert.equal(self.ok === false && self.status, 403)
  assert.deepEqual(sent, [])
})

test('killProcess answers the system refusing (another account, or just gone) instead of throwing', async () => {
  const perm = await killProcess(killer(SAMPLE, 'EPERM').deps, { pid: 12, name: 'c', signal: 'SIGTERM' })
  assert.equal(perm.ok === false && perm.status, 403)
  const gone = await killProcess(killer(SAMPLE, 'ESRCH').deps, { pid: 12, name: 'c', signal: 'SIGTERM' })
  assert.equal(gone.ok === false && gone.status, 404)
  const other = await killProcess(killer(SAMPLE, 'EIO').deps, { pid: 12, name: 'c', signal: 'SIGTERM' })
  assert.equal(other.ok === false && other.status, 500)
})

test('formatBytes and formatDuration read the way a person says them', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(1536), '1.5 KB')
  assert.equal(formatBytes(250 * 1024 * 1024), '250 MB')
  assert.equal(formatBytes(16 * 1024 ** 3), '16.0 GB')
  assert.equal(formatDuration(59), '0m')
  assert.equal(formatDuration(3 * 3600 + 120), '3h 2m')
  assert.equal(formatDuration(2 * 86400 + 5 * 3600), '2d 5h')
})

test("the page script's formatters give the same text as the server's", () => {
  const client = new Function(`${CLIENT_FORMAT}; return { formatBytes, formatDuration }`)() as { formatBytes(n: number): string; formatDuration(n: number): string }
  for (const bytes of [0, 1, 1023, 1024, 1536, 5 * 1024 ** 2, 123456789, 16 * 1024 ** 3, 3 * 1024 ** 4]) assert.equal(client.formatBytes(bytes), formatBytes(bytes), String(bytes))
  for (const seconds of [0, 59, 60, 3599, 3600, 86399, 86400, 200000]) assert.equal(client.formatDuration(seconds), formatDuration(seconds), String(seconds))
})

const fake: Sources = {
  now: () => 1_700_000_000_000,
  host: () => 'test-machine',
  platform: () => 'linux',
  uptimeSeconds: () => 90_000,
  cpuCount: () => 8,
  load: () => [0.5, 0.4, 0.3],
  memory: async () => ({ totalBytes: 16 * 1024 ** 3, freeBytes: 4 * 1024 ** 3 }),
  disk: async (path) => {
    if (path === '/bad') throw new Error('no such disk')
    return { totalBytes: 500 * 1024 ** 3, freeBytes: 125 * 1024 ** 3 }
  },
  processList: async () => PS,
}

test('readSnapshot gathers the machine, skips a disk it cannot read and lists the same disk once', async () => {
  const snapshot = await readSnapshot(fake, ['/', '/bad', '/home'])
  assert.equal(snapshot.host, 'test-machine')
  assert.equal(snapshot.memory.usedPercent, 75)
  assert.deepEqual(snapshot.disks.map(d => d.mount), ['/'])
  assert.equal(snapshot.disks[0]?.usedPercent, 75)
  assert.equal(snapshot.processes.length, 4)
})

test('readSnapshot survives a machine with no process list', async () => {
  const snapshot = await readSnapshot({ ...fake, processList: async () => { throw new Error('no ps') } }, ['/'])
  assert.deepEqual(snapshot.processes, [])
  assert.equal(snapshot.cpuCount, 8)
})
