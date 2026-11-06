/**
 * What every route test shares: the app booted in process (no port) over a throwaway home, with the bus's outside effects faked (a memory store,
 * a fixed clock, counted ids), so a test sees the seed exactly as a person sees it on Thursday 5 November 2026 at 11:00.
 */
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '../plugins/instance/index.ts'
import { type BusState, memoryStore } from '../plugins/pulsebus/index.ts'
import { type App, type AppOptions, createApp } from '../src/app.ts'

export const projectRoot = fileURLToPath(new URL('..', import.meta.url))

/** Throwaway homes live inside the project (`.acrylblends/` is ignored by git): a sandboxed agent may not write to the system temp folder. */
const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

/** The tests' "now": Thursday 5 November 2026, 10:42:30 local time. */
// The seed and the clock are the person's local time while the assertions write UTC literals: pin the zone so the suite passes on any machine.
process.env.TZ = 'UTC'
export const NOW = new Date(2026, 10, 5, 10, 42, 30)

export interface TestApp extends App {
  readonly store: ReturnType<typeof memoryStore>
  page(path: string): Promise<{ status: number; html: string }>
  post(path: string, fields: Record<string, string>): Promise<Response>
}

export interface TestOptions extends AppOptions {
  readonly state?: BusState
}

export async function withApp(run: (app: TestApp) => Promise<void>, options: TestOptions = {}): Promise<void> {
  const home = await mkdtemp(join(scratch, 'app-test-'))
  const store = memoryStore(options.state)
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), {
    ...options,
    listen: false,
    overrides: {
      ...options.overrides,
      'pulsebus': { store, clock: () => NOW },
    },
  })
  const prefix = options.prefix ?? ''
  const test: TestApp = {
    ...app,
    store,
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

/** The redirect's target and its notice text. */
export function redirectOf(response: Response): { path: string; ok?: string; error?: string } {
  const location = response.headers.get('location') ?? ''
  const url = new URL(location, 'http://local')
  return {
    path: url.pathname,
    ...(url.searchParams.get('ok') === null ? {} : { ok: url.searchParams.get('ok') ?? '' }),
    ...(url.searchParams.get('error') === null ? {} : { error: url.searchParams.get('error') ?? '' }),
  }
}
