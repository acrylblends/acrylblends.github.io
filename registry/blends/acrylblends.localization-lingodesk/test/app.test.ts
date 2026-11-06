import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { redirectOf, withApp } from './support.ts'

const de = { locale: 'de-AT', type: 'ui', filter: 'all' }

test('answers health checks on its own server and under the frame prefix, and 404 for unknown paths', async () => {
  await withApp(async (app) => {
    assert.equal((await app.root.router.request('/health')).status, 200)
    const missing = await app.root.router.request('/nope')
    assert.equal(missing.status, 404)
    await missing.body?.cancel()
  })
  await withApp(
    async (app) => {
      assert.equal(app.root.deskShell.prefix, FRAME_MOUNT_PREFIX)
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, /href="\/app\/\?locale=fr-FR/)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  )
})

test('opens the project over the seed and saves it at once', () =>
  withApp(async (app) => {
    assert.equal(app.store.saved, 1)
    assert.equal(app.root.desk.state.segments.length, 48)
  }))

test('a part leaves with its plugin', async () => {
  await withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /Terminology/)
    assert.match(html, /QA checks/)
    assert.match(html, />Run QA</)
  })
  await withApp(
    async (app) => {
      const { html } = await app.page('/')
      assert.doesNotMatch(html, /QA checks|Run QA/)
      assert.equal((await app.post('/qa', de)).status, 404)
    },
    { off: ['qa'] },
  )
})

test('the shell escapes what people type and shows a notice from the redirect query', () =>
  withApp(async (app) => {
    const url = '/?error=Bad%20%3Cinput%3E'
    assert.match(app.root.deskShell.page({ title: '<x>', main: '', url }), /<title>&lt;x&gt; · LingoDesk<\/title>/)
    assert.match(app.root.deskShell.notice(url), /<p role="alert">Bad &lt;input&gt;<\/p>/)
  }))

test('the manifest decides what is mounted', async () => {
  const { readManifest } = await import('../src/app.ts')
  const library = ['router', 'home', 'lingodesk', 'desk-shell', 'locales', 'editor', 'glossary', 'qa', 'extensions', 'server', 'acryl-door']
  assert.deepEqual(readManifest().plugins.map((r) => r.id).filter((id) => library.includes(id)), library)
  assert.throws(() => readManifest({ nothing: 1 }), /parameter-override-unknown/)
})

test('the editor shows de-AT as the mockup does', () =>
  withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /LOCALIZATION \/ DE-AT|Localization \/ de-AT/)
    assert.match(html, /Last edit by Mira · 4 minutes ago/)
    assert.match(html, /<b>8<\/b> strings/)
    assert.match(html, /id="translated">6</)
    assert.match(html, /id="pending">3</)
    assert.match(html, /DEUTSCH \(AUSTRIA\)/)
    assert.match(html, /data-key="welcome.title"/)
    assert.match(html, /class="segment selected"[^>]*data-state="review" data-key="welcome.title"/)
    assert.match(html, /● Needs review · placeholder preserved/)
    assert.match(html, /✓ Approved/)
    assert.match(html, /○ Untranslated/)
    assert.match(html, /Last synced · 12 minutes ago/)
    assert.match(html, /6 of 8 strings translated/)
    assert.match(html, /Draft changes are stored in this local prototype\./)
    assert.match(html, /data-term="workspace"/)
    assert.match(html, /67% match · same flow/)
    assert.match(html, /data-check="missing">Missing translations <b class="warning">2 warnings<\/b>/)
  }))

test('locales, content types and filters narrow what is shown', () =>
  withApp(async (app) => {
    const fr = (await app.page('/?locale=fr-FR')).html
    assert.match(fr, /FRANÇAIS \(FRANCE\)/)
    assert.match(fr, /Bon retour, \{firstName\}\./)
    assert.match(fr, /● Needs review · placeholder problem/)
    const empty = (await app.page('/?locale=de-AT&filter=empty')).html
    assert.match(empty, /data-key="welcome.continue"/)
    assert.doesNotMatch(empty, /data-key="welcome.title"/)
    const none = (await app.page('/?locale=fr-FR&type=email&filter=empty')).html
    assert.match(none, /No strings are untranslated in this locale\./)
    const help = (await app.page('/?type=help')).html
    assert.match(help, /data-key="help.start"/)
    assert.doesNotMatch(help, /data-key="welcome.title"/)
    assert.match((await app.page('/?locale=zz&type=zz&filter=zz&key=zz')).html, /Onboarding flow/)
  }))

test('saving a draft, approving, reopening, and the refusal on an approved segment', () =>
  withApp(async (app) => {
    const r = redirectOf(await app.post('/segments/welcome.continue', { ...de, target: 'Weiter zu deiner Übersicht' }))
    assert.equal(r.path, '/')
    assert.match(r.ok ?? '', /Draft saved for welcome\.continue/)
    assert.match((await app.page('/?locale=de-AT')).html, /id="translated">7</)
    assert.match(redirectOf(await app.post('/segments/welcome.continue', { ...de, target: 'Weiter zu deiner Übersicht' })).ok ?? '', /No change to welcome\.continue/)
    assert.match(redirectOf(await app.post('/segments/welcome.continue/approve', { ...de, target: 'Weiter zu deiner Übersicht' })).ok ?? '', /Approved welcome\.continue/)
    assert.match(redirectOf(await app.post('/segments/welcome.continue', { ...de, target: 'Anders' })).error ?? '', /is approved\. Reopen it/)
    assert.match(redirectOf(await app.post('/segments/welcome.continue/reopen', de)).ok ?? '', /reopened for editing/)
    assert.match(redirectOf(await app.post('/segments/welcome.skip', { ...de, target: '' })).ok ?? '', /untranslated again/)
    assert.match(redirectOf(await app.post('/segments/welcome.skip/approve', { ...de, target: '' })).error ?? '', /no translation to approve/)
    assert.match(redirectOf(await app.post('/segments/nope', { ...de, target: 'x' })).error ?? '', /no such segment/)
    const back = await app.post('/segments/welcome.title', { ...de, filter: 'review', key: 'welcome.title', target: 'x'.repeat(501) })
    assert.match(back.headers.get('location') ?? '', /filter=review&key=welcome\.title&error=/)
  }))

test('inserting a glossary term or the memory suggestion fills the segment; both refuse an approved one', () =>
  withApp(async (app) => {
    assert.match(redirectOf(await app.post('/segments/welcome.continue/term', { ...de, term: 'term-dashboard' })).ok ?? '', /Term inserted into welcome\.continue/)
    assert.equal(app.root.desk.segment('welcome.continue', 'de-AT').target, 'Übersicht')
    assert.match(redirectOf(await app.post('/segments/welcome.title/suggestion', de)).ok ?? '', /suggestion inserted \(67% match\)/)
    assert.equal(app.root.desk.segment('welcome.title', 'de-AT').target, 'Willkommen zurück, {name}.')
    assert.match((await app.page('/?locale=de-AT&key=welcome.title')).html, /● Needs review · placeholder problem/)
    assert.match(redirectOf(await app.post('/segments/welcome.subtitle/term', { ...de, term: 'term-workspace' })).error ?? '', /is approved/)
    assert.match(redirectOf(await app.post('/segments/welcome.skip/suggestion', de)).error ?? '', /no translation-memory suggestion/)
    const approved = (await app.page('/?locale=de-AT&key=welcome.subtitle')).html
    assert.doesNotMatch(approved, />Insert</)
    assert.match(approved, /reopen it to use a suggestion|No translation-memory match/)
  }))

test('Run QA records the result; the panel flags strings changed since', () =>
  withApp(async (app) => {
    assert.match(redirectOf(await app.post('/qa', de)).ok ?? '', /QA complete for de-AT · 2 issues found/)
    await app.post('/segments/welcome.continue', { ...de, target: 'Weiter' })
    assert.doesNotMatch((await app.page('/')).html, /Strings changed since this run/)
    await app.post('/qa', de)
    const html = (await app.page('/')).html
    assert.match(html, /1 warning/)
    assert.match(html, /setup\.done has no translation\./)
  }))

test('Approve locale is refused while QA has issues, and approves the review strings once it passes', () =>
  withApp(async (app) => {
    assert.match(redirectOf(await app.post('/approve-locale', de)).error ?? '', /QA must pass before Deutsch \(Austria\) can be approved/)
    const fr = { locale: 'fr-FR', type: 'ui', filter: 'all' }
    assert.match(redirectOf(await app.post('/approve-locale', fr)).error ?? '', /QA must pass/)
    await app.post('/segments/setup.invite', { ...fr, target: 'Invitez votre équipe sur {workspaceName}.' })
    assert.match(redirectOf(await app.post('/approve-locale', fr)).ok ?? '', /Français \(France\) approved: 3 strings moved from review to approved/)
    assert.match((await app.page('/?locale=fr-FR&filter=review')).html, /No strings are needs review in this locale|No strings are/)
  }))
