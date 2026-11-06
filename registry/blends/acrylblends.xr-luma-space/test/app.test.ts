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
      assert.equal(app.root.lumaShell.prefix, FRAME_MOUNT_PREFIX)
      const { status, html } = await app.page('/')
      assert.equal(status, 200)
      assert.match(html, /href="\/app\/\?object=marker"/)
    },
    { prefix: FRAME_MOUNT_PREFIX },
  )
})

test('opens the scene over the seed and saves it at once', () =>
  withApp(async (app) => {
    assert.equal(app.store.saved, 1)
    assert.equal(app.root.scene.state.objects.length, 4)
  }))

test('a part leaves with its plugin', async () => {
  await withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /Scene validation/)
    assert.match(html, /Object inspector/)
  })
  await withApp(
    async (app) => {
      const { html } = await app.page('/')
      assert.doesNotMatch(html, /Scene validation/)
    },
    { off: ['validation'] },
  )
  await withApp(
    async (app) => {
      assert.doesNotMatch((await app.page('/')).html, /Add spatial anchor/)
      assert.equal((await app.post('/objects', {})).status, 404)
    },
    { off: ['objects'] },
  )
})

test('the shell escapes what people type and shows a notice from the redirect query', () =>
  withApp(async (app) => {
    const url = '/?error=Bad%20%3Cinput%3E'
    assert.match(app.root.lumaShell.page({ title: '<x>', main: '', url }), /<title>&lt;x&gt; · Luma Space<\/title>/)
    assert.match(app.root.lumaShell.notice(url), /<p class="toast show error" role="alert">Bad &lt;input&gt;<\/p>/)
  }))

test('the manifest decides what is mounted', async () => {
  const { readManifest } = await import('../src/app.ts')
  const library = ['router', 'home', 'luma', 'luma-shell', 'objects', 'viewport', 'inspector', 'validation', 'extensions', 'server', 'acryl-door']
  assert.deepEqual(readManifest().plugins.map((r) => r.id).filter((id) => library.includes(id)), library)
  assert.throws(() => readManifest({ nothing: 1 }), /parameter-override-unknown/)
})

test('the viewport shows the scene as the mockup does', () =>
  withApp(async (app) => {
    const { html } = await app.page('/')
    assert.match(html, /North wing experience/)
    assert.match(html, /Gallery \/ North wing/)
    assert.match(html, /Updated 4 minutes ago/)
    assert.match(html, /4 objects · no conflicts/)
    assert.match(html, /AR SIMULATION · WORLD SCALE 1\.0×/)
    assert.match(html, /Spatial portal · 0\.0, 1\.2, -0\.8 m/)
    assert.match(html, /class="obj portal sel"/)
    assert.match(html, /aria-pressed="true">AR</)
    const marker = (await app.page('/?object=marker')).html
    assert.match(marker, /<h3 id="objname">Info marker<\/h3>/)
    assert.match(marker, /class="obj marker sel"/)
  }))

test('modes and world scale change the viewport', () =>
  withApp(async (app) => {
    assert.match(redirectOf(await app.post('/mode', { mode: 'VR' })).ok ?? '', /VR preview selected/)
    const html = (await app.page('/')).html
    assert.match(html, /class="viewport vr"/)
    assert.match(html, /VR SIMULATION/)
    assert.match(redirectOf(await app.post('/mode', { mode: 'XR' })).error ?? '', /Pick AR, VR or MR/)
    assert.match(redirectOf(await app.post('/world-scale', { scale: '1.5' })).ok ?? '', /World scale set to 1\.5×/)
    assert.match((await app.page('/')).html, /WORLD SCALE 1\.5×/)
    assert.match(redirectOf(await app.post('/world-scale', { scale: '9' })).error ?? '', /World scale/)
  }))

test('adding an anchor selects it and the health stays clean', () =>
  withApp(async (app) => {
    const r = redirectOf(await app.post('/objects', {}))
    assert.match(r.ok ?? '', /New spatial anchor added/)
    const html = (await app.page('/?object=object-1')).html
    assert.match(html, /5 objects · no conflicts/)
    assert.match(html, /<h3 id="objname">New anchor<\/h3>/)
    assert.match(html, /class="obj anchor sel"/)
  }))

test('the inspector applies a transform, refuses bad values, and shows conflicts in the health pill', () =>
  withApp(async (app) => {
    const form = { name: 'Spatial portal', px: '0.5', py: '1.2', pz: '-0.8', rx: '0', ry: '18', rz: '0', scale: '1.5', parent: '', visible: 'visible', trigger: 'proximity', radius: '1.5', action: 'opens' }
    assert.match(redirectOf(await app.post('/objects/portal', form)).ok ?? '', /Spatial portal updated/)
    assert.equal(app.root.scene.object('portal').scale, 1.5)
    assert.match(redirectOf(await app.post('/objects/portal', { ...form, py: '40' })).error ?? '', /Position Y must be a number from -10 to 10 m/)
    assert.match(redirectOf(await app.post('/objects/portal', { ...form, name: 'Info marker' })).error ?? '', /already an object/)
    // Put the light on the portal: two visible objects overlap.
    await app.post('/objects/light', { ...form, name: 'Light source', px: '0.5', py: '1.3', pz: '-0.8', trigger: 'none', action: '' })
    const html = (await app.page('/')).html
    assert.match(html, /4 objects · 1 conflict/)
    assert.match(html, /Spatial portal and Light source overlap/)
  }))

test('previewing an interaction reports the simulated event; an object without one says so', () =>
  withApp(async (app) => {
    assert.match(redirectOf(await app.post('/objects/portal/preview', {})).ok ?? '', /Spatial portal proximity event \(within 1\.5 m\) fired in simulation/)
    assert.match(redirectOf(await app.post('/objects/light/preview', {})).error ?? '', /no interaction to preview/)
    assert.match(redirectOf(await app.post('/objects/nope/preview', {})).error ?? '', /no such object/)
  }))

test('deleting an object, and refusing one that has children', () =>
  withApp(async (app) => {
    await app.post('/objects/marker', { name: 'Info marker', px: '-1.8', py: '1.5', pz: '-1.4', rx: '0', ry: '0', rz: '0', scale: '1.0', parent: 'portal', visible: 'visible', trigger: 'none', radius: '1.5', action: '' })
    assert.match(redirectOf(await app.post('/objects/portal/delete', {})).error ?? '', /has objects placed inside it/)
    assert.match(redirectOf(await app.post('/objects/marker/delete', {})).ok ?? '', /Info marker deleted/)
    assert.equal(app.root.scene.state.objects.length, 3)
  }))
