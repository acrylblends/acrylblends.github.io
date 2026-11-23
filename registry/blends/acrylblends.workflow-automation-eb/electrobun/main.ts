/**
 * The installed ACRYL Blends Blank app on Electrobun instead of Electron. This file is Electrobun's main process (Bun); the window is the system
 * webview (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux).
 *
 * It does what @acryldev/desktop-shell's Electron main does for a packed product, with the same steps (electrobun/shell-core.mjs is a copy of them):
 * open the product's app in ~/.acryl (on the first start, make it from the bundled Blank app), start the frame host from the bundle (the Program),
 * and open one window on the address it prints. The frame host runs on Electrobun's own Bun (default) or on a Node shipped in the bundle
 * (`pack.mjs --host node`). Closing the window stops the host.
 */
import Electrobun, { ApplicationMenu, BrowserWindow, Utils } from 'electrobun/main'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { linkProgram, openProduct, startFrameHost } from './shell-core.mjs'

// Electrobun starts the main process in the bundle's bin folder (macOS: Contents/MacOS); its resources are ../Resources (electrobun/main Paths.ts).
const resources = resolve('../Resources')
const app = join(resources, 'app')
const program = join(app, 'payload')
// Which host: the bundled Node when the build ships one (`pack.mjs --host node`), else Electrobun's own Bun (`--host bun`, the default).
const node = join(app, 'node', process.platform === 'win32' ? 'node.exe' : 'node')
const onBun = !existsSync(node)
const build = (() => {
  try {
    return JSON.parse(readFileSync(join(resources, 'version.json'), 'utf8')) as { version?: string; hash?: string; channel?: string; identifier?: string }
  } catch {
    return {}
  }
})()
const version = String(build.version ?? '0.0.0')
// Electrobun's first start leaves a list of every file it unpacked (self-extraction/<hash>.recipe.json, 38 MB). This build has no updater
// (updateAuthority none) and starts without the list (tested on macOS: removed, the app starts and Electrobun does not write it again).
if (build.hash !== undefined && build.identifier !== undefined) {
  const data =
    process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support')
      : process.platform === 'win32'
        ? (process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'))
        : (process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'))
  rmSync(join(data, build.identifier, build.channel ?? 'stable', 'self-extraction', `${build.hash}.recipe.json`), { force: true })
}
const vcs = join(app, 'vcs', 'bin')
const vcsBin = existsSync(vcs) ? vcs : undefined
// The bundled Git's builtin names travel as a list (electrobun/pack.mjs): make the links once, in the app Electrobun unpacked.
const linksFile = join(app, 'vcs', 'links.json')
if (existsSync(linksFile)) {
  const core = join(app, 'vcs', 'libexec', 'git-core')
  for (const { name, to } of JSON.parse(readFileSync(linksFile, 'utf8')) as { name: string; to: string }[])
    if (!existsSync(join(core, name))) {
      try {
        symlinkSync(to, join(core, name))
      } catch {}
    }
}
const title = 'ACRYL Blends (Electrobun)'

ApplicationMenu.setApplicationMenu([
  {
    submenu: [
      { role: 'about' },
      { type: 'divider' },
      { role: 'hide', accelerator: 'h' },
      { role: 'hideOthers' },
      { role: 'showAll' },
      { type: 'divider' },
      { role: 'quit', accelerator: 'q' },
    ],
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'divider' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  },
  { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] },
])

const started = performance.now()
const { chosen, instance, product } = await openProduct({ program, vcsBin, version })
const logs = join(chosen.home, 'logs')
mkdirSync(logs, { recursive: true })
const logFile = join(logs, 'electrobun-host.log')
// On Bun the Program is linked into the app's source (no registerHooks for the bundle overlay) and the host starts from there, with the
// registerHooks shim (bun-node-hooks.mjs) first. --no-install: Bun must never fetch a missing package from its global cache.
if (onBun) linkProgram(program, chosen.root, product.program)
const host = startFrameHost({
  program,
  chosen,
  instance,
  runtime: onBun ? process.execPath : node,
  ...(onBun
    ? {
        preloadFlag: '--preload',
        runtimeArgs: ['--no-install', '--preserve-symlinks'],
        preloads: [join(app, 'bun-node-hooks.mjs'), join(program, 'node_modules', '@acryldev', 'node-server', 'lib', 'register.js')],
        hostScript: join(chosen.root, 'scripts', 'ide-host.mjs'),
      }
    : {}),
  // The frame reloads an edited app inside the running host; a restart would end the agents' terminals (run-host.mjs).
  runner: join(app, 'run-host.mjs'),
  // An app whose page root is the ADE workbench, not the Blends frame, has no in-place reload: there a change restarts the host.
  runnerArgs: pageRootReloadsInPlace(chosen.root) ? [] : ['--restart-on-change'],
  vcsBin,
  write: (text: string) => {
    process.stdout.write(text)
    try {
      appendFileSync(logFile, text)
    } catch {}
    reloadOnRestart(text)
  },
})

/**
 * A saved change in the app's source or plugins restarts the host (watch-host), and the window then loads the restarted host's address, so the person
 * and the agent see the change without reloading by hand. The Electron shell does the same (desktop-shell main.js, startHost: hostRestarting).
 */
let window: BrowserWindow | undefined
let restarting = false
let pending = ''
function reloadOnRestart(text: string): void {
  pending = (pending + text).slice(-4000)
  if (/Restarting '/u.test(text)) {
    restarting = true
    pending = text.slice(text.lastIndexOf("Restarting '"))
  }
  if (!restarting) return
  const again = /acrylblends host: (http:\/\/\S+)/u.exec(pending)?.[1]
  if (again === undefined || window === undefined) return
  restarting = false
  pending = ''
  window.webview.loadURL(again)
}

/** Whether the app's page root is the Blends frame (it loads a changed app inside the running host), read from the overlay it mounts. */
function pageRootReloadsInPlace(root: string): boolean {
  try {
    return !/^\s+name: (?:'@acryldev\/workspace'|acryl-workspace)\s*$/mu.test(readFileSync(join(root, 'cordis.patch.yml'), 'utf8'))
  } catch {
    return true
  }
}

let stopped = false
const stopHost = async () => {
  if (stopped) return
  stopped = true
  await host.stop()
}
// The host is its own process group: quitting waits for it to end, then quits for real, so closing the window leaves no process behind.
Electrobun.events.on('before-quit', (event: { response?: { allow: boolean } }) => {
  if (stopped) return
  event.response = { allow: false }
  void stopHost().then(() => Utils.quit())
})
process.on('exit', () => {
  if (!stopped) void host.stop()
})
// A logout or `kill` ends the app with a signal, not through Quit: stop the host first there too.
for (const name of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const)
  process.on(name, () => {
    void stopHost().then(() => process.exit(0))
  })

// A host that fails to start keeps its watcher waiting for a file change, so `ready` never settles: give it a time limit and say why it stopped.
const HOST_START_LIMIT_MS = 180_000
let url: string
try {
  url = await Promise.race([
    host.ready,
    new Promise<never>((_, fail) =>
      setTimeout(() => fail(new Error(`the frame host did not serve within ${HOST_START_LIMIT_MS / 1000} s:\n${host.output().slice(-1500)}`)), HOST_START_LIMIT_MS),
    ),
  ])
} catch (error) {
  const message = (error as Error).message
  console.error(`workflow-automation-eb: ${message}`)
  await stopHost()
  await Utils.showMessageBox({ type: 'error', title, message: `${title} cannot start`, detail: `${message.slice(-1200)}\n\nThe whole output is in ${logFile}`, buttons: ['Quit'] })
  process.exit(1)
}
console.log(`workflow-automation-eb: frame host ready after ${(performance.now() - started).toFixed(0)} ms`)

const origin = new URL(url).origin
window = new BrowserWindow({ title, url, frame: { width: 1280, height: 820, x: 120, y: 80 } })
// Links to other sites open in the person's browser, as the Electron shell does (navigation() in desktop-shell frame.ts).
window.webview.on('will-navigate', (event: { data?: { url?: string }; response?: { allow: boolean } }) => {
  const target = event.data?.url
  if (target === undefined) return
  try {
    const parsed = new URL(target)
    if (parsed.origin === origin || !/^(https?|mailto):$/u.test(parsed.protocol)) return
    event.response = { allow: false }
    Utils.openExternal(target)
  } catch {}
})
