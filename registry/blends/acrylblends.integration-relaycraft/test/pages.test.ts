import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { redirectOf, withApp } from './support.ts'

test('the studio shows the pipeline, mappings, connectors and the latest run as the mockup does', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/')
    assert.equal(status, 200)
    assert.match(html, /Workspace \/ Northstar/)
    assert.match(html, /Pipelines \/ <b>Customer sync<\/b><\/div><h1>Customer sync<\/h1>/)
    assert.match(html, /3 of 10 active flows/)
    assert.match(html, /<span class="pill">● Draft v4<\/span>/)
    assert.match(html, /<strong>HubSpot CRM<\/strong><small>Source · 248 records<\/small>/)
    assert.match(html, /<strong>Normalize fields<\/strong><small>Transform · 3 rules<\/small>/)
    assert.match(html, /<strong>PostgreSQL<\/strong><small>Destination · customers<\/small>/)
    assert.match(html, /Last edited by Alex · 8 min ago/)
    assert.match(html, /3 steps · 1\.2 MB estimated/)
    assert.match(html, /<td>first_name<\/td><td>Trim whitespace<\/td><td>given_name<\/td><td><span class="pill">Mapped<\/span><\/td>/)
    assert.match(html, /<td>email<\/td><td>Lowercase<\/td><td>email_address<\/td>/)
    assert.match(html, /<td>company<\/td><td>—<\/td><td>organization<\/td><td><span class="pill review">Review<\/span><\/td>/)
    assert.match(html, /<div class="logo">H<\/div><div><b>HubSpot CRM<\/b><small>Source connector<\/small><\/div><span class="status">Connected<\/span>/)
    assert.match(html, /<b>Stripe<\/b><small>Available connector<\/small><\/div><form method="post" action="\/connections\/stripe\/connect">/)
    assert.match(html, /<h2>Latest run<\/h2><span class="pill warn">Warnings<\/span>/)
    assert.match(html, /<b id="processed">244 \/ 248<\/b>/)
    assert.match(html, /<span class="ok">✓<\/span> 248 records fetched/)
    assert.match(html, /<span class="warn">!<\/span> 4 records need review/)
    assert.match(html, /<b id="duration">3\.2 sec<\/b>/)
    assert.match(html, /id="save" type="submit">Save draft/)
    assert.match(html, /id="run" type="submit">▶ Run pipeline/)
    assert.match(html, /<a href="\/\?pipeline=customer-sync" class="active" aria-current="page">◈ Pipelines<\/a><a href="\/connections">▦ Connections<\/a><a href="\/runs">⌁ Run history<\/a>/)
  }))

test('the sample preview shows destination values and the unmapped source fields', () =>
  withApp(async (app) => {
    const html = (await app.page('/')).html
    assert.match(html, /Unmapped source fields: <b>phone_number, country<\/b>/)
    assert.match(html, /<td>Ada<\/td><td>Reyes<\/td><td>ada\.reyes@northwind\.example<\/td><td>Northwind<\/td>/)
    assert.match((await app.page('/?pipeline=lead-intake')).html, /Map a field to see a preview\./)
  }))

test('other pipelines show their own canvas; a pipeline with no mappings says so', () =>
  withApp(async (app) => {
    const html = (await app.page('/?pipeline=lead-intake')).html
    assert.match(html, /<h1>Lead intake<\/h1>/)
    assert.match(html, /<strong>CSV upload<\/strong><small>Source · 60 records<\/small>/)
    assert.match(html, /Transform · 0 rules/)
    assert.match(html, /<b>No mappings yet\.<\/b>/)
    assert.match(html, /PostgreSQL requires given_name, family_name, email_address; not mapped yet\./)
    assert.match(html, /class="chip on" href="\/\?pipeline=lead-intake"/)
  }))

test('Add mapping, Remove and Suggest change the draft and mark it unsaved; Save draft bumps the version', () =>
  withApp(async (app) => {
    const added = await app.post('/pipelines/customer-sync/mappings', { source: 'phone_number', transform: 'e164', destination: 'phone' })
    assert.deepEqual(redirectOf(added), { path: '/', ok: 'Mapping added.' })
    let html = (await app.page('/')).html
    assert.match(html, /<span class="pill review">● Draft v4 · unsaved<\/span>/)
    assert.match(html, /<td>phone_number<\/td><td>Format E\.164<\/td><td>phone<\/td>/)
    assert.match(html, /Transform · 4 rules/)
    assert.match(html, /Last edited by You · just now/)
    assert.equal(redirectOf(await app.post('/pipelines/customer-sync/save', {})).ok, 'Draft saved as v5.')
    assert.match((await app.page('/')).html, /<span class="pill">● Draft v5<\/span>/)
    assert.equal(redirectOf(await app.post('/pipelines/customer-sync/save', {})).error, 'Customer sync has no unsaved changes.')
    assert.equal(redirectOf(await app.post('/pipelines/customer-sync/mappings/remove', { destination: 'phone' })).ok, 'Mapping removed.')
    assert.equal(redirectOf(await app.post('/pipelines/lead-intake/suggest', {})).ok, 'Suggested mappings added; the pipeline has 3.')
    html = (await app.page('/?pipeline=lead-intake')).html
    assert.match(html, /<td>mail<\/td><td>Lowercase<\/td><td>email_address<\/td>/)
    assert.equal(redirectOf(await app.post('/pipelines/lead-intake/suggest', {})).error, 'There is nothing new to suggest.')
  }))

test('a bad mapping is refused with the reason and the form stays open', () =>
  withApp(async (app) => {
    const bad = await app.post('/pipelines/customer-sync/mappings', { source: 'first_name', transform: 'lowercase', destination: 'phone' })
    assert.match(redirectOf(bad).error ?? '', /does not apply to phone \(phone\)/)
    assert.match(bad.headers.get('location') ?? '', /add=1&error=.*#add$/)
    assert.equal(redirectOf(await app.post('/pipelines/customer-sync/mappings', { source: 'company', transform: 'none', destination: 'organization' })).error, 'organization is already mapped.')
    assert.match((await app.page('/?pipeline=customer-sync&add=1')).html, /<form class="form" id="add" method="post" action="\/pipelines\/customer-sync\/mappings">/)
    assert.match((await app.page('/')).html, /<form class="form" id="add"[^>]* hidden>/)
  }))

test('Run pipeline runs the sample rows and shows the counts; a missing required field blocks it', () =>
  withApp(async (app) => {
    const run = await app.post('/pipelines/customer-sync/run', {})
    assert.deepEqual(redirectOf(run), { path: '/', ok: 'Run completed: 244 of 248 rows synced, 4 skipped.' })
    assert.equal(app.root.studio.runs().length, 2)
    await app.post('/pipelines/customer-sync/mappings/remove', { destination: 'email_address' })
    assert.equal(redirectOf(await app.post('/pipelines/customer-sync/run', {})).error, 'PostgreSQL requires email_address; map it before running.')
    assert.equal(redirectOf(await app.post('/pipelines/lead-intake/run', {})).error, 'Lead intake has no field mappings yet.')
    assert.equal(redirectOf(await app.post('/pipelines/nope/run', {})).error, 'There is no such pipeline.')
  }))

test('a failing transform makes a failed run, shown in red with the rows', () =>
  withApp(async (app) => {
    await app.post('/pipelines/customer-sync/mappings', { source: 'phone_number', transform: 'e164', destination: 'phone' })
    const run = await app.post('/pipelines/customer-sync/run', {})
    assert.match(redirectOf(run).error ?? '', /rows synced, 4 skipped, 22 failed/)
    assert.match((await app.page('/')).html, /<h2>Latest run<\/h2><span class="pill bad">Failed<\/span>/)
    const history = (await app.page('/runs')).html
    assert.match(history, /<span class="pill bad">failed<\/span> row 11 · phone: “12” cannot be formatted as E\.164/)
    assert.match(history, /… and \d+ more/)
  }))

test('the run history lists every run with counts, and the rows that were skipped', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/runs')
    assert.equal(status, 200)
    assert.match(html, /<h2>Customer sync<\/h2><div class="sub">[\d:]+ · 248 fetched · 244 synced · 4 skipped · 0 failed · 3\.2 sec<\/div>/)
    assert.match(html, /<span class="pill warn">skipped<\/span> row 17 · email_address: “[^”]+” is not a valid e-mail address/)
    assert.match(html, /Back to Customer sync/)
  }))

test('connections: the page lists credential references; Connect and Disconnect follow the rules', () =>
  withApp(async (app) => {
    const html = (await app.page('/connections')).html
    assert.match(html, /<code>vault:\/\/demo\/hubspot<\/code>/)
    assert.match(html, /<span class="pill warn">Not connected<\/span>/)
    assert.deepEqual(redirectOf(await app.post('/connections/stripe/connect', { back: '/connections' })), { path: '/connections', ok: 'Stripe connected.' })
    assert.equal(redirectOf(await app.post('/connections/stripe/connect', {})).error, 'Stripe is already connected.')
    assert.equal(redirectOf(await app.post('/connections/hubspot/disconnect', { back: '/connections' })).error, 'HubSpot CRM is used by a pipeline; change the pipeline first.')
    assert.equal(redirectOf(await app.post('/connections/nope/connect', {})).error, 'There is no such connector.')
    const run = await app.post('/pipelines/invoice-export/ends', { sourceId: 'stripe', destinationId: 'postgres' })
    assert.match(redirectOf(run).ok ?? '', /Connectors changed; \d+ mappings suggested\./)
  }))

test('a new pipeline is created from two connected connectors, or refused with the reason', () =>
  withApp(async (app) => {
    const made = await app.post('/pipelines', { name: 'Billing export', sourceId: 'csv', destinationId: 'postgres' })
    assert.equal(redirectOf(made).ok, 'Pipeline Billing export created. Suggest or add mappings next.')
    assert.match((await app.page('/')).html, /4 of 10 active flows/)
    assert.match(redirectOf(await app.post('/pipelines', { name: 'X', sourceId: 'stripe', destinationId: 'postgres' })).error ?? '', /Stripe is not connected/)
    assert.match((await app.page('/?new=1')).html, /<form class="panel form" id="new" method="post" action="\/pipelines">/)
  }))

test('under the frame prefix every page and link carries it', () =>
  withApp(
    async (app) => {
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, new RegExp(`href="${FRAME_MOUNT_PREFIX}/runs"`))
      assert.match(html, new RegExp(`action="${FRAME_MOUNT_PREFIX}/pipelines/customer-sync/run"`))
      assert.equal(redirectOf(await app.post('/pipelines/customer-sync/save', {})).path, `${FRAME_MOUNT_PREFIX}/`)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  ))

test('the home widget shows the flow and run counts', () =>
  withApp(async (app) => {
    const widget = app.root.home.widgets().find((w) => w.id === 'pipelines')
    assert.ok(widget)
    assert.match(String(await widget.render()), /<b>3<\/b> of 10 flows · <b>1<\/b> runs/)
  }))
