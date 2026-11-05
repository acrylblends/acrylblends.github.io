/**
 * My Day (route /): the seed's day on the page, a task completed from its row, the empty and overdue states, the daily focus, the frame prefix, and the
 * composition seams (other plugins' navs and home widgets).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { seed } from '../plugins/productivity-hub/index.ts'
import { dueLabel, relativeDay } from '../plugins/my-day/format.ts'
import { NOW, withApp } from './support.ts'

const seedState = seed(NOW)

test('My Day shows the seed day: the focus with its steps, next actions, the overdue task, the done line, the notes and the counts', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/')
    assert.equal(status, 200)
    assert.match(html, /THURSDAY, NOVEMBER 5, 2026/)
    assert.match(html, /Make room for good work<span>\.<\/span>/)
    assert.match(html, /Six things on your plate\. Keep the day intentional\./)
    assert.match(html, /Ship the first version of the onboarding flow/)
    assert.match(html, /2 of 4 steps/)
    assert.match(html, /Next actions/)
    assert.match(html, /4 remaining/)
    for (const title of ['Review onboarding copy', 'Send revised estimate to Marta', 'Prepare notes for weekly review', 'Return &quot;Deep Work&quot; to the library'])
      assert.match(html, new RegExp(title))
    assert.match(html, /class="p-when overdue">OVERDUE</)
    assert.match(html, /One task completed today/)
    assert.match(html, /Onboarding: open questions/)
    assert.match(html, /<a class="p-note sky" href="\/notes\/note-ideas">/)
    // The rail: the calendar's widget (this week's days, today's events and what is next), then the page's quote.
    assert.match(html, /<aside class="p-rail" data-widget="calendar">[\s\S]*<blockquote class="p-quote">/)
    assert.equal(html.match(/class="p-quote"/g)?.length, 1)
    assert.match(html, /This week/)
    assert.match(html, /Product stand-up/)
    assert.match(html, /Estimate review/)
    assert.match(html, /Weekly planning/)
    assert.match(html, /Up next/)
    assert.match(html, /Design critique/)
    // The sidebar: My day is the page shown, and the Inbox carries its count.
    assert.match(html, /aria-current="page"[^>]*>.*My day/)
    assert.match(html, /<span>Inbox<\/span><em>3<\/em>/)
    assert.match(html, /action="\/inbox"/)
  }))

test('a task completed from My Day leaves the list, and the done line follows', () =>
  withApp(async (app) => {
    const response = await app.post('/day/tasks/task-copy/complete', {})
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/?ok=Task%20completed.')
    const copy = app.store.state?.tasks.find((task) => task.id === 'task-copy')
    assert.equal(copy?.status, 'done')
    assert.ok(copy?.completedAt !== undefined)
    const { html } = await app.page('/')
    assert.match(html, /3 remaining/)
    assert.match(html, /Two tasks completed today/)
    assert.doesNotMatch(html, /Review onboarding copy/)
  }))

test('the empty day says so, and offers the focus picker only when there is something to pick', () =>
  withApp(
    async (app) => {
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, /A clear plate\. Keep the day intentional\./)
      assert.match(html, /Nothing due today\./)
      assert.match(html, /Choose today's focus/)
      assert.match(html, /No open task to focus on yet\./)
      assert.match(html, /No notes yet\./)
      assert.doesNotMatch(html, /class="p-when overdue"/)
    },
    { state: { ...seedState, tasks: [], notes: [], focus: undefined } },
  ))

test('an overdue task keeps its warning, and a task due today shows its time', () =>
  withApp(
    async (app) => {
      const { html } = await app.page('/')
      assert.match(html, /Return &quot;Deep Work&quot; to the library/)
      assert.match(html, /class="p-when overdue">OVERDUE</)
      assert.match(html, /class="p-when">09:30</)
    },
    {
      state: {
        ...seedState,
        tasks: [
          { ...seedState.tasks[4]! },
          { id: 'task-morning', title: 'Call the venue', status: 'open', dueAt: '2026-11-05T09:30', priority: 'normal', steps: [] },
        ],
        focus: undefined,
      },
    },
  ))

test('the daily focus: picked from the page when none is set, then shown with its own task', () =>
  withApp(
    async (app) => {
      const before = await app.page('/')
      assert.match(before.html, /Choose today's focus/)
      const set = await app.post('/day/focus', { taskId: 'task-estimate' })
      assert.equal(set.status, 303)
      assert.equal(set.headers.get('location'), '/?ok=Focus%20set%20for%20today.')
      assert.deepEqual(app.store.state?.focus, { date: '2026-11-05', taskId: 'task-estimate' })
      const after = await app.page('/')
      assert.match(after.html, /Send revised estimate to Marta/)
      assert.match(after.html, /✦ Daily focus/)
      const missing = await app.post('/day/focus', { taskId: 'task-nope' })
      assert.equal(missing.status, 303)
      assert.match(missing.headers.get('location') ?? '', /^\/\?error=There%20is%20no%20task/)
      const empty = await app.post('/day/focus', {})
      assert.equal(empty.headers.get('location'), '/?error=Choose%20a%20task%20to%20focus%20on.')
    },
    { state: { ...seedState, focus: undefined } },
  ))

test('My Day links to the other pages only while they are mounted, and puts other widgets in its main column', async () => {
  await withApp(
    async (app) => {
      const { html } = await app.page('/')
      assert.doesNotMatch(html, /New task|Open task|View all/)
      assert.match(html, /<aside class="p-rail" data-widget="agenda">/)
      assert.match(html, /<article class="p-note amber">/)
      app.root.home.widget({ id: 'reading', title: 'Reading', render: () => '<p id="reading">two books</p>' })
      assert.match((await app.page('/')).html, /<section class="p-widget" data-widget="reading"><h2>Reading<\/h2><p id="reading">two books<\/p><\/section>/)
    },
    { off: ['tasks', 'notes', 'calendar'] },
  )
  await withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /<a class="p-btn" href="\/tasks\?new=1">\+ New task<\/a>/)
    assert.match(html, /href="\/tasks\?edit=task-onboarding">Open task ↗/)
    assert.match(html, /<a class="p-note amber" href="\/notes\/note-onboarding">/)
    assert.match(html, /href="\/notes">View all →/)
    for (const [label, order] of [['My day', 0], ['Inbox', 1], ['All tasks', 2], ['Notes', 3], ['Calendar', 4]] as const)
      assert.equal(app.root.hubShell.navItems()[order]?.label, label)
  })
})

test('the page mounts under the frame prefix, links under it, and its forms land there', () =>
  withApp(
    async (app) => {
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, /href="\/app\/inbox"/)
      assert.match(html, /action="\/app\/day\/tasks\/task-copy\/complete"/)
      const done = await app.post('/day/tasks/task-copy/complete', {})
      assert.equal(done.status, 303)
      assert.equal(done.headers.get('location'), '/app?ok=Task%20completed.')
      assert.equal((await app.root.router.request('/app', { headers: { accept: 'text/html' } })).status, 200)
    },
    { prefix: '/app' },
  ))

test('the day labels read the stored local times', () => {
  assert.deepEqual(dueLabel('2026-11-04T18:00', '2026-11-05'), { text: 'OVERDUE', overdue: true })
  assert.deepEqual(dueLabel('2026-11-05T17:00', '2026-11-05'), { text: 'TODAY', overdue: false })
  assert.deepEqual(dueLabel('2026-11-05T11:30', '2026-11-05'), { text: '11:30', overdue: false })
  assert.deepEqual(dueLabel('2026-11-06T10:00', '2026-11-05'), { text: 'NOV 6', overdue: false })
  assert.deepEqual(dueLabel(undefined, '2026-11-05'), { text: '', overdue: false })
  assert.equal(relativeDay('2026-11-05T08:00', '2026-11-05'), 'TODAY')
  assert.equal(relativeDay('2026-11-04T08:00', '2026-11-05'), 'YESTERDAY')
  assert.equal(relativeDay('2026-10-31T08:00', '2026-11-05'), 'OCT 31')
})
