import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import {
  addDays,
  type CalendarEvent,
  cleanDue,
  cleanTags,
  dayOf,
  Hub,
  HubError,
  isOverdue,
  jsonFileStore,
  memoryStore,
  nextActions,
  overlappingPairs,
  overlapsWith,
  rangesOverlap,
  seed,
  weekDays,
  weekStart,
} from '../plugins/productivity-hub/index.ts'
import { NOW, projectRoot } from './support.ts'

const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

async function openHub(now = NOW) {
  let ids = 0
  let clock = now
  const store = memoryStore()
  const hub = await Hub.open({ store, clock: () => clock, newId: (kind) => `${kind}-${++ids}` })
  return { hub, store, tick: (date: Date) => (clock = date) }
}

const event = (id: string, start: string, end: string): CalendarEvent => ({ id, title: id, startAt: start, endAt: end, calendarId: 'meeting' })

describe('days and weeks', () => {
  test('a week runs Monday to Sunday around any of its days', () => {
    assert.equal(weekStart('2026-11-05'), '2026-11-02')
    assert.equal(weekStart('2026-11-08'), '2026-11-02')
    assert.equal(weekStart('2026-11-02'), '2026-11-02')
    assert.deepEqual(weekDays('2026-11-05'), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
    assert.equal(addDays('2026-10-31', 1), '2026-11-01')
    assert.equal(dayOf(new Date(2026, 10, 5, 23, 59)), '2026-11-05')
  })
})

describe('overlaps', () => {
  test('two events overlap when they share a minute; touching ends do not', () => {
    assert.equal(rangesOverlap(event('a', '2026-11-05T09:00', '2026-11-05T10:00'), event('b', '2026-11-05T09:30', '2026-11-05T11:00')), true)
    assert.equal(rangesOverlap(event('a', '2026-11-05T09:00', '2026-11-05T10:00'), event('b', '2026-11-05T10:00', '2026-11-05T11:00')), false)
    assert.equal(rangesOverlap(event('a', '2026-11-05T09:00', '2026-11-05T12:00'), event('b', '2026-11-05T10:00', '2026-11-05T11:00')), true)
  })

  test('names the events a candidate overlaps, earliest first, never itself', () => {
    const events = [event('late', '2026-11-05T11:00', '2026-11-05T12:00'), event('early', '2026-11-05T09:00', '2026-11-05T10:30'), event('free', '2026-11-05T13:00', '2026-11-05T14:00')]
    assert.deepEqual(overlapsWith(events, { startAt: '2026-11-05T10:00', endAt: '2026-11-05T11:30' }).map((e) => e.id), ['early', 'late'])
    assert.deepEqual(overlapsWith(events, { id: 'late', startAt: '2026-11-05T11:00', endAt: '2026-11-05T12:00' }), [])
  })

  test('lists every overlapping pair once', () => {
    const events = [event('a', '2026-11-05T09:00', '2026-11-05T11:00'), event('b', '2026-11-05T10:00', '2026-11-05T10:30'), event('c', '2026-11-05T10:15', '2026-11-05T12:00'), event('d', '2026-11-05T12:00', '2026-11-05T13:00')]
    assert.deepEqual(overlappingPairs(events), [['a', 'b'], ['a', 'c'], ['b', 'c']])
  })
})

describe('the seed', () => {
  test('three spaces, six tasks, four notes, three captures and a working week around the first launch', () => {
    const state = seed(NOW)
    assert.equal(state.projects.length, 3)
    assert.equal(state.tasks.length, 6)
    assert.equal(state.notes.length, 4)
    assert.equal(state.inbox.length, 3)
    const days = new Set(state.events.map((e) => dayOf(e.startAt)))
    for (const day of weekDays('2026-11-05').slice(0, 5)) assert.ok(days.has(day), `events on ${day}`)
    assert.ok(state.events.some((e) => e.calendarId === 'focus'), 'a focus block')
    // Every reference points at something that exists.
    const ids = new Set(state.projects.map((p) => p.id))
    for (const item of [...state.tasks, ...state.notes]) assert.ok(item.projectId === undefined || ids.has(item.projectId))
    assert.equal(state.focus?.date, '2026-11-05')
  })

  test('shows the states the spec asks for: an overdue task, done today, an overlap this week', () => {
    const state = seed(NOW)
    assert.equal(state.tasks.filter((t) => isOverdue(t, NOW)).length, 1)
    assert.equal(state.tasks.filter((t) => t.status === 'done').length, 1)
    assert.ok(overlappingPairs(state.events).length >= 1)
  })

  test('falls on the day it is made, whatever the day', () => {
    const sunday = new Date(2027, 1, 14, 12, 0)
    const state = seed(sunday)
    assert.ok(state.events.some((e) => dayOf(e.startAt) === '2027-02-14'))
    assert.ok(nextActions(state, sunday).length > 0)
  })
})

describe('the hub', () => {
  test('My Day: the focus, the next actions (overdue first), what was done, two recent notes and the day’s events', async () => {
    const { hub } = await openHub()
    const day = hub.day()
    assert.equal(day.focus?.id, 'task-onboarding')
    assert.deepEqual(day.next.map((t) => t.id), ['task-library', 'task-estimate', 'task-review', 'task-copy'])
    assert.deepEqual(day.done.map((t) => t.id), ['task-dentist'])
    assert.deepEqual(day.notes.map((n) => n.id), ['note-onboarding', 'note-ideas'])
    assert.deepEqual(day.events.map((e) => e.title), ['Product stand-up', 'Estimate review', 'Weekly planning'])
    assert.equal(day.inboxCount, 3)
  })

  test('an empty day has no focus and no next actions', async () => {
    const { hub, tick } = await openHub()
    tick(new Date(2026, 11, 24, 9, 0))
    for (const task of hub.tasks()) await hub.completeTask(task.id)
    const day = hub.day()
    assert.equal(day.focus, undefined)
    assert.deepEqual(day.next, [])
  })

  test('capture, then triage into a task with a date and a space, then complete it from My Day', async () => {
    const { hub, store } = await openHub()
    const item = await hub.capture('  Call the printer about the flyers  ')
    assert.equal(item.text, 'Call the printer about the flyers')
    assert.equal(hub.inbox()[0]?.id, item.id)
    const task = await hub.triage(item.id, { kind: 'task', dueAt: '2026-11-05', projectId: 'space-launch', estimateMinutes: '10' })
    assert.equal(hub.inbox().some((i) => i.id === item.id), false)
    assert.ok('status' in task)
    assert.equal(task.title, 'Call the printer about the flyers')
    assert.equal(task.dueAt, '2026-11-05T17:00')
    assert.equal(task.estimateMinutes, 10)
    assert.ok(hub.day().next.some((t) => t.id === task.id))
    await hub.completeTask(task.id)
    assert.ok(hub.day().done.some((t) => t.id === task.id))
    assert.equal(hub.task(task.id).completedAt, '2026-11-05T08:40')
    await hub.reopenTask(task.id)
    assert.equal(hub.task(task.id).completedAt, undefined)
    assert.equal(store.state?.tasks.find((t) => t.id === task.id)?.status, 'open', 'every change is saved')
  })

  test('triage into a note keeps the capture as its body', async () => {
    const { hub } = await openHub()
    const note = await hub.triage('inbox-gift', { kind: 'note', title: 'Gift ideas', projectId: 'space-personal' })
    assert.ok('body' in note)
    assert.equal(note.title, 'Gift ideas')
    assert.match(note.body, /notebook/)
    assert.equal(hub.notes()[0]?.id, note.id)
  })

  test('refuses what breaks a rule, with a sentence the page can show, and changes nothing', async () => {
    const { hub, store } = await openHub()
    const saves = store.saved
    await assert.rejects(hub.capture('   '), (e: unknown) => e instanceof HubError && e.code === 'invalid' && /Write something/.test(e.message))
    await assert.rejects(hub.addTask({ title: '' }), /A task title is needed/)
    await assert.rejects(hub.addTask({ title: 'x', estimateMinutes: '-5' }), /whole number of minutes/)
    await assert.rejects(hub.addTask({ title: 'x', projectId: 'space-nope' }), (e: unknown) => e instanceof HubError && e.code === 'not-found')
    await assert.rejects(hub.addTask({ title: 'x', dueAt: 'tomorrowish' }), /not a date/)
    await assert.rejects(hub.completeTask('task-nope'), (e: unknown) => e instanceof HubError && e.code === 'not-found')
    await assert.rejects(hub.addEvent({ title: 'Backwards', startAt: '2026-11-05T10:00', endAt: '2026-11-05T09:00' }), /ends after it starts/)
    await assert.rejects(hub.setFocus('task-dentist'), /completed task cannot be the focus/)
    assert.equal(store.saved, saves)
  })

  test('an event that overlaps is held until the person confirms it', async () => {
    const { hub } = await openHub()
    const input = { title: 'Dentist', startAt: '2026-11-05T11:45', endAt: '2026-11-05T12:30', calendarId: 'personal' }
    const held = await hub.addEvent(input)
    assert.equal(held.kind, 'overlap')
    assert.deepEqual(held.overlaps.map((e) => e.id), ['event-estimate'])
    assert.equal(hub.day().events.length, 3, 'nothing saved yet')
    const saved = await hub.addEvent(input, { confirm: true })
    assert.equal(saved.kind, 'saved')
    assert.equal(hub.day().events.length, 4)
    assert.ok(hub.week().overlapping.has('event-estimate'))
    const free = await hub.addEvent({ title: 'Lunch', startAt: '2026-11-05T12:30', endAt: '2026-11-05T13:15' })
    assert.equal(free.kind, 'saved', 'touching the end is not an overlap')
  })

  test('the week view lists seven days and marks the seeded overlap', async () => {
    const { hub } = await openHub()
    const week = hub.week()
    assert.equal(week.start, '2026-11-02')
    assert.equal(week.days.length, 7)
    assert.ok(week.overlapping.has('event-retro') && week.overlapping.has('event-gym'))
    assert.equal(hub.week('2026-11-12').start, '2026-11-09')
  })

  test('saving a note moves it to the top and keeps its linked tasks', async () => {
    const { hub } = await openHub()
    const note = await hub.saveNote('note-ideas', { body: 'Local-first capture.', tags: '#ideas, Capture' })
    assert.equal(note.updatedAt, '2026-11-05T08:40')
    assert.deepEqual(note.tags, ['ideas', 'capture'])
    assert.equal(note.title, 'Ideas worth exploring')
    assert.equal(hub.notes()[0]?.id, 'note-ideas')
    assert.deepEqual(hub.linkedTasks('note-onboarding').map((t) => t.id), ['task-onboarding', 'task-copy'], 'same due time: the high priority first')
    assert.deepEqual(hub.notes('bouldering'), [])
    assert.deepEqual(hub.notes('deep').map((n) => n.id), ['note-deep-work'])
  })

  test('the focus counts its steps, and steps toggle', async () => {
    const { hub } = await openHub()
    const before = hub.task('task-onboarding').steps.filter((s) => s.done).length
    await hub.toggleStep('task-onboarding', 2)
    assert.equal(hub.task('task-onboarding').steps.filter((s) => s.done).length, before + 1)
    await hub.setFocus('task-copy')
    assert.equal(hub.day().focus?.id, 'task-copy')
  })

  test('filters tasks by status, space and text', async () => {
    const { hub } = await openHub()
    assert.equal(hub.tasks().length, 5)
    assert.equal(hub.tasks({ status: 'done' }).length, 1)
    assert.equal(hub.tasks({ status: 'all' }).length, 6)
    assert.deepEqual(hub.tasks({ projectId: 'space-reading' }).map((t) => t.id), ['task-library'])
    assert.deepEqual(hub.tasks({ q: 'MARTA' }).map((t) => t.id), ['task-estimate'])
  })
})

describe('cleaning input', () => {
  test('a due day means the end of that working day; tags are lowercased and unique', () => {
    assert.equal(cleanDue('2026-11-06'), '2026-11-06T17:00')
    assert.equal(cleanDue(''), undefined)
    assert.deepEqual(cleanTags(['A', '#a', ' b ']), ['a', 'b'])
  })
})

describe('the JSON file store', () => {
  test('saves and loads the state, and starts empty when there is no file', async () => {
    const dir = await mkdtemp(join(scratch, 'store-'))
    try {
      const store = jsonFileStore(join(dir, 'nested', 'hub.json'))
      assert.equal(await store.load(), undefined)
      const state = seed(NOW)
      await store.save(state)
      assert.deepEqual(await store.load(), state)
      assert.match(await readFile(join(dir, 'nested', 'hub.json'), 'utf8'), /"version": 1/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('refuses a file that is not the hub’s state instead of replacing it with the seed', async () => {
    const dir = await mkdtemp(join(scratch, 'store-'))
    try {
      await writeFile(join(dir, 'broken.json'), '{nope')
      await assert.rejects(jsonFileStore(join(dir, 'broken.json')).load(), /not valid JSON/)
      await writeFile(join(dir, 'other.json'), '{"version":2}')
      await assert.rejects(jsonFileStore(join(dir, 'other.json')).load(), /not a Productivity Hub state of version 1/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('a hub over the file store keeps its changes across a restart', async () => {
    const dir = await mkdtemp(join(scratch, 'store-'))
    try {
      const open = () => Hub.open({ store: jsonFileStore(join(dir, 'hub.json')), clock: () => NOW, newId: (k) => `${k}-x` })
      const first = await open()
      await first.completeTask('task-copy')
      const second = await open()
      assert.equal(second.task('task-copy').status, 'done')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
