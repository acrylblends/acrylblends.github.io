import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Scene, SceneError, ago, descendantsOf, hierarchy, memoryStore, parseNumber, seed, validate, worldTransform } from '../plugins/luma/index.ts'
import type { SceneObject } from '../plugins/luma/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  let ids = 0
  const store = memoryStore()
  const scene = await Scene.open({ store, clock: () => NOW, newId: (kind) => `${kind}-n${++ids}` })
  return { scene, store }
}

const obj = (o: Partial<SceneObject> & { id: string }): SceneObject => ({ name: o.id, kind: 'marker', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1, visible: true, interaction: { trigger: 'none', radius: 1.5, action: '' }, ...o })

test('the seed reads as the mockup: four objects, AR, 1.0×, updated four minutes ago, no conflicts', () => {
  const s = seed(NOW)
  assert.deepEqual(s.objects.map((o) => o.name), ['Spatial portal', 'Info marker', 'Light source', 'Visitor path'])
  assert.deepEqual([s.mode, s.worldScale], ['AR', 1])
  assert.deepEqual(s.objects[0]?.position, { x: 0, y: 1.2, z: -0.8 })
  assert.equal(ago(s.updatedAt, NOW), '4 minutes ago')
  assert.deepEqual(validate(s), [])
})

test('a child is placed relative to its parent: position, rotation and scale compose', () => {
  const parent = obj({ id: 'p', position: { x: 1, y: 0, z: 0 }, rotation: { x: 0, y: 90, z: 0 } })
  const child = obj({ id: 'c', parentId: 'p', position: { x: 1, y: 0, z: 0 } })
  assert.deepEqual(worldTransform([parent, child], 'c').position, { x: 1, y: 0, z: -1 })
  const big = obj({ id: 'p', position: { x: 1, y: 0, z: 0 }, scale: 2 })
  assert.deepEqual(worldTransform([big, child], 'c').position, { x: 3, y: 0, z: 0 })
  assert.equal(worldTransform([big, obj({ id: 'c', parentId: 'p', scale: 1.5 })], 'c').scale, 3)
  // A cycle in a damaged file ends instead of looping.
  const a = obj({ id: 'a', parentId: 'b', position: { x: 1, y: 0, z: 0 } })
  const b = obj({ id: 'b', parentId: 'a', position: { x: 1, y: 0, z: 0 } })
  assert.deepEqual(worldTransform([a, b], 'a').position, { x: 2, y: 0, z: 0 })
  assert.deepEqual(descendantsOf([parent, child], 'p').map((o) => o.id), ['c'])
  assert.deepEqual(hierarchy([child, parent]).map((h) => [h.object.id, h.depth]), [['p', 0], ['c', 1]])
})

test('numbers are checked against their range and unit', () => {
  assert.equal(parseNumber(' 1.2 ', 'Position Y', -10, 10, ' m'), 1.2)
  assert.throws(() => parseNumber('11', 'Position X', -10, 10, ' m'), /Position X must be a number from -10 to 10 m\./)
  assert.throws(() => parseNumber('', 'Scale', 0.5, 2, '×'), SceneError)
  assert.throws(() => parseNumber('abc', 'Scale', 0.5, 2, '×'), /Scale/)
})

test('validation reports overlaps, out-of-bounds and hidden interactions', () => {
  const near = [obj({ id: 'a', name: 'A' }), obj({ id: 'b', name: 'B', position: { x: 0.1, y: 0, z: 0 } })]
  assert.match(validate({ objects: near })[0]?.text ?? '', /A and B overlap \(0\.10 m apart\)/)
  assert.equal(validate({ objects: [obj({ id: 'a', name: 'A' }), obj({ id: 'b', name: 'B', visible: false })] }).length, 0)
  const far = obj({ id: 'f', name: 'Far', position: { x: 9, y: 0, z: 0 } })
  const kid = obj({ id: 'k', name: 'Kid', parentId: 'f', position: { x: 5, y: 0, z: 0 } })
  assert.match(validate({ objects: [far, kid] })[0]?.text ?? '', /Kid is outside the 10 m scene bounds/)
  const hidden = obj({ id: 'h', name: 'H', visible: false, interaction: { trigger: 'tap', radius: 1, action: 'x' } })
  assert.deepEqual(validate({ objects: [hidden] }), [{ level: 'warning', text: 'H has an interaction but is hidden in preview.' }])
})

test('modes and world scale are validated and saved', async () => {
  const { scene, store } = await open()
  assert.equal(await scene.setMode('VR'), 'VR')
  assert.equal(scene.state.mode, 'VR')
  const saves = store.saved
  await assert.rejects(scene.setMode('XR'), /Pick AR, VR or MR/)
  await assert.rejects(scene.setWorldScale('3'), /World scale must be a number from 0\.5 to 2×/)
  assert.equal(store.saved, saves)
  assert.equal(await scene.setWorldScale('1.5'), 1.5)
})

test('adding anchors picks free names and spots, and stops at twelve objects', async () => {
  const { scene } = await open()
  const a = await scene.addAnchor()
  const b = await scene.addAnchor()
  assert.deepEqual([a.name, b.name, a.kind], ['New anchor', 'New anchor 2', 'anchor'])
  assert.deepEqual(validate(scene.state), [])
  for (let i = 0; i < 6; i += 1) await scene.addAnchor()
  assert.equal(scene.state.objects.length, 12)
  await assert.rejects(scene.addAnchor(), /at most 12 objects/)
})

test('editing an object checks every field and saves nothing on refusal', async () => {
  const { scene, store } = await open()
  const saves = store.saved
  await assert.rejects(scene.editObject('portal', { name: '' }), /Give the object a name/)
  await assert.rejects(scene.editObject('portal', { name: 'info MARKER' }), /already an object called/)
  await assert.rejects(scene.editObject('portal', { position: { x: '0', y: '99', z: '0' } }), /Position Y/)
  await assert.rejects(scene.editObject('portal', { rotation: { x: '0', y: '181', z: '0' } }), /Rotation Y/)
  await assert.rejects(scene.editObject('portal', { scale: '0.1' }), /Scale/)
  await assert.rejects(scene.editObject('portal', { parent: 'portal' }), /inside itself/)
  await assert.rejects(scene.editObject('portal', { trigger: 'telepathy' }), /Pick a trigger/)
  await assert.rejects(scene.editObject('portal', { action: '' }), /Describe what the interaction does/)
  await assert.rejects(scene.editObject('nope', {}), /no such object/)
  assert.equal(store.saved, saves)
  const o = await scene.editObject('portal', { name: 'Gate', position: { x: '1', y: '1.5', z: '-2' }, scale: '1.5', visible: 'hidden', parent: 'light' })
  assert.deepEqual([o.name, o.scale, o.visible, o.parentId, o.position.y], ['Gate', 1.5, false, 'light', 1.5])
  await assert.rejects(scene.editObject('light', { parent: 'portal' }), /inside itself or one of its children/)
  await scene.editObject('portal', { parent: '' })
  assert.equal(scene.object('portal').parentId, undefined)
})

test('an object with children cannot be deleted; the interaction preview is simulated and saves nothing', async () => {
  const { scene, store } = await open()
  await scene.editObject('marker', { parent: 'portal' })
  await assert.rejects(scene.deleteObject('portal'), /has objects placed inside it/)
  await scene.deleteObject('marker')
  assert.equal(scene.state.objects.length, 3)
  const saves = store.saved
  assert.equal(scene.preview('portal'), 'Interaction preview: Spatial portal proximity event (within 1.5 m) fired in simulation → opens the gallery overlay.')
  assert.throws(() => scene.preview('light'), /no interaction to preview/)
  assert.equal(store.saved, saves)
})
