import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { redirectOf, withApp } from './support.ts'

test('answers health checks on its own server and under the frame prefix, and 404 for unknown paths', async () => {
  await withApp(async (app) => {
    const health = await app.root.router.request('/health')
    assert.equal(health.status, 200)
    const missing = await app.root.router.request('/nope')
    assert.equal(missing.status, 404)
    await missing.body?.cancel()
  })
  await withApp(
    async (app) => {
      assert.equal(app.root.builderShell.prefix, FRAME_MOUNT_PREFIX)
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, /href="\/app\/\?page=features"/)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  )
})

test('opens the site over the seed and saves it at once', () =>
  withApp(async (app) => {
    assert.equal(app.store.saved, 1)
    assert.equal(app.root.site.state.pages.length, 3)
  }))

test('a region leaves with its plugin', async () => {
  await withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /Add block/)
    assert.match(html, /Design inspector/)
  })
  await withApp(
    async (app) => {
      const { html } = await app.page('/')
      assert.doesNotMatch(html, /Add block/)
      assert.equal((await app.post('/pages/home/sections', { kind: 'hero' })).status, 404)
    },
    { off: ['blocks'] },
  )
})

test('the shell escapes what people type and shows a notice from the redirect query', () =>
  withApp(async (app) => {
    const url = '/?error=Bad%20%3Cinput%3E'
    assert.match(app.root.builderShell.page({ title: '<x>', main: '', url }), /<title>&lt;x&gt; · Pagefoundry<\/title>/)
    assert.match(app.root.builderShell.notice(url), /<p class="alert error" role="alert">Bad &lt;input&gt;<\/p>/)
  }))

test('the manifest decides what is mounted', async () => {
  const { readManifest } = await import('../src/app.ts')
  const library = ['router', 'home', 'pagefoundry', 'builder-shell', 'pages', 'blocks', 'canvas', 'design', 'publish', 'extensions', 'server', 'acryl-door']
  assert.deepEqual(readManifest().plugins.map((r) => r.id).filter((id) => library.includes(id)), library)
  assert.throws(() => readManifest({ nothing: 1 }), /parameter-override-unknown/)
})

test('the canvas shows the page, selects a section, and folds into preview mode', () =>
  withApp(async (app) => {
    const home = await app.page('/')
    assert.match(home.html, /Make space for/)
    assert.match(home.html, /northstar\.studio/)
    assert.match(home.html, /4 blocks available/)
    assert.match(home.html, /class="sec features[^"]*" href="[^"]*section=features-1/)
    const sel = await app.page('/?page=home&section=features-1')
    assert.match(sel.html, /sec features[^"]* selected/)
    assert.match(sel.html, /Features section/)
    const other = await app.page('/?page=pricing')
    assert.match(other.html, /Simple plans/)
    await app.post('/preview', { on: 'on', device: 'mobile' })
    const prev = await app.page('/')
    assert.doesNotMatch(prev.html, /Add block|Design inspector/)
    assert.match(prev.html, /stage mobile/)
    await app.post('/preview', { on: 'off' })
    assert.match((await app.page('/')).html, /Add block/)
  }))

test('pages: create, refuse a duplicate, delete', () =>
  withApp(async (app) => {
    const made = redirectOf(await app.post('/pages', { name: 'About' }))
    assert.equal(made.path, '/')
    assert.match(made.ok ?? '', /Page About created/)
    assert.match((await app.page('/?page=about')).html, /data-page="about"/)
    assert.match(redirectOf(await app.post('/pages', { name: 'About' })).error ?? '', /already a page/)
    assert.match(redirectOf(await app.post('/pages', { name: '' })).error ?? '', /Give the page a name/)
    assert.match(redirectOf(await app.post('/pages/about/delete', {})).ok ?? '', /deleted/)
    assert.match(redirectOf(await app.post('/pages/home/delete', {})).error ?? '', /home page/)
  }))

test('blocks and the inspector: add, edit, move, delete, with refusals', () =>
  withApp(async (app) => {
    const added = redirectOf(await app.post('/pages/home/sections', { kind: 'quote' }))
    assert.match(added.ok ?? '', /Added Quote/)
    assert.match(redirectOf(await app.post('/pages/home/sections', { kind: 'nope' })).error ?? '', /Pick a block/)
    const id = app.root.site.page('home').sections.at(-1)?.id ?? ''
    const saved = redirectOf(await app.post(`/pages/home/sections/${id}`, { headline: 'Hello', body: 'b', bg: '#112233', width: 'wide', visibility: 'visible' }))
    assert.match(saved.ok ?? '', /saved/)
    assert.match((await app.page(`/?page=home&section=${id}`)).html, /Hello/)
    assert.match(redirectOf(await app.post(`/pages/home/sections/${id}`, { headline: '' })).error ?? '', /headline/)
    assert.match(redirectOf(await app.post(`/pages/home/sections/${id}/move`, { direction: 'up' })).ok ?? '', /moved/)
    assert.match(redirectOf(await app.post(`/pages/home/sections/hero-1/move`, { direction: 'up' })).error ?? '', /already first/)
    assert.match(redirectOf(await app.post(`/pages/home/sections/${id}/delete`, {})).ok ?? '', /deleted/)
    assert.match(redirectOf(await app.post(`/pages/home/sections/${id}/delete`, {})).error ?? '', /no such section/)
  }))

test('theme and publish: validated, recorded with warnings, listed in the panel', () =>
  withApp(async (app) => {
    assert.match(redirectOf(await app.post('/theme', { accent: 'x', font: 'serif' })).error ?? '', /colour/)
    assert.match(redirectOf(await app.post('/theme', { accent: '#112233', font: 'sans' })).ok ?? '', /Theme saved/)
    const ok = redirectOf(await app.post('/publish', {}))
    assert.match(ok.ok ?? '', /version 1\.0/)
    const html = (await app.page('/')).html
    assert.match(html, /data-build="1\.0"/)
    assert.match(html, /Published v1\.0/)
    await app.post('/pages/home/sections/hero-1', { headline: 'x', bg: '#808080' })
    assert.match(redirectOf(await app.post('/publish', {})).error ?? '', /1 warning/)
  }))

test('a redirect target that is not a path of this app is ignored', () =>
  withApp(async (app) => {
    const r = await app.post('/theme', { accent: '#112233', font: 'sans', back: 'https://evil.example/x' })
    assert.equal(new URL(r.headers.get('location') ?? '', 'http://local').hostname, 'local')
  }))
