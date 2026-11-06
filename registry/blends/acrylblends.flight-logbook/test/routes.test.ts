import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { createApp, readManifest } from '../src/app.ts'
import type { LogbookState } from '../plugins/logbook/domain.ts'
import { pinnedInstance } from '../plugins/instance/index.ts'
import { noticeOf, NOW, projectRoot, withApp } from './support.ts'

const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

test('the first page is the mockup logbook: pilot, totals, table, filters and route detail', () =>
  withApp(async (app) => {
    const page = await app.page('/')
    assert.equal(page.status, 200)
    assert.match(page.html, /SKY<span>LOG<\/span>/)
    assert.match(page.html, /PILOT RECORDS \/ PERSONAL LOGBOOK/)
    assert.match(page.html, /EASA FORMAT · DEMO DATA/)
    for (const label of ['TOTAL FLIGHT TIME', 'THIS YEAR', 'PIC HOURS', 'LAST 90 DAYS', 'NEXT CHECK', 'Recent flights', 'Flight detail']) {
      assert.match(page.html, new RegExp(label))
    }
    assert.match(page.html, /486:35/)
    assert.match(page.html, /72:20/)
    assert.match(page.html, /43 flights/)
    assert.match(page.html, /318:10/)
    assert.match(page.html, /12:45/)
    assert.match(page.html, /21 Nov/)
    assert.match(page.html, /LOWW → LOWL/)
    assert.match(page.html, /DA40/)
    assert.match(page.html, /OE-KMC/)
    assert.match(page.html, /All aircraft/)
    assert.match(page.html, /All roles/)
    assert.doesNotMatch(page.html, /https?:\/\//)
  }))

test('the aircraft and role filters narrow the table', () =>
  withApp(async (app) => {
    const aircraft = app.root.logbook.aircraft().find((item) => item.type === 'C172')
    assert.ok(aircraft !== undefined)
    const filtered = await app.page(`/?aircraft=${aircraft.id}`)
    assert.match(filtered.html, /C172/)
    assert.match(filtered.html, /selected>[^<]*C172/)
    const dual = await app.page('/?role=Dual')
    assert.match(dual.html, /Dual/)
  }))

test('a flight detail shows the route, aircraft, times, role, landings and remarks', () =>
  withApp(async (app) => {
    const flight = app.root.logbook.flights().find((item) => item.departure === 'LOWW' && item.arrival === 'LOWL' && item.status === 'logged')
    assert.ok(flight !== undefined)
    const page = await app.page(`/flights/${flight.id}`)
    assert.equal(page.status, 200)
    assert.match(page.html, /LOWW → LOWL/)
    assert.match(page.html, /Takeoff \/ Landing/)
    assert.match(page.html, /LANDINGS/)
    assert.match(page.html, /Currency status is informational/)
  }))

test('the new flight form validates and saves a record', () =>
  withApp(async (app) => {
    const before = app.root.logbook.flights().length
    const form = await app.page('/flights/new')
    assert.match(form.html, /Log flight/)
    const invalid = await app.post('/flights', { date: '2026-11-06', departure: 'L', arrival: 'LOWL', aircraftId: app.root.logbook.aircraft()[0]?.id ?? '', role: 'PIC', takeoffTime: '09:00', landingTime: '10:00', duration: '1:00', dayNight: 'Day', landings: '1', remarks: '' })
    assert.equal(invalid.status, 200)
    assert.match(await invalid.text(), /aerodrome/)
    const saved = await app.post('/flights', { date: '2026-11-06', departure: 'LOWW', arrival: 'LOWL', aircraftId: app.root.logbook.aircraft()[0]?.id ?? '', role: 'PIC', takeoffTime: '09:00', landingTime: '10:10', duration: '1:10', dayNight: 'Day', landings: '1', remarks: 'Check flight' })
    assert.equal(saved.status, 303)
    assert.equal(noticeOf(saved).kind, 'ok')
    assert.equal(app.root.logbook.flights().length, before + 1)
  }))

test('a draft can be edited and logged, and a logged flight cannot', () =>
  withApp(async (app) => {
    const draft = app.root.logbook.flights().find((flight) => flight.status === 'draft')
    assert.ok(draft !== undefined)
    const page = await app.page(`/flights/${draft.id}/edit`)
    assert.match(page.html, /Edit draft flight/)
    const aircraft = app.root.logbook.aircraft()[0]
    assert.ok(aircraft !== undefined)
    const saved = await app.post(`/flights/${draft.id}`, { date: '2026-11-05', departure: 'LOWW', arrival: 'LOWL', aircraftId: aircraft.id, role: 'PIC', takeoffTime: '09:00', landingTime: '10:00', duration: '1:00', dayNight: 'Day', landings: '1', remarks: 'Completed' })
    assert.equal(noticeOf(saved).kind, 'ok')
    assert.equal(app.root.logbook.flight(draft.id)?.status, 'logged')
    const refused = await app.page(`/flights/${draft.id}/edit`)
    assert.equal(refused.status, 303)
  }))

test('the experience page and the CSV export cover the logbook', () =>
  withApp(async (app) => {
    const page = await app.page('/experience')
    assert.equal(page.status, 200)
    assert.match(page.html, /Experience summary/)
    assert.match(page.html, /By aircraft class/)
    assert.match(page.html, /By role/)
    assert.match(page.html, /Day and night/)
    const csv = await app.root.router.request('/export.csv')
    assert.equal(csv.status, 200)
    assert.match(csv.headers.get('content-type') ?? '', /text\/csv/)
    const lines = (await csv.text()).trim().split('\n')
    assert.equal(lines[0], 'date,departure,arrival,aircraft,registration,role,takeoff,landing,duration,day_night,landings,remarks')
    assert.equal(lines.length, 85)
  }))

test('health, 404, prefix and the manifest work', async () => {
  await withApp(async (app) => {
    assert.equal((await app.page('/health')).status, 200)
    assert.equal((await app.page('/nope')).status, 404)
    assert.deepEqual(readManifest().plugins.map((row) => row.id), ['router', 'home', 'logbook', 'logbook-shell', 'overview', 'flights', 'experience', 'extensions', 'server', 'acryl-door'])
  })
  await withApp(
    async (app) => {
      const response = await app.root.router.request('/app', { headers: { accept: 'text/html' } })
      assert.equal(response.status, 200)
      assert.match(await response.text(), /href="\/app\/flights\/new"/)
    },
    { prefix: '/app' },
  )
})

test('switching the experience plugin off removes only that page', async () => {
  const manifest = readManifest()
  const without = { ...manifest, plugins: manifest.plugins.map((row) => (row.id === 'experience' ? { ...row, disabled: true } : row)) }
  const home = await mkdtemp(join(scratch, 'app-test-off-experience-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), { listen: false, manifest: without, overrides: { logbook: { clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}` } } })
  try {
    assert.equal((await app.root.router.request('/experience')).status, 404)
    assert.equal((await app.root.router.request('/', { headers: { accept: 'text/html' } })).status, 200)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test('a failed save reports the error instead of success', async () => {
  const broken = { load: async (): Promise<LogbookState | undefined> => undefined, save: async (): Promise<void> => { throw new Error('disk full') } }
  await withApp(
    async (app) => {
      const aircraft = app.root.logbook.aircraft()[0]
      assert.ok(aircraft !== undefined)
      const response = await app.post('/flights', { date: '2026-11-06', departure: 'LOWW', arrival: 'LOWL', aircraftId: aircraft.id, role: 'PIC', takeoffTime: '09:00', landingTime: '10:00', duration: '1:00', dayNight: 'Day', landings: '1', remarks: '' })
      assert.equal(response.status, 200)
      assert.match(await response.text(), /could not be saved/)
    },
    { overrides: { logbook: { store: broken } } },
  )
})
