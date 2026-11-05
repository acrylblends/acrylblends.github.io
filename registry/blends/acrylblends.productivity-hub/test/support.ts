/**
 * What every route test shares: the app booted in process (no port) over a throwaway home, with the hub's outside effects faked (a memory store, a
 * fixed clock, counted ids), so a test sees the seed exactly as a person sees it on Thursday 5 November 2026 at 08:40.
 */
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '../plugins/instance/index.ts'
import { type HubState, memoryStore } from '../plugins/productivity-hub/index.ts'
import { type App, type AppOptions, createApp } from '../src/app.ts'

/** Throwaway homes live inside the project (`.acrylblends/` is ignored by git): a sandboxed agent may not write to the system temp folder. */
const scratch = join(fileURLToPath(new URL('..', import.meta.url)), '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

export const projectRoot = fileURLToPath(new URL('..', import.meta.url))

/** The tests' "now": Thursday 5 November 2026, 08:40 local time. */
export const NOW = new Date(2026, 10, 5, 8, 40)

export interface TestApp extends App {
  /** The hub's store: `store.state` is what was saved, `store.saved` how many saves. */
  readonly store: ReturnType<typeof memoryStore>
  /** Move the clock. */
  setNow(date: Date): void
  /** GET a page as a browser does; returns the status and the HTML. */
  page(path: string): Promise<{ status: number; html: string }>
  /** POST a form (urlencoded) as a browser does, without following the redirect. */
  post(path: string, fields: Record<string, string>): Promise<Response>
}

export interface TestOptions extends AppOptions {
  readonly now?: Date
  /** Start from this state instead of the seed. */
  readonly state?: HubState
}

/** Boot the app in a throwaway home, run the test, always stop it and remove the home. */
export async function withApp(run: (app: TestApp) => Promise<void>, options: TestOptions = {}): Promise<void> {
  const home = await mkdtemp(join(scratch, 'app-test-'))
  let now = options.now ?? NOW
  let ids = 0
  const store = memoryStore(options.state)
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), {
    ...options,
    listen: false,
    overrides: {
      ...options.overrides,
      'productivity-hub': { store, clock: () => now, newId: (kind: string) => `${kind}-${++ids}` },
    },
  })
  const prefix = options.prefix ?? ''
  const test: TestApp = {
    ...app,
    store,
    setNow(date) {
      now = date
    },
    async page(path) {
      const response = await app.root.router.request(`${prefix}${path}`, { headers: { accept: 'text/html' } })
      return { status: response.status, html: await response.text() }
    },
    post(path, fields) {
      return Promise.resolve(
        app.root.router.request(`${prefix}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' },
          body: new URLSearchParams(fields).toString(),
        }),
      )
    },
  }
  try {
    await run(test)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
}
