import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { duration, weekLabel } from '../plugins/calendar/index.ts'
import { hourRange, placeDay } from '../plugins/calendar/layout.ts'
import type { CalendarEvent } from '../plugins/productivity-hub/index.ts'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { withApp } from './support.ts'

const event = (id: string, start: string, end: string): CalendarEvent => ({ id, title: id, startAt: `2026-11-05T${start}`, endAt: `2026-11-05T${end}`, calendarId: 'meeting' })

describe('the week grid layout', () => {
  test('overlapping events share lanes; the next free one goes back to the first lane', () => {
    const placed = placeDay([event('a', '09:00', '10:00'), event('b', '09:30', '10:30'), event('c', '10:00', '11:00'), event('d', '12:00', '13:00')], 8)
    const by = Object.fromEntries(placed.map((p) => [p.event.id, p]))
    assert.deepEqual([by.a?.lane, by.b?.lane, by.c?.lane], [0, 1, 0])
    assert.deepEqual([by.a?.lanes, by.b?.lanes, by.c?.lanes, by.d?.lanes], [2, 2, 2, 1])
    assert.equal(by.a?.top, 60)
    assert.equal(by.a?.height, 60)
  })

  test('the grid shows 08-19 and widens for an early or late event', () => {
    assert.deepEqual(hourRange([]), { from: 8, to: 19 })
    assert.deepEqual(hourRange([event('early', '06:30', '07:00'), event('late', '20:00', '21:15')]), { from: 6, to: 22 })
  })

  test('labels: durations and week ranges', () => {
    assert.equal(duration(30), '30 min')
    assert.equal(duration(120), '2 hours')
    assert.equal(duration(90), '1 h 30 min')
    assert.equal(weekLabel('2026-11-02'), 'Nov 2 – 8')
    assert.equal(weekLabel('2026-10-26'), 'Oct 26 – Nov 1')
  })
})

describe('/calendar', () => {
  test('shows this week with every seeded event, today marked and the overlap outlined', () =>
    withApp(async (app) => {
      const { status, html } = await app.page('/calendar')
      assert.equal(status, 200)
      assert.match(html, /<h1>Nov 2 – 8<span>\.<\/span><\/h1>/)
      assert.match(html, /<div class="c-dayhead today" id="day-2026-11-05">Thu<b>5<\/b>/)
      for (const title of ['Product stand-up', 'Estimate review', 'Design critique', 'Deep work', 'Launch retro', 'Climbing']) assert.ok(html.includes(`<b>${title}</b>`), title)
      assert.match(html, /class="c-ev meeting clash" data-event="event-retro"/)
      assert.match(html, /class="c-ev personal clash" data-event="event-gym"/)
      assert.match(html, /2 of them overlapping/)
      assert.match(html, /<a href="\/calendar" class="on" aria-current="page">/)
    }))

  test('moves by week, and an unreadable week falls back to this one', () =>
    withApp(async (app) => {
      const next = await app.page('/calendar?week=2026-11-12')
      assert.match(next.html, /<h1>Nov 9 – 15<span>\.<\/span><\/h1>/)
      assert.match(next.html, /A clear week/)
      assert.match((await app.page('/calendar?week=nonsense')).html, /<h1>Nov 2 – 8/)
    }))

  test('saves an event that overlaps nothing and says so', () =>
    withApp(async (app) => {
      const response = await app.post('/calendar/events', { title: 'Lunch with Sam', day: '2026-11-06', start: '12:30', end: '13:30', calendarId: 'personal', detail: 'Sam', projectId: '' })
      assert.equal(response.status, 303)
      const location = response.headers.get('location') ?? ''
      assert.match(location, /^\/calendar\?ok=Saved%20Lunch%20with%20Sam\.&week=2026-11-02$/)
      assert.ok(app.store.state?.events.some((e) => e.title === 'Lunch with Sam' && e.startAt === '2026-11-06T12:30'))
      assert.match((await app.page(location)).html, /<p class="p-alert ok" role="status">Saved Lunch with Sam\.<\/p>/)
    }))

  test('asks before saving an event that overlaps, and saves it only on Save anyway', () =>
    withApp(async (app) => {
      const fields = { title: 'Dentist', day: '2026-11-05', start: '11:45', end: '12:30', calendarId: 'personal', detail: '', projectId: '' }
      const asked = await app.post('/calendar/events', fields)
      assert.equal(asked.status, 409)
      const html = await asked.text()
      assert.match(html, /role="alertdialog"/)
      assert.match(html, /Dentist \(11:45-12:30\) overlaps an event:<\/b><ul><li><b>Estimate review<\/b>, Thursday 11:30-12:00<\/li>/)
      assert.match(html, /<input type="hidden" name="confirm" value="1"><button class="p-btn">Save anyway<\/button>/)
      assert.equal(app.store.state?.events.some((e) => e.title === 'Dentist'), false, 'nothing saved before the yes')
      const saved = await app.post('/calendar/events', { ...fields, confirm: '1' })
      assert.equal(saved.status, 303)
      assert.match(saved.headers.get('location') ?? '', /overlapping%20as%20you%20confirmed/)
      assert.ok(app.store.state?.events.some((e) => e.title === 'Dentist'))
    }))

  test('refuses an event without a title or with its end before its start, keeping what was typed', () =>
    withApp(async (app) => {
      const empty = await app.post('/calendar/events', { title: '', day: '2026-11-05', start: '10:00', end: '10:30' })
      assert.equal(empty.status, 400)
      assert.match(await empty.text(), /An event title is needed\./)
      const noDay = await app.post('/calendar/events', { title: 'Call', day: '', start: '10:00', end: '10:30' })
      assert.equal(noDay.status, 400)
      assert.match(await noDay.text(), /An event needs a start\.[\s\S]*value="Call"/)
    }))

  test('an end before the start runs past midnight', () =>
    withApp(async (app) => {
      const response = await app.post('/calendar/events', { title: 'Night shift notes', day: '2026-11-03', start: '23:00', end: '00:30' })
      assert.equal(response.status, 303)
      assert.ok(app.store.state?.events.some((e) => e.title === 'Night shift notes' && e.endAt === '2026-11-04T00:30'))
    }))

  test('deletes an event, and a missing one is a notice, not an error page', () =>
    withApp(async (app) => {
      const response = await app.post('/calendar/events/event-gym/delete', { week: '2026-11-02' })
      assert.equal(response.status, 303)
      assert.match(response.headers.get('location') ?? '', /Deleted%20Climbing/)
      assert.equal(app.store.state?.events.some((e) => e.id === 'event-gym'), false)
      assert.equal(app.root.hub.week().overlapping.size, 0)
      const missing = await app.post('/calendar/events/event-nope/delete', {})
      assert.match(missing.headers.get('location') ?? '', /\?error=There%20is%20no%20event/)
    }))

  test('the week as JSON for a script or an agent', () =>
    withApp(async (app) => {
      const response = await app.root.router.request('/calendar/week?week=2026-11-05')
      const week = (await response.json()) as { start: string; days: { day: string; events: unknown[] }[]; overlapping: string[] }
      assert.equal(week.start, '2026-11-02')
      assert.equal(week.days.length, 7)
      assert.deepEqual(week.overlapping.sort(), ['event-gym', 'event-retro'])
    }))

  test('under the frame prefix every link and form stays inside the prefix', () =>
    withApp(
      async (app) => {
        const { status, html } = await app.page('/calendar')
        assert.equal(status, 200)
        assert.match(html, /action="\/app\/calendar\/events"/)
        assert.doesNotMatch(html, /(?:href|action)="\/(?!app(?:\/|"))/)
      },
      { prefix: FRAME_MOUNT_PREFIX },
    ))
})

describe('This week on My Day', () => {
  test('the calendar widget is the week strip, today’s three events and the next day', () =>
    withApp(async (app) => {
      const widget = app.root.home.widgets().find((w) => w.id === 'calendar')
      assert.ok(widget)
      const html = await widget.render()
      assert.match(html, /<h2>This week<\/h2><small>Nov 2 – 8<\/small>/)
      assert.match(html, /class="today" aria-current="date">Thu<b>5<\/b>/)
      assert.match(html, /Thursday <small>3 events<\/small>/)
      assert.match(html, /Up next <small>Friday<\/small>[\s\S]*Design critique[\s\S]*Deep work/)
      assert.match(html, /<time>11:30<\/time><i class="meeting"><\/i><span><b>Estimate review<\/b><small>Marta · 30 min<\/small>/)
    }))

  test('switched off, the calendar leaves the sidebar, My Day and its routes', () =>
    withApp(
      async (app) => {
        assert.equal(app.root.home.widgets().some((w) => w.id === 'calendar'), false)
        assert.equal(app.root.hubShell.has('calendar'), false)
        assert.equal((await app.page('/calendar')).status, 404)
      },
      { off: ['calendar'] },
    ))
})
