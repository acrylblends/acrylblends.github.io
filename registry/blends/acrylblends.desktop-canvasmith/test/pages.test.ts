import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { redirectOf, withApp } from './support.ts'

test('the window shows the chrome, the project, the artboard, the inspector and the status bar as the mockup does', () =>
  withApp(async (app) => {
    const { status, html } = await app.page('/')
    assert.equal(status, 200)
    assert.match(html, /<div class="title">Canvasmith — Spring Campaign<\/div>/)
    assert.match(html, /<b>Canvasmith<\/b><span>File<\/span><span>Edit<\/span>/)
    assert.match(html, /aria-label="Select tool"/)
    assert.match(html, /<div class="file">Spring Campaign \/ <span>hero-poster\.canvas<\/span><\/div>/)
    assert.match(html, /<span id="zoom">100%<\/span>/)
    assert.match(html, /id="export" type="submit">Export preview<\/button>/)
    assert.match(html, /<div class="projectname">▣ Spring Campaign<\/div>/)
    assert.match(html, /<li class="sel" data-file="Hero poster"><a href="\/\?file=hero-poster" aria-current="true">/)
    assert.match(html, /data-file="Social card"[\s\S]*data-file="Brand marks"[\s\S]*data-file="Typography"/)
    const layers = [...html.matchAll(/<li class="[^"]*" data-layer="([^"]+)"/g)].map((m) => m[1])
    assert.deepEqual(layers, ['Artboard', 'Headline', 'Hero image', 'CTA button', 'Eyebrow', 'Body copy'])
    assert.match(html, /Page 01 · Hero poster<\/span><span>1440 × 980 px<\/span>/)
    assert.match(html, /aspect-ratio:1440\/980;[^"]*background:#e8dfd3/)
    assert.match(html, /<div class="l text" data-layer-id="headline"[^>]*>A quieter\nkind of bold\.<\/div>/)
    assert.match(html, /Explore collection ↗<\/div>/)
    assert.match(html, /form \/ 01<\/div>/)
    assert.match(html, /<b id="selname" style="font-size:12px">Artboard<\/b>/)
    assert.match(html, /name="w" value="1440"[^>]*><input name="h" value="980"|name="h" value="980"/)
    assert.match(html, /<input id="fill" name="fill" type="color" value="#e8dfd3"/)
    assert.match(html, /<span id="status">Ready · All changes saved<\/span><span>1 page · 5 layers · RGB<\/span>/)
  }))

test('selecting a layer shows its properties and outlines it on the canvas', () =>
  withApp(async (app) => {
    const html = (await app.page('/?file=hero-poster&layer=headline')).html
    assert.match(html, /<b id="selname"[^>]*>Headline<\/b>/)
    assert.match(html, /<li class="sel" data-layer="Headline"/)
    assert.match(html, /class="l text sel" data-layer-id="headline"/)
    assert.match(html, /name="x" value="90"/)
    assert.match(html, /<textarea id="text" name="text" rows="3" maxlength="300">A quieter\nkind of bold\.<\/textarea>/)
    assert.match(html, /Bring forward<\/button>[\s\S]*Send backward<\/button>[\s\S]*Delete layer<\/button>/)
    const art = (await app.page('/?layer=artboard')).html
    assert.doesNotMatch(art, /Delete layer/)
    assert.match(art, /name="x" value="0" aria-label="X position" readonly/)
  }))

test('opening another file changes the canvas, the layers and the status bar', () =>
  withApp(async (app) => {
    const html = (await app.page('/?file=social-card')).html
    assert.match(html, /Page 01 · Social card<\/span><span>1080 × 1080 px<\/span>/)
    assert.match(html, /Small rituals\.\nBig feeling\./)
    assert.match(html, /<span>1 page · 3 layers · RGB<\/span>/)
    assert.match(html, /<div class="file">Spring Campaign \/ <span>social-card\.canvas<\/span>/)
    assert.match((await app.page('/?file=nope')).html, /Page 01 · Hero poster/)
  }))

test('Apply saves the properties, redraws the canvas and logs the edit; a bad value is refused with the reason', () =>
  withApp(async (app) => {
    const ok = await app.post('/layers/headline', { file: 'hero-poster', back: '/?file=hero-poster&layer=headline', name: 'Headline', x: '120', y: '150', w: '740', h: '330', opacity: '60', fill: '#112233', radius: '0', text: 'New line', visible: 'on' })
    assert.deepEqual(redirectOf(ok), { path: '/', ok: 'Headline updated.' })
    const html = (await app.page('/?layer=headline')).html
    assert.match(html, /name="x" value="120"/)
    assert.match(html, /opacity:0\.6;[^"]*color:#112233/)
    assert.match(html, />New line<\/div>/)
    assert.match(html, /<ul class="log" id="activity"><li>Headline edited<\/li>/)
    assert.match(html, /<span id="status">Headline edited · All changes saved<\/span>/)
    const bad = await app.post('/layers/headline', { file: 'hero-poster', back: '/?layer=headline', x: 'left', w: '740', h: '330', opacity: '60', fill: '#112233', radius: '0' })
    assert.equal(redirectOf(bad).error, 'X must be a whole number from -5000 to 5000.')
    assert.equal(redirectOf(await app.post('/layers/headline', { file: 'hero-poster', x: '1', y: '1', w: '1', h: '1', opacity: '1', radius: '0', fill: 'blue' })).error, 'Fill is a colour like #e8dfd3.')
    assert.equal(redirectOf(await app.post('/layers/nope', { file: 'hero-poster' })).error, 'There is no such layer.')
  }))

test('hiding a layer removes it from the canvas and dims it in the list; Visible in the inspector does the same', () =>
  withApp(async (app) => {
    const hide = await app.post('/layers/hero-image/visible', { file: 'hero-poster', visible: 'off' })
    assert.equal(redirectOf(hide).ok, 'Hero image is hidden.')
    let html = (await app.page('/')).html
    assert.doesNotMatch(html, /data-layer-id="hero-image"/)
    assert.match(html, /<li class=" hidden" data-layer="Hero image"/)
    assert.match(html, /aria-label="Show Hero image">○<\/button>/)
    await app.post('/layers/hero-image/visible', { file: 'hero-poster', visible: 'on' })
    html = (await app.page('/')).html
    assert.match(html, /data-layer-id="hero-image"/)
  }))

test('the toolbar: zoom changes the artboard, the layer list toggles, tools add layers', () =>
  withApp(async (app) => {
    assert.equal((await app.post('/zoom/in', { back: '/' })).status, 303)
    let html = (await app.page('/')).html
    assert.match(html, /<span id="zoom">110%<\/span>/)
    assert.match(html, /transform:scale\(1\.1\)/)
    await app.post('/zoom/reset', {})
    assert.equal(redirectOf(await app.post('/zoom/reset', {})).error, 'Zoom is already 100%.')
    await app.post('/view/layers', {})
    html = (await app.page('/')).html
    assert.doesNotMatch(html, /id="layers"/)
    assert.match(html, /aria-label="Toggle the layer list"/)
    await app.post('/view/layers', {})
    const added = await app.post('/tools/text', { back: '/?file=social-card' })
    assert.equal(redirectOf(added).ok, 'Text 2 added.')
    html = (await app.page(added.headers.get('location') ?? '/')).html
    assert.match(html, /<li class="sel" data-layer="Text 2"/)
    assert.match(html, /class="tool active" type="submit" aria-label="Text tool"/)
    assert.equal(redirectOf(await app.post('/tools/lasso', {})).error, 'There is no such tool.')
    assert.equal((await app.post('/tools/select', { back: '/' })).status, 303)
  }))

test('arranging and deleting a layer', () =>
  withApp(async (app) => {
    const moved = await app.post('/layers/headline/arrange', { file: 'hero-poster', direction: 'forward' })
    assert.equal(redirectOf(moved).ok, 'Layer moved forward.')
    const names = [...(await app.page('/')).html.matchAll(/<li class="[^"]*" data-layer="([^"]+)"/g)].map((m) => m[1])
    assert.deepEqual(names.slice(0, 3), ['Artboard', 'Hero image', 'Headline'])
    assert.equal(redirectOf(await app.post('/layers/artboard/arrange', { file: 'hero-poster', direction: 'forward' })).error, 'The artboard stays at the back.')
    assert.equal(redirectOf(await app.post('/layers/cta/delete', { file: 'hero-poster' })).ok, 'Layer deleted.')
    assert.match((await app.page('/')).html, /1 page · 4 layers · RGB/)
    assert.equal(redirectOf(await app.post('/layers/artboard/delete', { file: 'hero-poster' })).error, 'The artboard cannot be deleted.')
  }))

test('+ New creates an empty artboard and opens it; Export preview records a simulated export and the activity', () =>
  withApp(async (app) => {
    const made = await app.post('/files', {})
    assert.equal(redirectOf(made).ok, 'New artboard created (demo): Untitled 1.')
    const doc = (await app.page(made.headers.get('location') ?? '/')).html
    assert.match(doc, /Page 01 · Untitled 1<\/span><span>1200 × 800 px<\/span>/)
    assert.match(doc, /1 page · 0 layers · RGB/)
    assert.match(redirectOf(await app.post('/export', { file: 'untitled-1', format: 'PNG', scale: '1' })).error ?? '', /nothing visible to export/)
    const ok = await app.post('/export', { file: 'hero-poster', format: 'PNG', scale: '1', back: '/' })
    assert.match(redirectOf(ok).ok ?? '', /^Preview export prepared · hero-poster\.png \(1440 × 980, about \d+ KB\) · simulated\.$/)
    const html = (await app.page('/')).html
    assert.match(html, /<ul class="log" id="exports" style="margin-top:8px"><li data-export="export-\d+">hero-poster\.png · 1440 × 980 · \d+ KB<\/li>/)
    assert.match(html, /<li>Preview export prepared · hero-poster\.png · simulated<\/li>/)
    assert.match(html, /Preview export prepared · hero-poster\.png · simulated · All changes saved/)
    assert.equal(redirectOf(await app.post('/export', { file: 'hero-poster', format: 'TIFF', scale: '1' })).error, 'Pick PNG, JPG, SVG.')
  }))

test('a back address that leaves the app is ignored', () =>
  withApp(async (app) => {
    for (const back of ['https://evil.example/', '//evil.example', '/\\evil']) {
      const response = await app.post('/zoom/in', { back })
      assert.equal(redirectOf(response).path, '/', back)
      await app.post('/zoom/out', {})
    }
  }))

test('under the frame prefix every page and link carries it', () =>
  withApp(
    async (app) => {
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, new RegExp(`href="${FRAME_MOUNT_PREFIX}/\\?file=social-card"`))
      assert.match(html, new RegExp(`action="${FRAME_MOUNT_PREFIX}/zoom/in"`))
      assert.equal(redirectOf(await app.post('/layers/headline/visible', { file: 'hero-poster', visible: 'off' })).path, `${FRAME_MOUNT_PREFIX}/`)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  ))

test('the home widget shows the project summary', () =>
  withApp(async (app) => {
    const widget = app.root.home.widgets().find((w) => w.id === 'canvas')
    assert.ok(widget)
    assert.match(String(await widget.render()), /<b>Spring Campaign<\/b> · 4 files · 0 exports/)
  }))
