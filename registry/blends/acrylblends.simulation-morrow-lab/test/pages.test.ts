import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { redirectOf, withApp } from './support.ts'

const baseline = { ambient: '21', heater: '68', airflow: '42', insulation: '74' }

test('the setup page shows the seed: the models, the sliders, the baseline run and the notices', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/')
    assert.equal(status, 200)
    assert.match(html, /<h1 id="title">Chamber 04 \/ Baseline<\/h1>/)
    assert.match(html, /Models \/ Chamber 04 \/ Experiment 18/)
    assert.match(html, /<button class="scenario active" type="submit" aria-current="true" data-model="Chamber 04">/)
    assert.match(html, /Battery bay[\s\S]*Drying tunnel/)
    assert.match(html, /<output id="ambientVal" for="ambient">21 °C<\/output>/)
    assert.match(html, /<output id="insVal" for="ins">0\.74<\/output>/)
    assert.match(html, /<b id="peak">64\.8°<\/b>/)
    assert.match(html, /<b id="energy">1\.36<\/b>/)
    assert.match(html, /● Run completed/)
    assert.match(html, /Baseline · 18<\/b><small>Today, 10:42 · Completed/)
    assert.match(html, /High airflow · 17<\/b><small>Yesterday · Completed/)
    assert.match(html, /Not validated for engineering/)
    assert.match(html, /<a href="\/" class="active" aria-current="page">Experiment setup<\/a>/)
    assert.match(html, /Grid resolution<\/span><b>24 × 12<\/b>/)
    assert.match(html, /Compare against high-airflow run/)
  }))

test('run posts the parameters, keeps a numbered run and redirects with its peak', () =>
  withApp(async (app) => {
    const response = await app.post('/run', { ...baseline, heater: '90', name: 'Hot heater' })
    assert.equal(response.status, 303)
    const to = redirectOf(response)
    assert.equal(to.path, '/')
    assert.match(to.ok ?? '', /^Simulation complete: Hot heater · 19 peaks at \d+\.\d °C\.$/)
    const { html } = await app.page('/')
    assert.match(html, /Chamber 04 \/ Hot heater/)
    assert.match(html, /Experiment 19/)
    assert.equal(app.root.lab.state.runs.length, 4)
  }))

test('a bad parameter is refused with the reason and nothing is saved', () =>
  withApp(async (app) => {
    const saves = app.store.saved
    const response = await app.post('/run', { ...baseline, airflow: '140' })
    assert.equal(redirectOf(response).error, 'Airflow must be a whole number from 0 to 100.')
    assert.equal(app.store.saved, saves)
    const { html } = await app.page(`/?error=${encodeURIComponent('Airflow must be a whole number from 0 to 100.')}`)
    assert.match(html, /role="alert">Airflow must be a whole number/)
  }))

test('keeping a draft marks the parameters changed; reset brings the baseline back', () =>
  withApp(async (app) => {
    assert.equal(redirectOf(await app.post('/setup', { ...baseline, heater: '30' })).ok, 'Draft parameters kept.')
    let page = await app.page('/')
    assert.match(page.html, /pill changed" id="state">● Parameters changed/)
    assert.match(page.html, /<output id="heaterVal" for="heater">30%<\/output>/)
    assert.match(page.html, /Estimates for the draft/)
    assert.equal(redirectOf(await app.post('/setup/reset', {})).ok, 'Baseline parameters restored.')
    page = await app.page('/')
    assert.match(page.html, /● Run completed/)
    assert.match(page.html, /value="68"/)
  }))

test('the library selects and creates models', () =>
  withApp(async (app) => {
    const select = await app.post('/models/model-battery-bay/select', {})
    assert.equal(select.status, 303)
    let page = await app.page('/')
    assert.match(page.html, /<h1 id="title">Battery bay \/ New experiment<\/h1>/)
    assert.match(page.html, /● Parameters changed/)
    assert.equal(redirectOf(await app.post('/models/nope/select', {})).error, 'There is no such model.')
    assert.equal(redirectOf(await app.post('/models', { name: 'Cold store', kind: 'airflow' })).ok, 'Model “Cold store” created.')
    page = await app.page('/')
    assert.match(page.html, /Cold store<\/b><small>Airflow chamber · 2D/)
    assert.equal(redirectOf(await app.post('/models', { name: '' })).error, 'Give the model a name.')
  }))

test('the thermal field draws the latest run, a picked run, or says why it cannot', () =>
  withApp(async (app) => {
    const latest = await app.page('/field')
    assert.equal(latest.status, 200)
    assert.match(latest.html, /THERMAL FIELD · BASELINE · 18/)
    assert.equal((latest.html.match(/fill="rgb\(/g) ?? []).length, 24 * 12)
    assert.match(latest.html, /T = 21–65 °C · t = 20 min/)
    assert.match((await app.page('/field?run=run-17')).html, /HIGH AIRFLOW · 17/)
    assert.match((await app.page('/field?run=nope')).html, /There is no such run\./)
    await app.post('/models/model-drying-tunnel/select', {})
    assert.match((await app.page('/field')).html, /This model has no run yet/)
  }))

test('response traces overlay a comparison, show the probes, and export CSV', () =>
  withApp(async (app) => {
    const one = await app.page('/traces')
    assert.equal(one.status, 200)
    assert.equal((one.html.match(/class="curve /g) ?? []).length, 1)
    assert.match(one.html, /<b id="probeA">64\.8 °C<\/b>/)
    const two = await app.page('/traces?run=run-18&compare=run-17')
    assert.equal((two.html.match(/class="curve /g) ?? []).length, 2)
    assert.match(two.html, /┅ High airflow · 17/)
    assert.match(two.html, /Probe A · center<\/span><b id="probeA">64\.8 °C · \+\d+\.\d<\/b>/)
    assert.match((await app.page('/traces?run=nope')).html, /There is no such run\./)
    const csv = await app.root.router.request('/traces.csv?run=run-18&compare=run-17')
    assert.equal(csv.status, 200)
    assert.match(csv.headers.get('content-type') ?? '', /text\/csv/)
    assert.match(await csv.text(), /^minute,Baseline · 18,High airflow · 17\n0,21,21\n/)
  }))

test('the archive lists runs and snapshots; snapshots save, load and delete', () =>
  withApp(async (app) => {
    const page = await app.page('/archive')
    assert.equal(page.status, 200)
    assert.match(page.html, /Baseline · 18[\s\S]*High airflow · 17[\s\S]*Low ambient · 16/)
    assert.match(page.html, /Tight insulation/)
    assert.match(page.html, /href="\/traces\?run=run-18&amp;compare=run-17"|href="\/traces\?run=run-18&compare=run-17"/)

    const saved = await app.post('/snapshots', { name: 'Morning check' })
    assert.equal(redirectOf(saved).path, '/archive')
    assert.equal(redirectOf(saved).ok, 'Snapshot “Morning check” saved.')
    assert.equal(redirectOf(await app.post('/snapshots', { name: ' ' })).error, 'Give the snapshot a name.')

    const loaded = await app.post('/snapshots/snapshot-tight-insulation/load', {})
    assert.equal(redirectOf(loaded).path, '/')
    assert.equal(app.root.lab.state.draft.insulation, 92)
    assert.match((await app.page('/')).html, /<output id="insVal" for="ins">0\.92<\/output>/)

    assert.equal(redirectOf(await app.post('/snapshots/snapshot-tight-insulation/delete', {})).ok, 'Snapshot deleted.')
    assert.doesNotMatch((await app.page('/archive')).html, /Tight insulation/)
    assert.equal(redirectOf(await app.post('/snapshots/nope/load', {})).error, 'There is no such snapshot.')
  }))

test('under the frame prefix every page and link carries it', () =>
  withApp(
    async (app) => {
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, new RegExp(`href="${FRAME_MOUNT_PREFIX}/traces"`))
      assert.match(html, new RegExp(`action="${FRAME_MOUNT_PREFIX}/run"`))
      const response = await app.post('/run', baseline)
      assert.equal(redirectOf(response).path, `${FRAME_MOUNT_PREFIX}/`)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  ))

test('the home widget shows the last run', () =>
  withApp(async (app) => {
    const widget = app.root.home.widgets().find((w) => w.id === 'setup')
    assert.ok(widget)
    assert.match(String(await widget.render()), /Chamber 04 \/ Baseline · 18[\s\S]*Peak 64\.8 °C/)
  }))
