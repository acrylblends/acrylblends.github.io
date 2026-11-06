import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { redirectOf, withApp } from './support.ts'

const names = (html: string) => [...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1])

test('the atlas shows the cards, the filters and the first package as the mockup does', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/')
    assert.equal(status, 200)
    assert.match(html, /<h1>Libraries &amp; frameworks<\/h1>/)
    assert.match(html, /Featured building blocks <span class="muted" id="count">35 results<\/span>/)
    assert.deepEqual(names(html).slice(0, 8), ['React', 'Hono', 'Drizzle ORM', 'Zod', 'TanStack Query', 'Vitest', 'Three.js', 'LangChain'])
    assert.match(html, /<a class="pkg active" href="\/\?package=react" aria-current="true" data-package="react"><div class="pkghead"><div class="icon" aria-hidden="true">R<\/div><span class="version">v19\.1\.0<\/span><\/div><h3>React<\/h3><p>Declarative UI library for component-driven interfaces\.<\/p><div class="chips"><span class="chip">UI<\/span><span class="chip">TypeScript<\/span><\/div>/)
    assert.match(html, /<b>Type<\/b><a class="filter" href="\/\?group=UI\+libraries" data-filter="group:UI libraries">UI libraries <span>4<\/span><\/a>/)
    assert.match(html, /<b>Language<\/b>[\s\S]*TypeScript <span>20<\/span>[\s\S]*Rust <span>6<\/span>[\s\S]*Python <span>9<\/span>/)
    assert.match(html, /<h2 id="dname">React<\/h2><div class="meta" id="dtype">UI library · v19\.1\.0<\/div>/)
    assert.match(html, /<span id="install">npm install react react-dom<\/span>/)
    assert.match(html, /<div><span>19\.1\.0<\/span><span class="meta">Latest<\/span><\/div><div><span>19\.0\.0<\/span><span class="meta">Stable<\/span><\/div><div><span>18\.3\.1<\/span><span class="meta">LTS compatible<\/span><\/div>/)
    assert.match(html, /Illustrative catalogue metadata only/)
    assert.match(html, /id="compare" type="submit">＋ Add to stack comparison/)
    assert.match(html, /data-nav="stack">Stack \(0\)<\/a>/)
  }))

test('search and filters narrow the cards, keep each other, and say when nothing matches', () =>
  withApp(async (app) => {
    const q = (await app.page('/?q=validation')).html
    assert.deepEqual(names(q), ['Zod'])
    assert.match(q, /<span class="muted" id="count">1 result<\/span>/)
    assert.match(q, /<h2 id="dname">Zod<\/h2>/)
    assert.match(q, /value="validation"/)
    assert.match(q, /id="clear" href="\/"/)
    const f = (await app.page('/?group=Crypto&language=Python')).html
    assert.deepEqual(names(f), ['cryptography'])
    assert.match(f, /class="filter on"[^>]*data-filter="group:Crypto"/)
    assert.deepEqual(names((await app.page('/?framework=Desktop')).html), ['Electron', 'Tauri'])
    assert.match((await app.page('/?q=zzz')).html, /<b>No packages match\.<\/b>/)
    assert.match((await app.page('/?q=zzz')).html, /Pick a package to see its detail/)
  }))

test('choosing a package loads its detail, keeping the filters', () =>
  withApp(async (app) => {
    const html = (await app.page('/?language=Rust&package=tauri')).html
    assert.match(html, /<h2 id="dname">Tauri<\/h2><div class="meta" id="dtype">Desktop framework · v2\.6\.2<\/div>/)
    assert.match(html, /<span id="install">cargo add tauri<\/span>/)
    assert.match(html, /Rust · runs on Windows, macOS, Linux/)
    assert.match(html, /<a class="pkg active" href="\/\?language=Rust&package=tauri"/)
    assert.match((await app.page('/?package=vitest')).html, /<span id="install">npm install -D vitest<\/span>/)
    assert.match((await app.page('/?package=react-native')).html, /needs React 19\+/)
  }))

test('Add to stack comparison adds the chosen version, marks the card and counts it in the header', () =>
  withApp(async (app) => {
    const response = await app.post('/stack', { package: 'react', version: '18.3.1', back: '/?package=react' })
    assert.equal(response.status, 303)
    assert.deepEqual(redirectOf(response), { path: '/', ok: 'React 18.3.1 added to the local stack comparison.' })
    const html = (await app.page('/?package=react')).html
    assert.match(html, /<span class="chip in">In stack<\/span>/)
    assert.match(html, /In your stack at 18\.3\.1\. <a href="\/stack">Open the stack<\/a>/)
    assert.doesNotMatch(html, /id="compare"/)
    assert.match(html, /Stack \(1\)/)
    assert.equal(redirectOf(await app.post('/stack', { package: 'react' })).error, 'React is already in the stack.')
    assert.equal(redirectOf(await app.post('/stack', { package: 'zod', version: '0.0.1' })).error, 'Zod has no version 0.0.1 in this catalogue.')
    assert.equal(redirectOf(await app.post('/stack', { package: 'nope' })).error, 'There is no such package.')
  }))

test('the stack page compares pinned versions with the newest, warns about peers and previews the manifest', () =>
  withApp(async (app) => {
    assert.match((await app.page('/stack')).html, /<b>The stack is empty\.<\/b>/)
    await app.post('/stack', { package: 'tanstack-query' })
    await app.post('/stack', { package: 'react', version: '18.3.1' })
    await app.post('/stack', { package: 'vitest' })
    const html = (await app.page('/stack')).html
    assert.match(html, /Stack comparison <span class="muted" id="count">3 packages<\/span>/)
    assert.match(html, /<tr data-stack="react"><td><a href="\/\?package=react"><b>React<\/b><\/a><br><small class="muted">UI library<\/small><\/td>/)
    assert.match(html, /<option value="18\.3\.1" selected>18\.3\.1 · LTS compatible<\/option>/)
    assert.match(html, /<td>19\.1\.0<\/td><td>2 behind<\/td>/)
    assert.match(html, /<td>5\.83\.0<\/td><td>Latest<\/td>/)
    assert.doesNotMatch(html, /data-warning/)
    assert.match(html, /\$ npm install @tanstack\/react-query react react-dom/)
    assert.match(html, /\$ npm install -D vitest/)
    assert.match(html, /&quot;react-dom&quot;: &quot;\^18\.3\.1&quot;/)
    assert.match(html, /&quot;vitest&quot;: &quot;\^3\.2\.4&quot;/)
    await app.post('/stack', { package: 'pandas' })
    assert.match((await app.page('/stack')).html, /data-warning="pandas">Pandas|pandas needs NumPy 2 or newer; add NumPy to the stack\./i)
  }))

test('a stack entry is re-pinned, removed, and the stack cleared; refusals say why', () =>
  withApp(async (app) => {
    await app.post('/stack', { package: 'react' })
    assert.equal(redirectOf(await app.post('/stack/react/pin', { version: '19.0.0', back: '/stack' })).ok, 'React pinned to 19.0.0.')
    assert.match((await app.page('/stack')).html, /<td>19\.1\.0<\/td><td>1 behind<\/td>/)
    assert.equal(redirectOf(await app.post('/stack/react/pin', { version: '1.0.0' })).error, 'React has no version 1.0.0 in this catalogue.')
    assert.equal(redirectOf(await app.post('/stack/hono/pin', { version: '4.8.3' })).error, 'Hono is not in the stack.')
    assert.equal(redirectOf(await app.post('/stack/react/remove', {})).ok, 'React removed from the stack.')
    assert.equal(redirectOf(await app.post('/stack/react/remove', {})).error, 'React is not in the stack.')
    await app.post('/stack', { package: 'zod' })
    assert.equal(redirectOf(await app.post('/stack/clear', {})).ok, 'The stack is empty.')
    assert.equal(redirectOf(await app.post('/stack/clear', {})).error, 'The stack is already empty.')
  }))

test('a back address that leaves the app is ignored', () =>
  withApp(async (app) => {
    for (const back of ['https://evil.example/', '//evil.example', '/\\evil']) {
      const response = await app.post('/stack/clear', { back })
      assert.equal(redirectOf(response).path, '/stack', back)
    }
  }))

test('under the frame prefix every page and link carries it', () =>
  withApp(
    async (app) => {
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, new RegExp(`href="${FRAME_MOUNT_PREFIX}/\\?package=hono"`))
      assert.match(html, new RegExp(`action="${FRAME_MOUNT_PREFIX}/stack"`))
      assert.equal(redirectOf(await app.post('/stack', { package: 'react' })).path, `${FRAME_MOUNT_PREFIX}/`)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  ))

test('the home widget shows the package and stack counts', () =>
  withApp(async (app) => {
    const widget = app.root.home.widgets().find((w) => w.id === 'catalogue')
    assert.ok(widget)
    assert.match(String(await widget.render()), /<b>35<\/b> packages · <b>0<\/b> in your stack/)
  }))
