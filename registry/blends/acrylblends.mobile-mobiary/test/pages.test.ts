import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { redirectOf, withApp } from './support.ts'

test('the home screen shows the greeting, the focus, quick capture and recent moments as the mockup does', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/')
    assert.equal(status, 200)
    assert.match(html, /<span>11:00<\/span>/)
    assert.match(html, /<small>THURSDAY, 5 NOVEMBER<\/small><h1>Good morning,<br>Alex\.<\/h1>/)
    assert.match(html, /<small>TODAY'S FOCUS<\/small><strong>Make room for ideas\.<\/strong><small>3 of 5 small goals completed<\/small>/)
    assert.match(html, /role="progressbar" aria-valuenow="60"[^>]*><span style="width:60%">/)
    assert.match(html, /<a href="\/capture\?kind=note" data-capture="note"><em aria-hidden="true">✎<\/em>Note<\/a>/)
    assert.match(html, /data-capture="voice"[^>]*><em[^>]*>◖<\/em>Voice/)
    assert.match(html, /data-capture="photo"[^>]*><em[^>]*>▧<\/em>Photo/)
    assert.match(html, /<b>Recent moments<\/b><a href="\/activity"><small>See all<\/small><\/a>/)
    assert.match(html, /<b>Idea for the studio<\/b><small>Today · Quick note<\/small>/)
    assert.match(html, /<b>Morning walk<\/b><small>Yesterday · Quick note<\/small>/)
    assert.match(html, /<b>Things to remember<\/b><small>Sunday · Voice memo<\/small>/)
    assert.match(html, /<a href="\/" class="active" aria-current="page"><span aria-hidden="true">⌂<\/span>Home<\/a><a href="\/activity">/)
    assert.match(html, /Your day, in<br>your pocket\./)
  }))

test('the companion panel lists the modules and preferences as switches', () =>
  withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /<h2>Home screen modules<\/h2><p>Choose what appears when the app opens\.<\/p>/)
    assert.match(html, /<b>Daily focus<\/b><small>One intention for today<\/small><\/div>.*role="switch" aria-checked="true" aria-label="Toggle daily focus"/)
    assert.match(html, /<b>Recent moments<\/b><small>Last three saved entries<\/small>/)
    assert.match(html, /<b>Quiet notifications<\/b><small>Only reminders you choose<\/small><\/div>.*class="switch" type="submit" role="switch" aria-checked="false"/)
    assert.match(html, /<b>Compact mode<\/b>/)
    assert.match(html, /<input id="note" name="title" placeholder="Capture a thought…"/)
    assert.doesNotMatch(html, /phone compact/)
  }))

test('switching a module off removes it from the home screen; the last one cannot be switched off', () =>
  withApp(async (app) => {
    const off = await app.post('/widgets/moments', { on: 'off', back: '/' })
    assert.deepEqual(redirectOf(off), { path: '/', ok: 'Recent moments removed from the home screen.' })
    let html = (await app.page('/')).html
    assert.doesNotMatch(html, /Recent moments<\/b><a/)
    assert.match(html, /aria-checked="false" aria-label="Toggle recent moments"/)
    await app.post('/widgets/quick', { on: 'off' })
    assert.doesNotMatch((await app.page('/')).html, /data-capture=/)
    assert.equal(redirectOf(await app.post('/widgets/focus', { on: 'off' })).error, 'Keep at least one module on the home screen.')
    html = (await app.page('/')).html
    assert.match(html, /id="focus"/)
    assert.equal(redirectOf(await app.post('/widgets/nope', { on: 'on' })).error, 'There is no such home module.')
    await app.post('/widgets/moments', { on: 'on' })
    assert.match((await app.page('/')).html, /Recent moments<\/b>/)
  }))

test('compact mode and quiet notifications change the device and the profile', () =>
  withApp(async (app) => {
    assert.equal(redirectOf(await app.post('/preferences/compact', { on: 'on' })).ok, 'Compact mode on.')
    assert.match((await app.page('/')).html, /<div class="phone compact">/)
    assert.equal(redirectOf(await app.post('/preferences/quiet', { on: 'on' })).ok, 'Quiet notifications on.')
    const profile = (await app.page('/profile')).html
    assert.match(profile, /id="notifications">Quiet · only reminders you choose<\/small>/)
    assert.match(profile, /<small>Compact<\/small>/)
    assert.equal(redirectOf(await app.post('/preferences/volume', { on: 'on' })).error, 'There is no such preference.')
  }))

test('capture: the kind chosen on Home opens a screen with a placeholder; saving puts the moment in Activity', () =>
  withApp(async (app) => {
    const screen = (await app.page('/capture?kind=voice')).html
    assert.match(screen, /<a href="\/capture\?kind=voice" class="on" aria-current="true" data-kind="voice">/)
    assert.match(screen, /voice memo placeholder<br>Nothing is recorded in this prototype\./)
    assert.match(screen, /<h1>Say it out loud\.<\/h1>/)
    assert.match((await app.page('/capture?kind=photo')).html, /No camera is used/)
    const saved = await app.post('/capture', { kind: 'voice', title: 'Pick up the keys' })
    assert.equal(saved.status, 303)
    assert.deepEqual(redirectOf(saved), { path: '/activity', ok: 'Saved to your demo journal: Pick up the keys' })
    const activity = (await app.page('/activity')).html
    assert.match(activity, /<b>Pick up the keys<\/b><small>Today · Voice memo<\/small>/)
    assert.ok(activity.indexOf('Pick up the keys') < activity.indexOf('Idea for the studio'))
  }))

test('the quick-note form saves a note and returns to where it was typed; an empty or long note is refused and kept', () =>
  withApp(async (app) => {
    const ok = await app.post('/capture', { kind: 'note', title: 'Buy stamps', back: '/' })
    assert.deepEqual(redirectOf(ok), { path: '/', ok: 'Saved to your demo journal: Buy stamps' })
    assert.match((await app.page('/')).html, /<b>Buy stamps<\/b>/)
    const empty = await app.post('/capture', { kind: 'note', title: '  ' })
    assert.equal(redirectOf(empty).error, 'Write a few words first.')
    assert.match(empty.headers.get('location') ?? '', /^\/capture\?kind=note/)
    const long = await app.post('/capture', { kind: 'photo', title: 'x'.repeat(81) })
    assert.match(redirectOf(long).error ?? '', /at most 80 characters/)
    const page = (await app.page(long.headers.get('location') ?? '/capture')).html
    assert.match(page, /role="alert">A moment is at most 80 characters\./)
    assert.match(page, /x{80}/)
    assert.equal(redirectOf(await app.post('/capture', { kind: 'gif', title: 'x' })).error, 'Pick note, voice or photo.')
  }))

test('the activity list filters by kind and deletes a moment', () =>
  withApp(async (app) => {
    const all = (await app.page('/activity')).html
    assert.match(all, /<div class="hello"><small>YOUR JOURNAL<\/small><h1>Little moments\.<\/h1><\/div>/)
    assert.equal((all.match(/data-entry=/g) ?? []).length, 3)
    assert.match(all, /<a href="\/activity" class="on">All<\/a>/)
    const voice = (await app.page('/activity?kind=voice')).html
    assert.equal((voice.match(/data-entry=/g) ?? []).length, 1)
    assert.match(voice, /Things to remember/)
    assert.match(voice, /<a href="\/activity\?kind=voice" class="on" data-kind="voice">Voices<\/a>/)
    const del = await app.post('/activity/e2/delete', { back: '/activity?kind=note' })
    assert.deepEqual(redirectOf(del), { path: '/activity', ok: 'Moment deleted.' })
    assert.doesNotMatch((await app.page('/activity')).html, /Morning walk/)
    assert.equal(redirectOf(await app.post('/activity/e2/delete', {})).error, 'There is no such moment.')
  }))

test('the profile shows the person and the quiet hours, which can be changed', () =>
  withApp(async (app) => {
    const html = (await app.page('/profile')).html
    assert.match(html, /<h1>Made for you\.<\/h1>/)
    assert.match(html, /<b>Alex<\/b><small>Personal workspace<\/small>/)
    assert.match(html, /id="quiet-hours">22:00 – 08:00<\/small>/)
    assert.match(html, /id="notifications">All reminders<\/small>/)
    assert.deepEqual(redirectOf(await app.post('/profile/quiet-hours', { from: '23:00', to: '07:00' })), { path: '/profile', ok: 'Quiet hours saved.' })
    assert.match((await app.page('/profile')).html, /id="quiet-hours">23:00 – 07:00/)
    assert.equal(redirectOf(await app.post('/profile/quiet-hours', { from: '07:00', to: '07:00' })).error, 'Quiet hours must start and end at different times.')
    assert.equal(redirectOf(await app.post('/profile/quiet-hours', { from: 'late', to: '07:00' })).error, 'Quiet hours start is a time like 22:00.')
  }))

test('the focus and its goals are edited in the panel and checked off', () =>
  withApp(async (app) => {
    const html = (await app.page('/')).html
    assert.match(html, /<label class="field">Small goals \(one per line, up to five\) · 3 of 5 done<textarea name="goals" rows="5">Write down one idea\nWalk for ten minutes/)
    assert.equal(redirectOf(await app.post('/goals/g4/toggle', {})).path, '/')
    assert.match((await app.page('/')).html, /4 of 5 small goals completed/)
    assert.equal(redirectOf(await app.post('/focus', { focus: 'Slow down.', goals: 'One\nTwo' })).ok, 'Today’s focus saved.')
    assert.match((await app.page('/')).html, /<strong>Slow down\.<\/strong><small>0 of 2 small goals completed/)
    assert.equal(redirectOf(await app.post('/focus', { focus: '', goals: '' })).error, 'Write today’s focus first.')
    assert.equal(redirectOf(await app.post('/goals/g9/toggle', {})).error, 'There is no such goal.')
  }))

test('a back address that leaves the app is ignored', () =>
  withApp(async (app) => {
    for (const back of ['https://evil.example/', '//evil.example', '/\\evil']) {
      const response = await app.post('/widgets/moments', { on: 'on', back })
      assert.equal(redirectOf(response).path, '/', back)
    }
  }))

test('under the frame prefix every screen and link carries it', () =>
  withApp(
    async (app) => {
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, new RegExp(`href="${FRAME_MOUNT_PREFIX}/activity"`))
      assert.match(html, new RegExp(`action="${FRAME_MOUNT_PREFIX}/capture"`))
      assert.equal(redirectOf(await app.post('/capture', { kind: 'note', title: 'hi' })).path, `${FRAME_MOUNT_PREFIX}/activity`)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  ))

test('the home widget shows the moment count and the focus', () =>
  withApp(async (app) => {
    const widget = app.root.home.widgets().find((w) => w.id === 'today')
    assert.ok(widget)
    assert.match(String(await widget.render()), /<b>3<\/b> moments · Make room for ideas\./)
  }))
