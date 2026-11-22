'use strict'
/**
 * node-pty's API on Bun's own terminal (`Bun.spawn({ terminal })`), for the Electrobun build on macOS and Linux. node-pty's native module loads on
 * Bun but its output never arrives (Bun 1.4: onData is never called), so the workspace terminals and the right panel's agents (Claude Code, Codex,
 * Pi) would show nothing. electrobun/pack.mjs puts this file in the bundle as node_modules/node-pty (its package.json names this file), so every
 * `import { spawn } from 'node-pty'` gets a terminal Bun runs itself, and no native module ships.
 * Covers what ACRYL uses: spawn(file, args, { cwd, env, name, cols, rows, encoding }) and pid, cols, rows, process, onData, onExit, write, resize,
 * kill, pause, resume. Windows keeps the real node-pty (ConPTY).
 */
const { constants } = require('node:os')

const SIGNALS = constants.signals
const listen = (list, listener) => {
  list.add(listener)
  return { dispose: () => list.delete(listener) }
}

class BunPty {
  constructor(file, args, options = {}) {
    const env = { ...(options.env ?? process.env) }
    env.TERM = options.name ?? env.TERM ?? 'xterm-256color'
    this.cols = options.cols ?? 80
    this.rows = options.rows ?? 24
    this.process = file
    this._data = new Set()
    this._exit = new Set()
    this._paused = false
    this._held = []
    const decoder = options.encoding === null ? undefined : new TextDecoder()
    this._proc = Bun.spawn([file, ...(typeof args === 'string' ? [args] : args)], {
      cwd: options.cwd ?? process.cwd(),
      env,
      terminal: {
        cols: this.cols,
        rows: this.rows,
        data: (_terminal, bytes) => {
          const chunk = decoder === undefined ? Buffer.from(bytes) : decoder.decode(bytes, { stream: true })
          if (this._paused) this._held.push(chunk)
          else this._emit(chunk)
        },
      },
    })
    this.pid = this._proc.pid
    this._proc.exited.then(() => {
      // node-pty reports the signal as a number (0 when the process exited by itself).
      const signal = this._proc.signalCode == null ? 0 : (SIGNALS[this._proc.signalCode] ?? 0)
      const exitCode = this._proc.exitCode ?? 0
      // Output still held by pause() goes out before the exit, as node-pty delivers it.
      this._flush()
      for (const listener of [...this._exit]) listener({ exitCode, signal })
    })
  }
  get onData() {
    return (listener) => listen(this._data, listener)
  }
  get onExit() {
    return (listener) => listen(this._exit, listener)
  }
  _emit(chunk) {
    for (const listener of [...this._data]) listener(chunk)
  }
  _flush() {
    const held = this._held
    this._held = []
    for (const chunk of held) this._emit(chunk)
  }
  write(data) {
    this._proc.terminal?.write(data)
  }
  resize(cols, rows) {
    this.cols = cols
    this.rows = rows
    this._proc.terminal?.resize(cols, rows)
  }
  kill(signal = 'SIGHUP') {
    try {
      this._proc.kill(signal)
    } catch {}
  }
  pause() {
    this._paused = true
  }
  resume() {
    this._paused = false
    this._flush()
  }
  clear() {}
}

module.exports = { spawn: (file, args, options) => new BunPty(file, args ?? [], options) }
