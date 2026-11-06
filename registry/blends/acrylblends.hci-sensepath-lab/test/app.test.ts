import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { redirectOf, withApp } from './support.ts'

test('answers health checks on its own server and under the frame prefix, and 404 for unknown paths', async () => {
  await withApp(async (app) => {
    assert.equal((await app.root.router.request('/health')).status, 200)
    const missing = await app.root.router.request('/nope')
    assert.equal(missing.status, 404)
    await missing.body?.cancel()
  })
  await withApp(
    async (app) => {
      assert.equal(app.root.senseShell.prefix, FRAME_MOUNT_PREFIX)
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, /href="\/app\/\?modality=gesture"/)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  )
})

test('opens the lab over the seed and saves it at once', () =>
  withApp(async (app) => {
    assert.equal(app.store.saved, 1)
    assert.equal(app.root.lab.state.observations.length, 2)
  }))

test('a part leaves with its plugin', async () => {
  await withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /Session snapshot/)
    assert.match(html, /Save observation/)
  })
  await withApp(
    async (app) => {
      const { html } = await app.page('/')
      assert.doesNotMatch(html, /Save observation|Observations</)
      assert.equal((await app.post('/observations', { modality: 'speech' })).status, 404)
    },
    { off: ['observations'] },
  )
})

test('the shell escapes what people type and shows a notice from the redirect query', () =>
  withApp(async (app) => {
    const url = '/?error=Bad%20%3Cinput%3E'
    assert.match(app.root.senseShell.page({ title: '<x>', main: '', url }), /<title>&lt;x&gt; · Sensepath Lab<\/title>/)
    assert.match(app.root.senseShell.notice(url), /<p role="alert">Bad &lt;input&gt;<\/p>/)
  }))

test('the manifest decides what is mounted', async () => {
  const { readManifest } = await import('../src/app.ts')
  const library = ['router', 'home', 'sensepath', 'sense-shell', 'modalities', 'workbench', 'snapshot', 'observations', 'extensions', 'server', 'acryl-door']
  assert.deepEqual(readManifest().plugins.map((r) => r.id).filter((id) => library.includes(id)), library)
  assert.throws(() => readManifest({ nothing: 1 }), /parameter-override-unknown/)
})

test('the workbench opens on speech as the mockup does, and any modality by ?modality=', () =>
  withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /<h2 id="modtitle">Speech control<\/h2>/)
    assert.match(html, /Move to next section/)
    assert.match(html, /id="completion">92%</)
    assert.match(html, /id="latency">1\.4s</)
    assert.match(html, /RESEARCH MODE/)
    assert.match(html, /data-variant="Voice command" aria-pressed="true"/)
    assert.match(html, /value="72"/)
    const eye = (await app.page('/?modality=eye')).html
    assert.match(eye, /Focus the navigation item/)
    assert.match(eye, /baseline, not run yet/)
    assert.match(eye, /Gaze · dwell \+ switch confirmation/)
    assert.match((await app.page('/?modality=nope')).html, /Speech control/)
  }))

test('choosing a variant, saving settings and resetting', () =>
  withApp(async (app) => {
    assert.match(redirectOf(await app.post('/modalities/speech/variant', { variant: '1' })).ok ?? '', /Dictation profile selected/)
    assert.match((await app.page('/')).html, /data-variant="Dictation" aria-pressed="true"/)
    assert.match(redirectOf(await app.post('/modalities/speech/calibration', { sensitivity: '60', feedback: 'text' })).ok ?? '', /Calibration saved/)
    const html = (await app.page('/')).html
    assert.match(html, /value="60"/)
    assert.match(html, /<option value="text" selected>/)
    assert.match(redirectOf(await app.post('/modalities/speech/calibration', { sensitivity: '3' })).error ?? '', /Sensitivity must be a whole number/)
    assert.match(redirectOf(await app.post('/modalities/speech/reset', {})).ok ?? '', /Scenario reset/)
    assert.match((await app.page('/')).html, /value="72"/)
    assert.match(redirectOf(await app.post('/modalities/nope/reset', {})).error ?? '', /no such modality/)
  }))

test('running the task updates the snapshot; a missed task shows the error state', () =>
  withApp(async (app) => {
    const r = redirectOf(await app.post('/modalities/eye/run', { sensitivity: '72', feedback: 'visual-text' }))
    assert.match(r.ok ?? '', /Simulation complete: Eye tracking task completed with the selected feedback profile \(84%, 0\.9 s\)/)
    const html = (await app.page('/?modality=eye')).html
    assert.match(html, /id="completion">84%</)
    assert.match(html, /Task completed/)
    assert.match(html, /Input recognised/)
    const miss = redirectOf(await app.post('/modalities/eye/run', { sensitivity: '10' }))
    assert.match(miss.ok ?? '', /task was missed/)
    const bad = (await app.page('/?modality=eye')).html
    assert.match(bad, /class="metric bad"/)
    assert.match(bad, /class="target missed"/)
    assert.match(redirectOf(await app.post('/modalities/eye/run', { sensitivity: '500' })).error ?? '', /Sensitivity/)
  }))

test('saving an observation needs a run; it lists, compares and deletes', () =>
  withApp(async (app) => {
    assert.match(redirectOf(await app.post('/observations', { modality: 'haptics', note: '' })).error ?? '', /Run the Haptic interface task simulation first/)
    await app.post('/modalities/haptics/run', {})
    assert.match(redirectOf(await app.post('/observations', { modality: 'haptics', note: 'Cue noticed' })).ok ?? '', /Observation saved to local demo session/)
    const html = (await app.page('/?modality=haptics')).html
    assert.match(html, /Haptic interface<\/b> · today 11:00/)
    assert.match(html, /Cue noticed/)
    const cmp = (await app.page('/?modality=haptics&a=obs-s2&b=obs-s1')).html
    assert.match(cmp, /id="comparison">Completion −4 pts · response −0\.3 s<br>modality: Speech control → Gesture recognition/)
    assert.match((await app.page('/?a=obs-s1&b=obs-s1')).html, /Pick two different observations/)
    assert.match(redirectOf(await app.post('/observations/obs-s1/delete', { modality: 'speech' })).ok ?? '', /Observation deleted/)
    assert.match(redirectOf(await app.post('/observations/obs-s1/delete', { modality: 'speech' })).error ?? '', /no such observation/)
  }))
