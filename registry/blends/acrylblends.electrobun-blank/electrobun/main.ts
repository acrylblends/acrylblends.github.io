/**
 * The desktop window on Electrobun instead of Electron: this file runs in Electrobun's main process (Bun) and shows the ACRYL Blends frame, the same
 * frame `npm run dev` serves (sessions on the left, the app in the middle, chat and the agents on the right), in a native window that uses the system
 * webview (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux).
 *
 * It does what `npm run desktop` (plugins/desktop/main.ts) does, with the same functions from plugins/desktop/frame.ts: attach to the frame that already
 * runs for this folder, or start it the way `npm run dev` does and open the address it prints. A frame this window started stops when the window closes.
 *
 * Why the frame host stays on Node: it loads TypeScript and plugins through `node:module` `registerHooks`, which Bun does not have, and its terminals
 * (node-pty) are built for Node. Only the shell changes (the route ACRYL's spec 042 called Option A).
 */
import Electrobun, { BrowserWindow } from 'electrobun/main'
import { frameHome, runningFrame, startFrameHost } from '../plugins/desktop/frame.ts'

const root = process.env.ACRYL_APP_ROOT
if (root === undefined || root === '') {
  console.error('electrobun-blank: start it with `npm run electrobun` in the app folder')
  process.exit(1)
}

const running = await runningFrame(frameHome(root, process.env))
const host = running === undefined ? startFrameHost(root, process.env, (text) => process.stdout.write(text)) : undefined

let url: string
try {
  url = running ?? (await host!.ready)
} catch (error) {
  console.error(`electrobun-blank: ${(error as Error).message}`)
  process.exit(1)
}

// A frame this window started ends with it; one that already ran (a terminal's `npm run dev`) keeps running.
Electrobun.events.on('before-quit', () => void host?.stop())
process.on('exit', () => void host?.stop())

new BrowserWindow({ title: 'electrobun-blank', url, frame: { width: 1280, height: 820, x: 120, y: 80 } })
