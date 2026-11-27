/**
 * HyperFrames (Apache-2.0, heygen-com/hyperframes) as the machine's renderer for everything drawn: captions, the title card, pictures laid over the
 * video, the vertical shorts and the thumbnail. A composition is a folder with an `index.html` (the HyperFrames contract: a root with
 * `data-composition-id`, timed `.clip` elements, one paused GSAP timeline in `window.__timelines`); this module writes the folder's assets and runs
 * `hyperframes render` from the app's own dependency with the system Chrome.
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { run } from './media.ts'
import { Refusal } from './model.ts'

const require = createRequire(import.meta.url)

function binOf(pkg: string, bin: string): string {
  let manifest: string
  try {
    manifest = require.resolve(`${pkg}/package.json`)
  } catch {
    throw new Refusal('unavailable', `${pkg} is not installed: run npm install in the app's folder`)
  }
  const bins = (JSON.parse(readFileSync(manifest, 'utf8')) as { bin?: Record<string, string> }).bin ?? {}
  const file = bins[bin]
  if (!file) throw new Refusal('unavailable', `${pkg} has no ${bin} program`)
  return join(dirname(manifest), file)
}

/** A fresh composition folder with GSAP next to it (no network at render time). */
export function compositionDir(dir: string): string {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  copyFileSync(require.resolve('gsap/dist/gsap.min.js'), join(dir, 'gsap.min.js'))
  return dir
}

export interface RenderOptions {
  readonly signal?: AbortSignal
  readonly onProgress?: (fraction: number) => void
  readonly quality?: 'draft' | 'standard' | 'high'
  readonly format?: 'mp4' | 'png-sequence'
}

/** Renders the composition folder to `output`; the node that runs the app runs the renderer (Electron runs as Node for it). */
export async function renderComposition(dir: string, output: string, options: RenderOptions = {}): Promise<void> {
  const bin = binOf('hyperframes', 'hyperframes')
  // The renderer's large temp files go beside the composition, on the project's disk: a WebBox's /tmp is a small memory disk it refuses to render into.
  const temp = `${dir}.tmp`
  mkdirSync(temp, { recursive: true })
  const args = [bin, 'render', dir, '-o', output, '--quality', options.quality ?? 'standard', ...(options.format ? ['--format', options.format] : []), '--workers', 'auto']
  try {
    await run(process.execPath, args, {
      ...(options.signal ? { signal: options.signal } : {}),
      env: { ...process.env, TMPDIR: temp, ELECTRON_RUN_AS_NODE: '1', DO_NOT_TRACK: '1', HYPERFRAMES_NO_UPDATE_CHECK: '1', NO_COLOR: '1' },
      onLine: (line) => {
        const match = /(\d{1,3}(?:\.\d+)?)%/.exec(line)
        if (match && options.onProgress) options.onProgress(Math.min(1, Number(match[1]) / 100))
      },
    })
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

/** Removes a composition folder and, when it was the last one, the `render/` folder that held it. */
export function dropComposition(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
  const parent = dirname(dir)
  try { if (readdirSync(parent).length === 0) rmSync(parent, { recursive: true, force: true }) } catch { /* already gone */ }
}

/** Escapes text for HTML. */
export const html = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
