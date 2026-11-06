import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BoardError,
  cleanColor,
  cleanColors,
  cleanDimension,
  cleanLink,
  cleanPosition,
  cleanTitle,
  type BoardState,
} from '../plugins/boards/index.ts'
import { Boards } from '../plugins/boards/boards.ts'
import { seed, SEED_FACTS } from '../plugins/boards/seed.ts'
import { memoryStore } from '../plugins/boards/store.ts'
import { NOW } from './support.ts'

const ids = (): ((kind: string) => string) => {
  let next = 0
  return (kind) => `${kind}-${String(++next)}`
}

async function open(store = memoryStore<BoardState>()): Promise<{ boards: Boards; store: ReturnType<typeof memoryStore<BoardState>> }> {
  return { boards: await Boards.open({ store, clock: () => NOW, newId: ids() }), store }
}

test('the seed is the mockup board: six objects at their positions, three images and five colours', () => {
  const state = seed(NOW, ids())
  assert.equal(state.board.title, 'Quiet Modern')
  assert.equal(state.board.project, 'Brand refresh')
  assert.equal(state.objects.length, SEED_FACTS.objects)
  assert.equal(state.assets.filter((asset) => asset.kind === 'image').length, SEED_FACTS.images)
  assert.equal(state.assets.filter((asset) => asset.kind === 'color').length, SEED_FACTS.colors)
  assert.deepEqual(state.objects.map((object) => object.zIndex), [1, 2, 3, 4, 5, 6])
  const materials = state.objects[0]
  assert.ok(materials !== undefined)
  assert.equal(materials.type, 'image')
  assert.equal(materials.x, 7)
  assert.equal(materials.y, 13)
  assert.equal(state.objects.filter((object) => object.type === 'note')[0]?.label, 'DESIGN PRINCIPLE 01')
  assert.equal(state.objects.filter((object) => object.type === 'palette')[0]?.colors.length, 4)
})

test('moving clamps to the board and persists; unknown objects are refused', async () => {
  const { boards, store } = await open()
  const object = boards.objects()[0]
  assert.ok(object !== undefined)
  const moved = await boards.move(object.id, 120, -4)
  assert.equal(moved.x, 100)
  assert.equal(moved.y, 0)
  assert.equal(store.saved, 1)
  await assert.rejects(boards.move('missing', 10, 10), (error: unknown) => error instanceof BoardError && error.code === 'not-found')
  assert.equal(cleanPosition('42.126', 'x'), 42.13)
})

test('adding an object validates its type, content, link and asset, and assigns the top layer', async () => {
  const { boards } = await open()
  const note = await boards.addObject({ type: 'note', content: 'A quieter line.', name: 'New direction' })
  assert.equal(note.name, 'New direction')
  assert.equal(note.zIndex, 7)
  assert.equal(note.rotation, -2)
  assert.ok(note.x >= 0 && note.x <= 100)
  const link = await boards.addObject({ type: 'link', content: 'https://example.com/reference' })
  assert.equal(link.content, 'https://example.com/reference')
  await assert.rejects(boards.addObject({ type: 'nope', content: 'x' }), /object type/)
  await assert.rejects(boards.addObject({ type: 'note', content: '' }), /content/)
  await assert.rejects(boards.addObject({ type: 'link', content: 'example.com' }), /http/)
  await assert.rejects(boards.addObject({ type: 'image', content: 'x', assetId: 'missing' }), /image asset/)
  await assert.rejects(boards.addObject({ type: 'palette', content: 'Two', colors: ['#263f35'] }), /two and six/)
  assert.equal(cleanColors(['#263f35', '#B9AA8B'])[1], '#b9aa8b')
  assert.throws(() => cleanColor('green'), /six-digit hex/)
})

test('editing changes content, name, label and rotation; an unknown object is refused', async () => {
  const { boards, store } = await open()
  const note = boards.objects().find((object) => object.type === 'note')
  assert.ok(note !== undefined)
  const changed = await boards.updateObject(note.id, { content: 'Warmth, quiet and lived-in.', name: 'Tone', label: 'PRINCIPLE 01', rotation: 1.5 })
  assert.equal(changed.content, 'Warmth, quiet and lived-in.')
  assert.equal(changed.name, 'Tone')
  assert.equal(changed.label, 'PRINCIPLE 01')
  assert.equal(changed.rotation, 1.5)
  assert.equal(store.saved, 1)
  await assert.rejects(boards.updateObject('missing', { content: 'x' }), /no longer/)
  await assert.rejects(boards.updateObject(note.id, { rotation: 40 }), /rotation/)
  await assert.rejects(boards.updateObject(note.id, { content: '' }), /content/)
})

test('duplicating offsets the copy by four percent and puts it on top', async () => {
  const { boards } = await open()
  const source = boards.objects()[0]
  assert.ok(source !== undefined)
  const copy = await boards.duplicate(source.id)
  assert.notEqual(copy.id, source.id)
  assert.equal(copy.x, source.x + 4)
  assert.equal(copy.y, source.y + 4)
  assert.equal(copy.zIndex, 7)
  assert.equal(copy.name, 'Materials copy')
  assert.equal(boards.objects().length, 7)
})

test('layering swaps with the neighbour and does nothing at the edges', async () => {
  const { boards } = await open()
  const first = boards.objects()[0]
  const second = boards.objects()[1]
  assert.ok(first !== undefined && second !== undefined)
  await boards.layer(first.id, 'up')
  assert.equal(boards.object(first.id)?.zIndex, 2)
  assert.equal(boards.object(second.id)?.zIndex, 1)
  await boards.layer(first.id, 'up')
  assert.equal(boards.object(first.id)?.zIndex, 3)
  const top = boards.objects()[boards.objects().length - 1]
  assert.ok(top !== undefined)
  const before = top.zIndex
  await boards.layer(top.id, 'up')
  assert.equal(boards.object(top.id)?.zIndex, before)
})

test('removing an object leaves the rest; removing all gives an empty board', async () => {
  const { boards } = await open()
  for (const object of boards.objects()) await boards.remove(object.id)
  assert.equal(boards.objects().length, 0)
  await assert.rejects(boards.remove('missing'), /no longer/)
})

test('the palette selection is validated and persisted', async () => {
  const { boards, store } = await open()
  const board = await boards.selectColor('#B96E4C')
  assert.equal(board.selectedColor, '#b96e4c')
  assert.equal(store.saved, 1)
  await assert.rejects(boards.selectColor('orange'), /six-digit hex/)
})

test('board settings validate the title, dimensions and collaborators, and persist', async () => {
  const { boards } = await open()
  const changed = await boards.updateBoard({ title: 'Quiet Modern v2', project: 'Brand refresh 2027', width: 1_400, height: 900, collaborators: 'Design Studio, Maya Chen, Sam Lee' })
  assert.equal(changed.title, 'Quiet Modern v2')
  assert.equal(changed.width, 1_400)
  assert.deepEqual(changed.collaborators, ['Design Studio', 'Maya Chen', 'Sam Lee'])
  await assert.rejects(boards.updateBoard({ title: '' }), /title/)
  await assert.rejects(boards.updateBoard({ width: 100 }), /width/)
  await assert.rejects(boards.updateBoard({ height: 9_000 }), /height/)
  assert.equal(cleanDimension('1200', 'width'), 1_200)
  assert.throws(() => cleanTitle('x'.repeat(90)), /80/)
})

test('assets validate their kind, name and colour', async () => {
  const { boards } = await open()
  const image = await boards.addAsset({ kind: 'image', name: 'Linen sample', art: 'fabric', tone: 2, tags: 'material, weave' })
  assert.equal(image.filename, 'linen-sample.jpg')
  assert.deepEqual(image.tags, ['material', 'weave'])
  const color = await boards.addAsset({ kind: 'color', name: 'Clay', colorValue: '#B96E4C' })
  assert.equal(color.colorValue, '#b96e4c')
  assert.equal(boards.assets().length, 10)
  await assert.rejects(boards.addAsset({ kind: 'color', name: 'Broken', colorValue: 'red' }), /hex/)
  await assert.rejects(boards.addAsset({ kind: 'image', name: '' }), /name/)
})

test('the export contains the board, its objects and the asset library, and a store failure is storage', async () => {
  const { boards } = await open()
  const exported = boards.exportData()
  assert.equal(exported.board.title, 'Quiet Modern')
  assert.equal(exported.objects.length, 6)
  assert.equal(exported.assets.length, 8)
  const broken = await Boards.open({
    store: {
      load: async () => undefined,
      save: async () => {
        throw new Error('disk full')
      },
    },
    clock: () => NOW,
    newId: ids(),
  })
  const object = broken.objects()[0]
  assert.ok(object !== undefined)
  await assert.rejects(broken.move(object.id, 10, 10), (error: unknown) => error instanceof BoardError && error.code === 'storage')
})

test('the seed is deterministic and the positions stay percentages', () => {
  const first = seed(NOW, ids())
  const second = seed(NOW, ids())
  assert.deepEqual(first, second)
  assert.ok(first.objects.every((object) => object.x >= 0 && object.x <= 100 && object.y >= 0 && object.y <= 100))
  assert.equal(cleanLink('https://example.com/x'), 'https://example.com/x')
})
