import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_PAGES, Site, SiteError, contrastOf, memoryStore, parseItems, seed } from '../plugins/pagefoundry/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  let ids = 0
  const store = memoryStore()
  const site = await Site.open({ store, clock: () => NOW, newId: (kind) => `${kind}-n${++ids}` })
  return { site, store }
}

test('the seed reads as the mockup: Northstar Studio, three pages, a draft with no builds', () => {
  const s = seed()
  assert.equal(s.name, 'Northstar Studio')
  assert.deepEqual(s.pages.map((p) => p.name), ['Home', 'Features', 'Pricing'])
  assert.deepEqual(s.pages[0]?.sections.map((x) => x.kind), ['hero', 'features', 'cta'])
  assert.equal(s.builds.length, 0)
})

test('feature items are Title | text lines, at most six', () => {
  assert.deepEqual(parseItems('A | one\nB | two'), [{ title: 'A', text: 'one' }, { title: 'B', text: 'two' }])
  assert.throws(() => parseItems('1|a\n2|a\n3|a\n4|a\n5|a\n6|a\n7|a'), /at most six/)
  assert.throws(() => parseItems(' | x'), SiteError)
})

test('pages and sections: add, edit, move and delete, each saved; bad input is refused without saving', async () => {
  const { site, store } = await open()
  assert.equal(store.saved, 1)
  const page = await site.addPage(' About us ')
  assert.deepEqual([page.id, page.sections.length], ['about-us', 1])
  await assert.rejects(site.addPage('About us'), /already a page called/)
  await assert.rejects(site.addPage(''), /Give the page a name/)
  const section = await site.addSection('home', 'quote')
  assert.equal(site.page('home').sections.at(-1)?.id, section.id)
  await assert.rejects(site.addSection('home', 'nope'), /Pick a block/)
  const saves = store.saved
  await assert.rejects(site.editSection('home', section.id, { headline: '' }), /needs a headline/)
  await assert.rejects(site.editSection('home', section.id, { bg: 'red' }), /colour/)
  assert.equal(store.saved, saves)
  await site.editSection('home', section.id, { headline: 'Great', bg: '#102030', width: 'compact', visibility: 'hidden-mobile' })
  const edited = site.section('home', section.id)
  assert.deepEqual([edited.headline, edited.bg, edited.width, edited.visibility], ['Great', '#102030', 'compact', 'hidden-mobile'])
  await site.moveSection('home', section.id, 'up')
  assert.equal(site.page('home').sections.at(-2)?.id, section.id)
  await assert.rejects(site.moveSection('home', 'hero-1', 'up'), /already first/)
  await site.deleteSection('home', section.id)
  assert.equal(site.page('home').sections.length, 3)
  await site.deletePage('about-us')
  await assert.rejects(site.deletePage('home'), /home page/)
  await assert.rejects(site.deletePage('nope'), /no such page/)
})

test('a site holds at most eight pages', async () => {
  const { site } = await open()
  for (let i = 0; i < MAX_PAGES - 3; i += 1) await site.addPage(`Extra ${String(i)}`)
  await assert.rejects(site.addPage('One more'), /at most 8 pages/)
})

test('contrast is computed from the background; the inspector and publish warn about hard-to-read sections', async () => {
  const { site } = await open()
  const hero = site.section('home', 'hero-1')
  assert.ok(contrastOf(hero) >= 4.5)
  await site.editSection('home', 'hero-1', { bg: '#777777' })
  assert.ok(contrastOf(site.section('home', 'hero-1')) < 4.5)
  const build = await site.publish()
  assert.equal(build.version, '1.0')
  assert.equal(build.warnings.length, 1)
  assert.match(build.warnings[0] ?? '', /Home: Hero section contrast is/)
})

test('theme, preview mode and publish: validated, versioned, and refused while a page is empty', async () => {
  const { site } = await open()
  await assert.rejects(site.setTheme('blue', 'serif'), /colour/)
  await assert.rejects(site.setTheme('#112233', 'mono'), /serif or sans/)
  await site.setTheme('#AABBCC', 'sans')
  assert.deepEqual(site.state.theme, { accent: '#aabbcc', serif: false })
  await site.setPreview(true, 'mobile')
  assert.deepEqual(site.state.view, { preview: true, device: 'mobile' })
  await site.publish()
  assert.equal((await site.publish()).version, '1.1')
  for (const s of [...site.page('pricing').sections]) await site.deleteSection('pricing', s.id)
  await assert.rejects(site.publish(), /Pricing has no sections yet/)
})
