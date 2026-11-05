import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withApp } from './support.ts'

test('the tasks page lists every open task with its space, estimate, priority and due label', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/tasks')
    assert.equal(status, 200)
    assert.match(html, /<h1>All tasks<span>\.<\/span><\/h1>/)
    for (const title of [
      'Review onboarding copy',
      'Send revised estimate to Marta',
      'Prepare notes for weekly review',
      'Return &quot;Deep Work&quot; to the library',
      'Ship the first version of the onboarding flow',
    ])
      assert.ok(html.includes(title), title)
    // The done task stays out of the open list.
    assert.doesNotMatch(html, /Book the dentist/)
    // Space, estimate and priority are on the row; the high ones also carry the tag.
    assert.match(html, /Product launch · 30 min · Normal/)
    assert.match(html, /Personal · 20 min · Normal/)
    assert.match(html, /Product launch · 15 min · High/)
    // The due label reads as one string: the shell must not tint its first letter (an 11:30 whose 1 is orange looks broken).
    assert.doesNotMatch(html, /\.p-when::first-letter/u)
    // The due label and the overdue state.
    assert.match(html, /<em class="p-when">11:30<\/em>/)
    assert.match(html, /<em class="p-when overdue">Overdue<\/em>/)
    assert.match(html, /data-task="task-library"/)
    // The filters count the open and done tasks; the page registers the sidebar entry as the current one.
    assert.match(html, /Open <b>5<\/b>/)
    assert.match(html, /Done <b>1<\/b>/)
    assert.match(html, /All <b>6<\/b>/)
    assert.match(html, /<a href="\/tasks" class="on" aria-current="page">/)
    assert.match(html, /<a class="p-btn" href="\/tasks\?new=1">\+ New task<\/a>/)
  }))

test('status, space and search filter the list', () =>
  withApp(async (app) => {
    const done = await app.page('/tasks?status=done')
    assert.match(done.html, /Book the dentist/)
    assert.doesNotMatch(done.html, /Review onboarding copy/)
    assert.match(done.html, /class="p-task done"/)

    const personal = await app.page('/tasks?space=space-personal')
    assert.match(personal.html, /Prepare notes for weekly review/)
    assert.doesNotMatch(personal.html, /Review onboarding copy/)
    assert.match(personal.html, /Personal ×/)

    const search = await app.page('/tasks?q=estimate')
    assert.match(search.html, /Send revised estimate to Marta/)
    assert.doesNotMatch(search.html, /Prepare notes for weekly review/)

    const none = await app.page('/tasks?q=nothing-matches')
    assert.match(none.html, /Nothing here yet\./)
  }))

test('the new-task form opens with the spaces, and a post adds the task and redirects with a notice', () =>
  withApp(async (app) => {
    const form = await app.page('/tasks?new=1')
    assert.match(form.html, /id="task-form"/)
    assert.match(form.html, /name="title"/)
    assert.match(form.html, /<option value="space-launch">Product launch<\/option>/)
    assert.match(form.html, /name="estimateMinutes"/)

    const response = await app.post('/tasks', {
      title: 'Write the agenda',
      projectId: 'space-personal',
      dueAt: '2026-11-06',
      priority: 'high',
      estimateMinutes: '25',
    })
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/tasks?ok=Task%20added.')
    const tasks = app.root.hub.state.tasks
    assert.equal(tasks.length, 7)
    const added = tasks.find((task) => task.title === 'Write the agenda')
    assert.deepEqual(
      {
        status: added?.status,
        dueAt: added?.dueAt,
        priority: added?.priority,
        projectId: added?.projectId,
        estimateMinutes: added?.estimateMinutes,
      },
      { status: 'open', dueAt: '2026-11-06T17:00', priority: 'high', projectId: 'space-personal', estimateMinutes: 25 },
    )
  }))

test('an invalid task is refused with a sentence and changes nothing', () =>
  withApp(async (app) => {
    const before = app.root.hub.state.tasks.length
    const response = await app.post('/tasks', { title: '   ' })
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), '/tasks?new=1&error=A%20task%20title%20is%20needed.')
    assert.equal(app.root.hub.state.tasks.length, before)

    const badEstimate = await app.post('/tasks', { title: 'Too long', estimateMinutes: '0' })
    assert.equal(badEstimate.status, 303)
    assert.match(badEstimate.headers.get('location') ?? '', /error=/)
    assert.equal(app.root.hub.state.tasks.length, before)
  }))

test('a task completes and reopens from the list', () =>
  withApp(async (app) => {
    const completed = await app.post('/tasks/task-copy/complete', {})
    assert.equal(completed.status, 303)
    assert.equal(completed.headers.get('location'), '/tasks?ok=Task%20completed.')
    assert.equal(app.root.hub.task('task-copy').status, 'done')
    assert.equal(app.root.hub.task('task-copy').completedAt, '2026-11-05T08:40')

    const donePage = await app.page('/tasks?status=done')
    assert.match(donePage.html, /Review onboarding copy/)

    const reopened = await app.post('/tasks/task-copy/reopen', {})
    assert.equal(reopened.status, 303)
    assert.equal(app.root.hub.task('task-copy').status, 'open')
    assert.equal(app.root.hub.task('task-copy').completedAt, undefined)
  }))

test('the edit form saves every field, and an invalid edit keeps the old one', () =>
  withApp(async (app) => {
    const form = await app.page('/tasks?edit=task-copy')
    assert.match(form.html, /value="Review onboarding copy"/)
    assert.match(form.html, /<option value="space-launch" selected>Product launch<\/option>/)

    const saved = await app.post('/tasks/task-copy', {
      title: 'Review the onboarding copy',
      projectId: 'space-personal',
      dueAt: '2026-11-06',
      priority: 'low',
      estimateMinutes: '45',
    })
    assert.equal(saved.status, 303)
    assert.equal(saved.headers.get('location'), '/tasks?ok=Task%20saved.')
    const task = app.root.hub.task('task-copy')
    assert.equal(task.title, 'Review the onboarding copy')
    assert.equal(task.projectId, 'space-personal')
    assert.equal(task.dueAt, '2026-11-06T17:00')
    assert.equal(task.priority, 'low')
    assert.equal(task.estimateMinutes, 45)

    const refused = await app.post('/tasks/task-copy', { title: '' })
    assert.equal(refused.status, 303)
    assert.equal(refused.headers.get('location'), '/tasks?edit=task-copy&error=A%20task%20title%20is%20needed.')
    assert.equal(app.root.hub.task('task-copy').title, 'Review the onboarding copy')
  }))

test('the frame prefix is on every route and every link', () =>
  withApp(
    async (app) => {
      const page = await app.page('/tasks')
      assert.equal(page.status, 200)
      assert.match(page.html, /<a class="p-btn" href="\/app\/tasks\?new=1">/)
      assert.match(page.html, /action="\/app\/tasks"/)
      const direct = await app.root.router.request('/app/tasks')
      assert.equal(direct.status, 200)
      await direct.body?.cancel()
    },
    { prefix: '/app' },
  ))
