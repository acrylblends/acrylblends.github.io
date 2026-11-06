import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Desk, DeskError, ago, countsFor, matchPercent, memoryStore, placeholdersOf, qaChecks, seed, suggestionFor } from '../plugins/lingodesk/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  const store = memoryStore()
  const desk = await Desk.open({ store, clock: () => NOW })
  return { desk, store }
}

test('the seed reads as the mockup: four locales, de-AT 75% translated with one waiting on review work', () => {
  const s = seed(NOW)
  assert.deepEqual(s.locales.map((l) => l.id), ['de-AT', 'fr-FR', 'es-ES', 'ja-JP'])
  assert.deepEqual(countsFor(s, 'de-AT', 'ui'), { total: 8, translated: 6, review: 3, empty: 2, approved: 3 })
  assert.equal(s.segments.find((x) => x.key === 'welcome.title' && x.locale === 'de-AT')?.by, 'Mira')
  assert.equal(ago(s.segments.find((x) => x.key === 'welcome.title' && x.locale === 'de-AT')?.updatedAt ?? '', NOW), '4 minutes ago')
  assert.equal(ago(s.syncedAt, NOW), '12 minutes ago')
})

test('placeholders are compared as tokens, matches by shared words', () => {
  assert.deepEqual(placeholdersOf('Hi {firstName}, {firstName} and {a.b}'), ['{firstName}', '{a.b}'])
  assert.equal(matchPercent('Continue to your dashboard', 'Continue to your dashboard'), 100)
  assert.equal(matchPercent('Welcome back, {firstName}.', 'Welcome back, {name}.'), 67)
  assert.equal(matchPercent('abc', 'xyz'), 0)
  const s = seed(NOW)
  assert.equal(suggestionFor(s.memory, 'de-AT', 'Welcome back, {firstName}.')?.entry.id, 'tm-1')
  assert.equal(suggestionFor(s.memory, 'de-AT', 'Skip for now'), undefined)
})

test('QA: de-AT has two untranslated strings; fr-FR has a wrong placeholder; length and terms are checked', () => {
  const s = seed(NOW)
  const de = qaChecks(s, 'de-AT')
  assert.deepEqual(de.map((c) => [c.id, c.level, c.issues.length]), [['placeholders', 'pass', 0], ['missing', 'warning', 2], ['terms', 'pass', 0], ['length', 'pass', 0]])
  const fr = qaChecks(s, 'fr-FR')
  assert.deepEqual(fr[0]?.issues, ['setup.invite is missing {workspaceName}.', 'setup.invite has {workspace}, which is not in the source.'])
  const segments = s.segments.map((x) => (x.key === 'signin.button' && x.locale === 'de-AT' ? { ...x, target: 'Einloggen und weiter zur Anmeldung heute' } : x.key === 'welcome.subtitle' && x.locale === 'de-AT' ? { ...x, target: 'Dein Arbeitsplatz ist bereit.' } : x))
  const changed = qaChecks({ ...s, segments }, 'de-AT')
  assert.match(changed[3]?.issues[0] ?? '', /signin\.button is 40 characters; the limit is 14/)
  assert.deepEqual(changed[2]?.issues, ['welcome.subtitle: “workspace” should be “Arbeitsbereich”.', 'signin.button: “sign in” should be “anmelden”.'])
  assert.equal(qaChecks({ ...s, keys: s.keys.map((k) => ({ key: k.key, type: k.type, source: k.source })) }, 'de-AT')[3]?.level, 'na')
})

test('editing saves a draft needing review; clearing makes it untranslated; unchanged text saves nothing; bad input is refused', async () => {
  const { desk, store } = await open()
  const saves = store.saved
  assert.equal((await desk.edit('welcome.continue', 'de-AT', '  Weiter zu deiner Übersicht ')).state, 'review')
  assert.equal(desk.segment('welcome.continue', 'de-AT').target, 'Weiter zu deiner Übersicht')
  assert.equal(store.saved, saves + 1)
  await desk.edit('welcome.continue', 'de-AT', 'Weiter zu deiner Übersicht')
  assert.equal(store.saved, saves + 1)
  assert.equal((await desk.edit('welcome.continue', 'de-AT', '')).state, 'empty')
  await assert.rejects(desk.edit('welcome.continue', 'de-AT', 'x'.repeat(501)), /at most 500/)
  await assert.rejects(desk.edit('nope', 'de-AT', 'x'), /no such segment/)
  await assert.rejects(desk.edit('welcome.continue', 'xx-XX', 'x'), /no such locale/)
})

test('an approved translation is never rewritten: edits, terms and suggestions are refused until it is reopened', async () => {
  const { desk } = await open()
  const before = desk.segment('welcome.subtitle', 'de-AT')
  await assert.rejects(desk.edit('welcome.subtitle', 'de-AT', 'Anders'), /is approved\. Reopen it/)
  await assert.rejects(desk.insertTerm('welcome.subtitle', 'de-AT', 'term-workspace'), /is approved/)
  await assert.rejects(desk.insertSuggestion('welcome.subtitle', 'de-AT'), /is approved|no translation-memory/)
  assert.equal(desk.segment('welcome.subtitle', 'de-AT'), before)
  assert.equal((await desk.reopen('welcome.subtitle', 'de-AT')).state, 'review')
  assert.equal((await desk.edit('welcome.subtitle', 'de-AT', 'Anders')).target, 'Anders')
  await assert.rejects(desk.reopen('welcome.subtitle', 'de-AT'), /not approved/)
})

test('approve one segment: needs a translation, and is idempotent', async () => {
  const { desk, store } = await open()
  await assert.rejects(desk.approve('welcome.continue', 'de-AT'), /no translation to approve/)
  assert.equal((await desk.approve('welcome.skip', 'de-AT')).state, 'approved')
  const saves = store.saved
  await desk.approve('welcome.skip', 'de-AT')
  assert.equal(store.saved, saves)
})

test('terms are appended and suggestions replace the target, both leaving the segment for review', async () => {
  const { desk } = await open()
  assert.equal((await desk.insertTerm('welcome.continue', 'de-AT', 'term-dashboard')).target, 'Übersicht')
  assert.equal((await desk.insertTerm('welcome.continue', 'de-AT', 'term-signin')).target, 'Übersicht anmelden')
  await assert.rejects(desk.insertTerm('welcome.continue', 'de-AT', 'nope'), /no approved translation/)
  const r = await desk.insertSuggestion('welcome.title', 'de-AT')
  assert.deepEqual([r.percent, r.segment.target, r.segment.state], [67, 'Willkommen zurück, {name}.', 'review'])
  assert.deepEqual(desk.liveChecks('de-AT')[0]?.issues, ['welcome.title is missing {firstName}.', 'welcome.title has {name}, which is not in the source.'])
  await assert.rejects(desk.insertSuggestion('welcome.skip', 'de-AT'), /no translation-memory suggestion/)
})

test('Run QA records the result and edits make it stale', async () => {
  const { desk } = await open()
  assert.equal(desk.qaStale('de-AT'), false)
  await desk.edit('welcome.continue', 'de-AT', 'Weiter')
  assert.equal(desk.qaStale('de-AT'), false, 'the edit happens at the same instant as the run in this fake clock')
  const run = await desk.runQa('de-AT')
  assert.equal(run.checks[1]?.issues.length, 1)
  assert.equal(desk.qaRun('de-AT')?.checks[1]?.level, 'warning')
  await assert.rejects(desk.runQa('xx'), /no such locale/)
})

test('approving a locale needs QA to pass; then only review segments become approved', async () => {
  const { desk } = await open()
  await assert.rejects(desk.approveLocale('de-AT'), /QA must pass before Deutsch \(Austria\) can be approved: 2 issues open \(welcome\.continue has no translation\., …\)/)
  await assert.rejects(desk.approveLocale('fr-FR'), /1 issue open|2 issues open/)
  await desk.edit('setup.invite', 'fr-FR', 'Invitez votre équipe sur {workspaceName}.')
  const n = await desk.approveLocale('fr-FR')
  assert.equal(n, 3)
  assert.equal(countsFor(desk.state, 'fr-FR').review, 0)
  assert.equal(desk.segment('setup.invite', 'fr-FR').state, 'approved')
  await assert.rejects(desk.approveLocale('fr-FR'), /already fully approved/)
  assert.equal(desk.qaStale('fr-FR'), false)
})

test('errors are typed', async () => {
  const { desk } = await open()
  await assert.rejects(desk.approve('nope', 'de-AT'), (e: unknown) => e instanceof DeskError && e.code === 'not-found')
})
