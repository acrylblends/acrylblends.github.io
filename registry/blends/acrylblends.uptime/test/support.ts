/**
 * What every route test shares: the app booted in process (no port) over a throwaway home, with the monitors' outside effects faked (a memory store, a
 * fixed clock, counted ids, a fake checker), so a test needs no network and sees the seed as a person does on Friday 6 November 2026 at 09:41 UTC.
 */
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fakeChecker, type Checker } from '../plugins/uptime/checker.ts'
import type { UptimeState } from '../plugins/uptime/domain.ts'
import { memoryStore } from '../plugins/uptime/store.ts'
import { pinnedInstance, withPort } from '../plugins/instance/index.ts'
import { type App, type AppOptions, createApp } from '../src/app.ts'

export const projectRoot = fileURLToPath(new URL('..', import.meta.url))

const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

// The app stores wall-clock stamps; pin the zone so a fixture means the same time on every machine.
process.env.TZ = 'UTC'

/** The tests' "now": Friday 6 November 2026, 09:41 UTC. */
export const NOW = new Date(2026, 10, 6, 9, 41)

export interface TestApp extends App {
  readonly store: ReturnType<typeof memoryStore<UptimeState>>
  page(path: string): Promise<{ status: number; html: string; response: Response }>
  post(path: string, fields: Record<string, string>): Promise<Response>
}

export interface TestOptions extends AppOptions {
  readonly state?: UptimeState
}

export async function withApp(run: (app: TestApp) => Promise<void>, options: TestOptions = {}): Promise<void> {
  const home = await mkdtemp(join(scratch, 'app-test-'))
  let ids = 0
  const store = memoryStore<UptimeState>(options.state)
  const defaultChecker: Checker = fakeChecker({ ok: true, statusCode: 200, latencyMs: 120 })
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), {
    ...options,
    listen: false,
    overrides: {
      ...options.overrides,
      uptime: {
        store,
        clock: () => NOW,
        newId: (kind: string) => `${kind}-${++ids}`,
        checker: defaultChecker,
        ...options.overrides?.uptime,
      },
    },
  })
  const prefix = options.prefix ?? ''
  const test: TestApp = {
    ...app,
    store,
    async page(path) {
      const response = await app.root.router.request(`${prefix}${path}`, { headers: { accept: 'text/html' } })
      return { status: response.status, html: await response.text(), response }
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

export function noticeOf(response: Response): { kind: string; text: string; path: string } {
  const location = response.headers.get('location') ?? ''
  const url = new URL(location, 'http://local')
  for (const kind of ['ok', 'error', 'warn']) {
    const text = url.searchParams.get(kind)
    if (text !== null) return { kind, text, path: url.pathname }
  }
  return { kind: '', text: '', path: url.pathname }
}
