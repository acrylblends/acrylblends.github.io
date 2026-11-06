import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Project, ProjectError, clampZoom, editLayer, estimateKb, exportName, memoryStore, pageOf, seed } from '../plugins/canvasmith/index.ts'

const open = async () => {
  let ids = 0
  const store = memoryStore()
  const project = await Project.open({ store, clock: () => new Date(2026, 10, 5, 11, 0), newId: (k) => `${k}-n${++ids}` })
  return { project, store }
}
const hero = seed().docs[0]!
const headline = hero.layers.find((l) => l.id === 'headline')!

test('the seed reads as the mockup: a 1440 by 980 artboard and five objects on it', () => {
  assert.deepEqual(pageOf(hero), { width: 1440, height: 980 })
  assert.deepEqual(hero.layers.map((l) => l.name), ['Artboard', 'Headline', 'Hero image', 'CTA button', 'Eyebrow', 'Body copy'])
  assert.equal(hero.layers[0]?.fill, '#e8dfd3')
})

test('layer edits are checked: whole numbers in range, a #rrggbb fill, a name; the artboard stays at the origin', () => {
  const moved = editLayer(headline, { x: '120', y: '-40', w: '700', h: '300', opacity: '80', radius: '4', fill: '#AABBCC' })
  assert.deepEqual([moved.x, moved.y, moved.w, moved.h, moved.opacity, moved.radius, moved.fill], [120, -40, 700, 300, 80, 4, '#aabbcc'])
  assert.throws(() => editLayer(headline, { x: '1.5' }), /X must be a whole number from -5000 to 5000/)
  assert.throws(() => editLayer(headline, { w: '0' }), /Width must be a whole number from 1 to 10000/)
  assert.throws(() => editLayer(headline, { opacity: '101' }), /Opacity must be a whole number from 0 to 100/)
  assert.throws(() => editLayer(headline, { radius: '-1' }), /Corner radius/)
  assert.throws(() => editLayer(headline, { fill: 'red' }), /Fill is a colour like #e8dfd3/)
  assert.throws(() => editLayer(headline, { name: '  ' }), /1 to 40 characters/)
  assert.equal(editLayer(headline, { text: 'Hi\r\nthere' }).text, 'Hi\nthere')
  assert.throws(() => editLayer(headline, { text: 'x'.repeat(301) }), /at most 300 characters/)
  const art = editLayer(hero.layers[0]!, { x: '50', y: '50', w: '1000' })
  assert.deepEqual([art.x, art.y, art.w], [0, 0, 1000])
  assert.equal(editLayer(headline, { visible: 'off' }).visible, false)
  assert.equal(editLayer({ ...headline, visible: false }, {}).visible, false)
})

test('zoom stays between 70% and 130% in steps of 10', () => {
  assert.deepEqual([60, 70, 105, 140].map(clampZoom), [70, 70, 105, 130])
})

test('export names and size estimates are stable per format and scale', () => {
  assert.equal(exportName(hero, 1, 'PNG'), 'hero-poster.png')
  assert.equal(exportName(hero, 2, 'JPG'), 'hero-poster@2x.jpg')
  assert.ok(estimateKb(hero, 2, 'PNG') > estimateKb(hero, 1, 'PNG'))
  assert.ok(estimateKb(hero, 1, 'JPG') < estimateKb(hero, 1, 'PNG'))
  assert.ok(estimateKb(hero, 1, 'SVG') < 20)
})

test('editing saves the change and logs it; a refused edit saves nothing', async () => {
  const { project, store } = await open()
  const layer = await project.edit('hero-poster', 'headline', { x: '100', y: '160', w: '740', h: '330', opacity: '100', radius: '0', fill: '#1d292c' })
  assert.equal(layer.x, 100)
  assert.equal(project.layer('hero-poster', 'headline').x, 100)
  assert.equal(project.activity(1)[0]?.text, 'Headline edited')
  const saves = store.saved
  await assert.rejects(project.edit('hero-poster', 'headline', { x: 'a' }), /X must be/)
  await assert.rejects(project.edit('hero-poster', 'nope', {}), /no such layer/)
  await assert.rejects(project.edit('nope', 'headline', {}), /no such file/)
  assert.equal(store.saved, saves)
})

test('layers are added by tool, ordered and deleted; the artboard stays at the back and cannot be deleted', async () => {
  const { project } = await open()
  const text = await project.addLayer('brand-marks', 'text')
  assert.deepEqual([text.name, text.kind, text.text], ['Text 2', 'text', 'New text'])
  const shape = await project.addLayer('brand-marks', 'shape')
  assert.equal(shape.name, 'Shape 2')
  const ids = () => project.doc('brand-marks').layers.map((l) => l.id)
  assert.deepEqual(ids().slice(-2), [text.id, shape.id])
  await project.arrange('brand-marks', shape.id, 'backward')
  assert.deepEqual(ids().slice(-2), [shape.id, text.id])
  await assert.rejects(project.arrange('brand-marks', text.id, 'forward'), /already in front/)
  await project.arrange('brand-marks', shape.id, 'backward')
  await project.arrange('brand-marks', shape.id, 'backward')
  await assert.rejects(project.arrange('brand-marks', shape.id, 'backward'), /already at the back/)
  await assert.rejects(project.arrange('brand-marks', 'artboard', 'forward'), /artboard stays at the back/)
  await assert.rejects(project.deleteLayer('brand-marks', 'artboard'), /cannot be deleted/)
  await project.deleteLayer('brand-marks', text.id)
  await assert.rejects(project.addLayer('brand-marks', 'artboard'), /Pick the Frame, Text or Shape tool/)
})

test('zoom, the layer list and the tool are kept; the limits are said', async () => {
  const { project } = await open()
  assert.equal(await project.zoom('in'), 110)
  assert.equal(await project.zoom('reset'), 100)
  await assert.rejects(project.zoom('reset'), /already 100%/)
  for (let i = 0; i < 3; i += 1) await project.zoom('out')
  await assert.rejects(project.zoom('out'), /between 70% and 130%/)
  assert.equal(await project.toggleLayers(), false)
  await project.setTool('text')
  assert.deepEqual([project.state.view.tool, project.state.view.showLayers, project.state.view.zoom], ['text', false, 70])
})

test('files: a new artboard gets the next free name; a project holds at most twelve', async () => {
  const { project } = await open()
  assert.equal((await project.newDoc()).name, 'Untitled 1')
  assert.equal((await project.newDoc()).file, 'untitled-2.canvas')
  for (let i = 0; i < 6; i += 1) await project.newDoc()
  await assert.rejects(project.newDoc(), /at most 12 files/)
  assert.equal((await project.open('typography')).name, 'Typography')
  assert.equal(project.activity(1)[0]?.text, 'Typography opened')
})

test('exports record the file, size and format; nothing visible to export is refused', async () => {
  const { project } = await open()
  const e = await project.exportDoc('hero-poster', 'PNG', '2')
  assert.deepEqual([e.fileName, e.width, e.height, e.format], ['hero-poster@2x.png', 2880, 1960, 'PNG'])
  assert.equal(project.exports(1)[0]?.id, 'export-n1')
  assert.match(project.activity(1)[0]?.text ?? '', /Preview export prepared · hero-poster@2x\.png · simulated/)
  await assert.rejects(project.exportDoc('hero-poster', 'GIF', '1'), /Pick PNG, JPG, SVG/)
  await assert.rejects(project.exportDoc('hero-poster', 'PNG', '3'), /Pick 1x or 2x/)
  const empty = await project.newDoc()
  await assert.rejects(project.exportDoc(empty.id, 'PNG', '1'), /has nothing visible to export/)
  assert.ok(new ProjectError('invalid', 'x') instanceof Error)
})
