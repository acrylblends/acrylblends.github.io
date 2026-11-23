/**
 * The Electrobun build's host runner, in place of the Electron shell's watch-host.mjs (same arguments, same output lines). watch-host restarts the
 * host on every saved change of the app's files, and a restart ends every terminal in the frame, so an agent in the right panel that adds or edits a
 * plugin ended its own session. The frame already loads the app's changed code again inside the running host (@acryldev/blends-frame AppReloader:
 * src/, plugins/ and blend.yaml, a new plugin and its row included), so here a change restarts the host only when it is not running: after a crash,
 * the next real change (an agent's fix) starts it again, as watch-host does. Its lines are node --watch's (`Restarting '<script>'`,
 * `Failed running '<script>'`): electrobun/main.ts reloads the window on a restart.
 *
 * An app whose page root is not the Blends frame (ACRYL ADE mounts the workbench, @acryldev/workspace) has no in-place reload: with
 * --restart-on-change a change restarts the running host, as watch-host does (its terminals end with it; edits in the projects it opens are
 * not watched, only the app's own source).
 *
 *   <runtime> run-host.mjs [--restart-on-change] --watch-path=<file or folder> ... -- <runtime arguments> <script>
 */
import { spawn } from 'node:child_process'
import { readdirSync, statSync, watch } from 'node:fs'
import { join } from 'node:path'

const SKIPPED = new Set(['node_modules', '.git'])
const SETTLE_MS = 200
const GRACE_MS = 5_000

/** `size:mtime` of every file under `paths`, by path (access time never counts: macOS reports it as a change). */
export function snapshot(paths) {
  const files = new Map()
  const visit = (path) => {
    let stat
    try {
      stat = statSync(path)
    } catch {
      return
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(path)) if (!SKIPPED.has(name)) visit(join(path, name))
    } else files.set(path, `${String(stat.size)}:${String(stat.mtimeMs)}`)
  }
  for (const path of paths) visit(path)
  return files
}

export function changed(before, after) {
  if (before.size !== after.size) return true
  for (const [path, mark] of after) if (before.get(path) !== mark) return true
  return false
}

function main(argv) {
  const split = argv.indexOf('--')
  if (split === -1) throw new Error('run-host: usage: run-host.mjs [--restart-on-change] --watch-path=<path> ... -- <runtime arguments> <script>')
  const paths = argv.slice(0, split).filter((a) => a.startsWith('--watch-path=')).map((a) => a.slice('--watch-path='.length))
  const restartOnChange = argv.slice(0, split).includes('--restart-on-change')
  const command = argv.slice(split + 1)
  const script = command.at(-1)
  let files = snapshot(paths)
  let child
  const start = () => {
    child = spawn(process.execPath, command, { stdio: 'inherit', env: process.env })
    const current = child
    current.once('exit', (code) => {
      if (current !== child) return
      child = undefined
      console.log(`${code === 0 ? 'Completed' : 'Failed'} running '${script}'. Waiting for file changes before restarting...`)
    })
  }
  /** End `proc` (SIGTERM, then SIGKILL after GRACE_MS); resolves once it exited. */
  const end = (proc) =>
    new Promise((done) => {
      if (proc.exitCode !== null || proc.signalCode !== null) return done()
      const killer = setTimeout(() => proc.kill('SIGKILL'), GRACE_MS)
      proc.once('exit', () => {
        clearTimeout(killer)
        done()
      })
      proc.kill('SIGTERM')
    })
  let timer
  // One check at a time: a burst that settles while a host is still stopping is checked again after it, never two hosts on one port.
  let busy = false
  let again = false
  const check = async () => {
    if (busy) {
      again = true
      return
    }
    busy = true
    try {
      do {
        again = false
        const next = snapshot(paths)
        if (!changed(files, next)) continue
        files = next
        // A running host loads the change itself (the Blends frame); only a host that ended, or every host with --restart-on-change, starts again.
        if (child !== undefined && !restartOnChange) continue
        console.log(`Restarting '${script}'`)
        const previous = child
        // Its exit is this restart, not a crash: cleared first, so no "Failed running" line is printed for it.
        child = undefined
        if (previous !== undefined) await end(previous)
        start()
      } while (again)
    } finally {
      busy = false
    }
  }
  for (const path of paths) {
    let recursive
    try {
      recursive = statSync(path).isDirectory()
    } catch {
      continue
    }
    watch(path, { recursive }, () => {
      clearTimeout(timer)
      timer = setTimeout(() => void check(), SETTLE_MS)
    })
  }
  const stop = () => {
    if (child === undefined) return process.exit(0)
    void end(child).then(() => process.exit(0))
  }
  for (const name of ['SIGTERM', 'SIGINT']) process.once(name, stop)
  start()
}

if (import.meta.main) main(process.argv.slice(2))
