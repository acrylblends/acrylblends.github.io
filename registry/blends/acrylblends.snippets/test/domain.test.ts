import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  filterSnippets,
  fillVariables,
  languageCounts,
  languageOf,
  missingVariables,
  type Snippet,
  Snippets,
  SnippetsError,
  tagCounts,
  tagsOf,
  variablesOf,
  whenText,
} from '../plugins/snippets/index.ts'
import { memoryStore, type Store } from '../plugins/snippets/store.ts'
import { seed } from '../plugins/snippets/seed.ts'
import { NOW, withApp } from './support.ts'

const newId = (kind: string): string => `${kind}-${Math.random().toString(36).slice(2, 8)}`

test('variables are read from the code once each, in order, trimmed', () => {
  assert.deepEqual(variablesOf('Hi {{product name}}, {{ audience }} and {{product name}}'), ['product name', 'audience'])
  assert.deepEqual(variablesOf('no variables here'), [])
  assert.deepEqual(variablesOf('{{}} {{  }} {{a b}}'), ['a b'])
})

test('every variable must have a value before the code is filled', () => {
  const code = 'Hello {{name}}, your {{item}} is ready.'
  assert.deepEqual(missingVariables(code, { name: 'Ada' }), ['item'])
  assert.deepEqual(missingVariables(code, { name: 'Ada', item: 'order' }), [])
  assert.equal(fillVariables(code, { name: 'Ada', item: 'order' }), 'Hello Ada, your order is ready.')
  assert.equal(fillVariables(code, { name: 'Ada' }), 'Hello Ada, your {{item}} is ready.')
})

test('tags are trimmed, lower-cased and unique', () => {
  assert.deepEqual(tagsOf(' Async, network , async,'), ['async', 'network'])
  assert.deepEqual(tagsOf(['A', 'a', 'b']), ['a', 'b'])
  assert.deepEqual(tagsOf(''), [])
})

test('a language accepts its name or its short label, and refuses anything else', () => {
  assert.equal(languageOf('TypeScript'), 'TypeScript')
  assert.equal(languageOf('ts'), 'TypeScript')
  assert.equal(languageOf('PY'), 'Python')
  assert.equal(languageOf('sql'), 'SQL')
  assert.throws(() => languageOf('rust'), (error: unknown) => error instanceof SnippetsError && error.code === 'invalid')
})

test('the seed has 128 snippets across five languages, three collections and twelve favourites', () => {
  const state = seed(NOW, newId)
  assert.equal(state.snippets.length, 128)
  assert.deepEqual(
    languageCounts(state).map((item) => item.language),
    ['TypeScript', 'JavaScript', 'Python', 'SQL', 'Shell'],
  )
  assert.equal(state.collections.length, 3)
  assert.equal(state.snippets.filter((snippet) => snippet.starred).length, 12)
  assert.ok(state.snippets.every((snippet) => snippet.code.trim() !== ''))
  assert.deepEqual(state.snippets[0]?.variables, [])
})

test('the search matches title, description, code and tags, and follows the filter', () => {
  const state = seed(NOW, newId)
  const python = filterSnippets(state, { language: 'Python' })
  assert.ok(python.length > 0)
  assert.ok(python.every((snippet) => snippet.language === 'Python'))
  const found = filterSnippets(state, { q: 'postgres' })
  assert.ok(found.some((snippet) => snippet.title === 'postgres-json-merge'))
  const tagged = filterSnippets(state, { tag: 'resilience' })
  assert.ok(tagged.length > 0)
  assert.ok(tagged.every((snippet) => snippet.tags.includes('resilience')))
  assert.equal(filterSnippets(state, { q: 'nothing-matches-this' }).length, 0)
  assert.equal(filterSnippets(state, { limit: 7 }).length, 7)
})

test('a collection keeps its own order and ignores snippets that are not in it', () => {
  const state = seed(NOW, newId)
  const collection = state.collections[0]
  assert.ok(collection !== undefined)
  const items = filterSnippets(state, { collectionId: collection.id })
  assert.deepEqual(items.map((snippet) => snippet.id), collection.snippetIds)
})

test('the most used tags come first', () => {
  const state = seed(NOW, newId)
  const tags = tagCounts(state)
  assert.ok(tags.length > 5)
  for (let index = 1; index < tags.length; index++)
    assert.ok(tags[index - 1]!.count >= tags[index]!.count)
})

test('whenText reads hours, yesterday and a date', () => {
  assert.equal(whenText('2026-11-06T08:41', NOW), '1h ago')
  assert.equal(whenText('2026-11-05T09:41', NOW), 'Yesterday')
  assert.equal(whenText('2026-10-31T09:41', NOW), '31 Oct')
})

async function open(store?: Store<ReturnType<typeof seed>>): Promise<Snippets> {
  let ids = 0
  return Snippets.open({
    store: store ?? memoryStore(),
    clock: () => NOW,
    newId: (kind) => `${kind}-${++ids}`,
  })
}

test('creating, changing and removing a snippet persist to the store', async () => {
  const store = memoryStore<ReturnType<typeof seed>>()
  const snippets = await open(store)
  const snippet = await snippets.create({
    title: '  my helper  ',
    description: 'Does one thing',
    language: 'JavaScript',
    code: 'export const answer = () => 42;',
    tags: 'Math, math, helper',
  })
  assert.equal(snippet.title, 'my helper')
  assert.deepEqual(snippet.tags, ['math', 'helper'])
  assert.equal(store.saved, 1)
  const changed = await snippets.update(snippet.id, {
    title: snippet.title,
    description: snippet.description,
    language: 'JavaScript',
    code: 'export const answer = (value) => value;',
    tags: 'math',
  })
  assert.deepEqual(changed.variables, [])
  assert.equal(store.saved, 2)
  await snippets.toggleStar(snippet.id)
  assert.equal(snippets.get(snippet.id)?.starred, true)
  await snippets.remove(snippet.id)
  assert.equal(snippets.get(snippet.id), undefined)
  assert.equal(snippets.all().length, 128)
})

test('a snippet without a title or code is refused with a message for the form', async () => {
  const snippets = await open()
  await assert.rejects(
    snippets.create({ title: ' ', description: 'x', language: 'TypeScript', code: 'x', tags: '' }),
    (error: unknown) => error instanceof SnippetsError && /Title is required/.test(error.message),
  )
  await assert.rejects(
    snippets.create({ title: 'x', description: 'x', language: 'TypeScript', code: ' ', tags: '' }),
    (error: unknown) => error instanceof SnippetsError && /code is required/.test(error.message),
  )
  await assert.rejects(
    snippets.create({ title: 'x', description: 'x', language: 'Rust', code: 'x', tags: '' }),
    (error: unknown) => error instanceof SnippetsError && /Pick one of the languages/.test(error.message),
  )
})

test('a collection name must be new', async () => {
  const snippets = await open()
  const first = await snippets.createCollection('Test collection', [])
  await assert.rejects(
    snippets.createCollection('test collection', []),
    (error: unknown) => error instanceof SnippetsError && error.code === 'conflict',
  )
  const snippet = snippets.all()[0] as Snippet
  const withItem = await snippets.addToCollection(first.id, snippet.id)
  assert.deepEqual(withItem.snippetIds, [snippet.id])
  const again = await snippets.addToCollection(first.id, snippet.id)
  assert.deepEqual(again.snippetIds, [snippet.id])
})

test('the library the page shows is the one the tests boot', () =>
  withApp(async (app) => {
    assert.equal(app.root.snippets.all().length, 128)
  }))
