import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withApp } from './support.ts'

test('the notes page shows every note as a pastel card with its space, date, snippet and tags', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/notes')
    assert.equal(status, 200)
    assert.match(html, /<h1>Notes<span>\.<\/span><\/h1>/)
    assert.match(html, /4 notes/)
    for (const title of ['Onboarding: open questions', 'Ideas worth exploring', 'Reading notes: Deep Work', 'Launch checklist'])
      assert.ok(html.includes(title), title)
    // A card is a coloured link to the note, with the space and the day it changed.
    assert.match(html, /<a class="p-note amber" href="\/notes\/note-onboarding" data-note="note-onboarding">/)
    assert.match(html, /<small>Product launch · Yesterday<\/small>/)
    assert.match(html, /Keep the first run to one clear action\./)
    assert.match(html, /<span class="p-tag">onboarding<\/span>/)
    assert.match(html, /<span class="p-tag">questions<\/span>/)
    assert.match(html, /class="p-note sky"[^>]*href="\/notes\/note-ideas"/)
    assert.match(html, /class="p-note sage"[^>]*href="\/notes\/note-deep-work"/)
    assert.match(html, /<a class="p-btn" href="\/notes\?new=1">\+ New note<\/a>/)
  }))

test('search narrows the cards, and an empty result says so', () =>
  withApp(async (app) => {
    const deep = await app.page('/notes?q=deep')
    assert.match(deep.html, /Reading notes: Deep Work/)
    assert.doesNotMatch(deep.html, /Ideas worth exploring/)
    assert.match(deep.html, /1 note matching “deep”/)

    const none = await app.page('/notes?q=nothing-matches')
    assert.match(none.html, /No notes yet\./)
  }))

test('the editor shows the note, its space, its tags and the tasks linked to it, with the saved state', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/notes/note-onboarding')
    assert.equal(status, 200)
    assert.match(html, /value="Onboarding: open questions"/)
    assert.match(html, /Keep the first run to one clear action/)
    assert.match(html, /<option value="space-launch" selected>Product launch<\/option>/)
    assert.match(html, /name="tags" value="onboarding, questions"/)
    // The editor's unsaved state starts saved, and the script that follows the form is on the page.
    assert.match(html, /<span class="notes-state" id="notes-state" data-state="saved">Saved<\/span>/)
    assert.match(html, /Unsaved changes/)
    assert.match(html, /beforeunload/)
    // The tasks linked to the note are checked; the other open tasks are offered too.
    assert.match(html, /name="taskIds" value="task-onboarding" checked/)
    assert.match(html, /name="taskIds" value="task-copy" checked/)
    assert.match(html, /name="taskIds" value="task-estimate"/)
    assert.match(html, /action="\/notes\/note-onboarding\/links"/)
    assert.match(html, /action="\/notes\/note-onboarding\/delete"/)
  }))

test('a missing note answers 404 with the shell around it', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/notes/no-such-note')
    assert.equal(status, 404)
    assert.match(html, /That note is not here<span>\.<\/span>/)
    assert.match(html, /href="\/notes">← All notes<\/a>/)
  }))

test('a post creates a note, cleans its tags and opens its editor', () =>
  withApp(async (app) => {
    const form = await app.page('/notes?new=1')
    assert.match(form.html, /id="notes-new"/)
    assert.match(form.html, /name="title"/)

    const response = await app.post('/notes', {
      title: 'A new note',
      body: 'Some words while they are fresh.',
      projectId: 'space-reading',
      tags: 'Idea, #ideas',
    })
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/notes/note-1?ok=Note%20added.')
    const notes = app.root.hub.state.notes
    assert.equal(notes.length, 5)
    const added = notes.find((note) => note.id === 'note-1')
    assert.deepEqual(
      { title: added?.title, body: added?.body, projectId: added?.projectId, tags: added?.tags, updatedAt: added?.updatedAt },
      {
        title: 'A new note',
        body: 'Some words while they are fresh.',
        projectId: 'space-reading',
        tags: ['idea', 'ideas'],
        updatedAt: '2026-11-05T08:40',
      },
    )
  }))

test('an invalid note is refused with a sentence and changes nothing', () =>
  withApp(async (app) => {
    const before = app.root.hub.state.notes.length
    const response = await app.post('/notes', { title: '  ' })
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/notes?new=1&error=A%20note%20title%20is%20needed.')
    assert.equal(app.root.hub.state.notes.length, before)
  }))

test('saving a note keeps its words, clears the space when asked and lowercases the tags', () =>
  withApp(async (app) => {
    const response = await app.post('/notes/note-onboarding', {
      title: 'Onboarding: the remaining questions',
      body: 'Fewer steps, sooner value.',
      projectId: '',
      tags: 'One, Two',
    })
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/notes/note-onboarding?ok=Note%20saved.')
    const note = app.root.hub.note('note-onboarding')
    assert.equal(note.title, 'Onboarding: the remaining questions')
    assert.equal(note.body, 'Fewer steps, sooner value.')
    assert.equal(note.projectId, undefined)
    assert.deepEqual(note.tags, ['one', 'two'])
    assert.equal(note.updatedAt, '2026-11-05T08:40')
  }))

test('the editor links tasks to the note and unlinks the ones left unchecked', () =>
  withApp(async (app) => {
    const response = await app.post('/notes/note-onboarding/links', { taskIds: 'task-estimate' })
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/notes/note-onboarding?ok=Linked%20tasks%20saved.')
    assert.equal(app.root.hub.task('task-estimate').noteId, 'note-onboarding')
    assert.equal(app.root.hub.task('task-onboarding').noteId, undefined)
    assert.equal(app.root.hub.task('task-copy').noteId, undefined)
    assert.deepEqual(
      app.root.hub.linkedTasks('note-onboarding').map((task) => task.id),
      ['task-estimate'],
    )
    const page = await app.page('/notes/note-onboarding')
    assert.match(page.html, /name="taskIds" value="task-estimate" checked/)
    assert.doesNotMatch(page.html, /name="taskIds" value="task-copy" checked/)
  }))

test('deleting a note keeps its tasks and clears their link', () =>
  withApp(async (app) => {
    const response = await app.post('/notes/note-onboarding/delete', {})
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/notes?ok=Note%20deleted.')
    assert.equal(app.root.hub.state.notes.length, 3)
    assert.throws(() => app.root.hub.note('note-onboarding'), /no note/u)
    assert.equal(app.root.hub.task('task-onboarding').noteId, undefined)
    assert.equal(app.root.hub.task('task-copy').noteId, undefined)
    assert.equal(app.root.hub.state.tasks.some((task) => task.id === 'task-onboarding'), true)
  }))

test('the frame prefix is on the page, its cards and its form actions', () =>
  withApp(
    async (app) => {
      const page = await app.page('/notes')
      assert.equal(page.status, 200)
      assert.match(page.html, /href="\/app\/notes\/note-onboarding"/)
      assert.match(page.html, /<a class="p-btn" href="\/app\/notes\?new=1">/)
      const editor = await app.page('/notes/note-onboarding')
      assert.match(editor.html, /action="\/app\/notes\/note-onboarding"/)
      assert.match(editor.html, /action="\/app\/notes\/note-onboarding\/delete"/)
    },
    { prefix: '/app' },
  ))
