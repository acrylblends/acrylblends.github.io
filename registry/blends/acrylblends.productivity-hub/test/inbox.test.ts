/**
 * The Inbox (route /inbox): the seed captures, quick capture from the page and the sidebar, triage into a task or a note, discard, the empty state,
 * validation and the frame prefix.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { seed } from '../plugins/productivity-hub/index.ts'
import { capturedLabel } from '../plugins/inbox/format.ts'
import { NOW, withApp } from './support.ts'

const seedState = seed(NOW)

test('the inbox lists the seed captures with the count, and the capture field', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/inbox')
    assert.equal(status, 200)
    assert.match(html, /Clear the noise<span>\.<\/span>/)
    assert.match(html, /3 things to triage\. Turn each into a task or a note\./)
    assert.match(html, /Podcast episode on calm onboarding, listen on the train/)
    assert.match(html, /Ask Marta whether the invoice goes to the new address/)
    assert.match(html, /Birthday gift idea for Sam: a good notebook/)
    assert.match(html, /<a href="\/inbox" class="on" aria-current="page">/)
    assert.match(html, /<span>Inbox<\/span><em>3<\/em>/)
    assert.match(html, /action="\/inbox"/)
    assert.match(html, /name="text"/)
    assert.equal((html.match(/Make task/g) ?? []).length, 3)
    assert.equal((html.match(/Make note/g) ?? []).length, 3)
    assert.equal((html.match(/Discard/g) ?? []).length, 3)
  }))

test('quick capture adds a capture to the inbox and shows it', () =>
  withApp(async (app) => {
    const response = await app.post('/inbox', { text: 'Call the dentist' })
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/inbox?ok=Captured.')
    assert.equal(app.store.state?.inbox.length, 4)
    const { html } = await app.page('/inbox')
    assert.match(html, /Call the dentist/)
    assert.match(html, /<span>Inbox<\/span><em>4<\/em>/)
  }))

test('an empty capture is refused with the domain\'s sentence, and nothing is saved', () =>
  withApp(async (app) => {
    const before = app.store.saved
    const response = await app.post('/inbox', { text: '   ' })
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/inbox?error=Write%20something%20to%20capture.')
    assert.equal(app.store.saved, before)
    assert.equal(app.store.state?.inbox.length, 3)
    const { html } = await app.page('/inbox?error=Write%20something%20to%20capture.')
    assert.match(html, /<p class="p-alert error" role="alert">Write something to capture\.<\/p>/)
  }))

test('triage into a task gives it the capture\'s words, the chosen date and space, and it appears on My Day', () =>
  withApp(async (app) => {
    const response = await app.post('/inbox/inbox-podcast/task', { dueAt: '2026-11-05', projectId: 'space-personal' })
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/inbox?ok=Moved%20to%20your%20tasks.')
    assert.equal(app.store.state?.inbox.length, 2)
    const task = app.store.state?.tasks.find((entry) => entry.title.startsWith('Podcast episode'))
    assert.equal(task?.dueAt, '2026-11-05T17:00')
    assert.equal(task?.projectId, 'space-personal')
    const myDay = await app.page('/')
    assert.match(myDay.html, /Podcast episode on calm onboarding/)
    assert.match(myDay.html, /5 remaining/)
  }))

test('triage into a note saves the capture as a note and leaves the inbox', () =>
  withApp(async (app) => {
    const response = await app.post('/inbox/inbox-invoice/note', {})
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/inbox?ok=Saved%20as%20a%20note.')
    assert.equal(app.store.state?.inbox.length, 2)
    const note = app.store.state?.notes.find((entry) => entry.title.startsWith('Ask Marta'))
    assert.equal(note?.title, 'Ask Marta whether the invoice goes to the new address')
    const { html } = await app.page('/inbox')
    assert.doesNotMatch(html, /Ask Marta whether the invoice goes to the new address/)
    assert.match(html, /<span>Inbox<\/span><em>2<\/em>/)
  }))

test('discard takes a capture out of the inbox', () =>
  withApp(async (app) => {
    const response = await app.post('/inbox/inbox-gift/discard', {})
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/inbox?ok=Discarded.')
    assert.equal(app.store.state?.inbox.length, 2)
    const { html } = await app.page('/inbox')
    assert.doesNotMatch(html, /Birthday gift idea for Sam/)
  }))

test('a capture that is already gone answers with a notice and changes nothing', () =>
  withApp(async (app) => {
    const before = app.store.saved
    const response = await app.post('/inbox/inbox-nope/task', { dueAt: '2026-11-05' })
    assert.equal(response.status, 303)
    assert.match(response.headers.get('location') ?? '', /^\/inbox\?error=There%20is%20no%20inbox%20item/)
    assert.equal(app.store.saved, before)
  }))

test('a due date the domain refuses keeps the capture in the inbox', () =>
  withApp(async (app) => {
    const response = await app.post('/inbox/inbox-podcast/task', { dueAt: 'not-a-date' })
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/inbox?error=The%20due%20date%20is%20not%20a%20date%20and%20time.')
    assert.equal(app.store.state?.inbox.length, 3)
  }))

test('an empty inbox says it is zero and still offers capture', () =>
  withApp(
    async (app) => {
      const { status, html } = await app.page('/inbox')
      assert.equal(status, 200)
      assert.match(html, /Inbox zero\./)
      assert.match(html, /Nothing to triage\./)
      assert.match(html, /name="text"/)
      assert.match(html, /Inbox zero\. Capture anything that needs a place\./)
      assert.doesNotMatch(html, /<span>Inbox<\/span><em>/)
    },
    { state: { ...seedState, inbox: [] } },
  ))

test('the inbox mounts and links under the frame prefix, and its forms land there', () =>
  withApp(
    async (app) => {
      const { status, html } = await app.page('/inbox')
      assert.equal(status, 200)
      assert.match(html, /action="\/app\/inbox"/)
      assert.match(html, /action="\/app\/inbox\/inbox-podcast\/task"/)
      const response = await app.post('/inbox', { text: 'From the frame' })
      assert.equal(response.status, 303)
      assert.equal(response.headers.get('location'), '/app/inbox?ok=Captured.')
    },
    { prefix: '/app' },
  ))

test('capture times read in the day\'s words', () => {
  const now = new Date(2026, 10, 5, 8, 40)
  assert.equal(capturedLabel('2026-11-05T08:10', now), '30 min ago')
  assert.equal(capturedLabel('2026-11-05T07:05', now), '1 h ago')
  assert.equal(capturedLabel('2026-11-05T08:39', now), '1 min ago')
  assert.equal(capturedLabel('2026-11-04T19:00', now), 'Yesterday, 19:00')
  assert.equal(capturedLabel('2026-10-31T09:15', now), '31 Oct, 09:15')
})
