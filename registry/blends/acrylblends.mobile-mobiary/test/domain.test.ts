import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Journal, JournalError, dateLabel, dayLabel, greeting, memoryStore, parseKind, parseTime, parseTitle, progressOf, seed, subtitleOf } from '../plugins/mobiary/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  let ids = 0
  const store = memoryStore()
  const journal = await Journal.open({ store, clock: () => NOW, newId: () => `entry-n${++ids}` })
  return { journal, store }
}

test('the greeting follows the hour and the date reads as the mockup does', () => {
  assert.equal(greeting(new Date(2026, 10, 5, 8)), 'Good morning')
  assert.equal(greeting(new Date(2026, 10, 5, 13)), 'Good afternoon')
  assert.equal(greeting(new Date(2026, 10, 5, 19)), 'Good evening')
  assert.equal(dateLabel(new Date(2026, 4, 12)), 'TUESDAY, 12 MAY')
})

test('days are Today, Yesterday, a weekday within the week, or a date', () => {
  const iso = (d: number) => new Date(2026, 10, 5 - d, 9, 0).toISOString()
  assert.deepEqual([0, 1, 4, 10].map((d) => dayLabel(iso(d), NOW)), ['Today', 'Yesterday', 'Sunday', 'Oct 26'])
  const e = seed(NOW).entries[0]!
  assert.equal(subtitleOf(e, NOW), 'Sunday · Voice memo')
})

test('progress counts the done goals; 3 of 5 is 60%', () => {
  assert.deepEqual(progressOf(seed(NOW).goals), { done: 3, total: 5, percent: 60 })
  assert.deepEqual(progressOf([]), { done: 0, total: 0, percent: 0 })
})

test('input is checked: titles, kinds and times', () => {
  assert.equal(parseTitle('  a   few  words '), 'a few words')
  assert.throws(() => parseTitle('   '), /Write a few words first/)
  assert.throws(() => parseTitle('x'.repeat(81)), /at most 80 characters/)
  assert.equal(parseKind('voice'), 'voice')
  assert.throws(() => parseKind('video'), /Pick note, voice or photo/)
  assert.equal(parseTime('22:00', 'From'), '22:00')
  for (const bad of ['24:00', '9:00', '', undefined]) assert.throws(() => parseTime(bad, 'From'), /From is a time like 22:00/)
})

test('capturing saves a moment at the top; refused input saves nothing; the journal is capped', async () => {
  const { journal, store } = await open()
  const entry = await journal.capture('note', ' Call the printer ')
  assert.deepEqual([entry.id, entry.title, entry.kind], ['entry-n1', 'Call the printer', 'note'])
  assert.equal(journal.entries()[0]?.id, 'entry-n1')
  assert.equal((await journal.capture('voice', 'Reminder')).kind, 'voice')
  assert.deepEqual(journal.entries('voice').map((e) => e.title), ['Reminder', 'Things to remember'])
  const saves = store.saved
  await assert.rejects(journal.capture('note', ''), /Write a few words first/)
  await assert.rejects(journal.capture('gif', 'x'), JournalError)
  assert.equal(store.saved, saves)
  for (let i = 0; i < 195; i += 1) await journal.capture('note', `n${String(i)}`)
  await assert.rejects(journal.capture('note', 'one more'), /at most 200 moments/)
  await journal.deleteEntry('entry-n1')
  await assert.rejects(journal.deleteEntry('entry-n1'), /no such moment/)
})

test('home modules switch on and off but never all off; preferences and quiet hours are checked', async () => {
  const { journal } = await open()
  await journal.setWidget('quick', false)
  await journal.setWidget('moments', false)
  await assert.rejects(journal.setWidget('focus', false), /Keep at least one module/)
  await assert.rejects(journal.setWidget('nope', true), /no such home module/)
  await journal.setWidget('moments', true)
  await journal.setPreference('compact', true)
  await journal.setPreference('quiet', true)
  assert.deepEqual([journal.state.preferences.compact, journal.state.preferences.quiet], [true, true])
  await journal.setQuietHours('23:00', '07:30')
  assert.deepEqual([journal.state.preferences.quietFrom, journal.state.preferences.quietTo], ['23:00', '07:30'])
  await assert.rejects(journal.setQuietHours('08:00', '08:00'), /different times/)
  await assert.rejects(journal.setQuietHours('8am', '09:00'), /time like 22:00/)
})

test('the focus and its goals: edited, keeping what is already done; at most five; toggled', async () => {
  const { journal } = await open()
  await journal.setFocus('Slow down.', 'Write down one idea\nWalk for ten minutes\nCall mum')
  assert.equal(journal.state.focus, 'Slow down.')
  assert.deepEqual(journal.state.goals.map((g) => [g.text, g.done]), [['Write down one idea', true], ['Walk for ten minutes', true], ['Call mum', false]])
  await assert.rejects(journal.setFocus('', 'a'), /Write today’s focus first/)
  await assert.rejects(journal.setFocus('x', 'a\nb\nc\nd\ne\nf'), /five small goals/)
  await assert.rejects(journal.setFocus('x', 'y'.repeat(51)), /at most 50 characters/)
  await journal.toggleGoal('g3')
  assert.equal(journal.state.goals[2]?.done, true)
  await assert.rejects(journal.toggleGoal('g9'), /no such goal/)
})
