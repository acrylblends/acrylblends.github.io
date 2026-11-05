import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import {
  addDays,
  cleanStamp,
  cleanValue,
  Crm,
  CrmError,
  type CrmState,
  euro,
  euroShort,
  initialsOf,
  isDay,
  jsonFileStore,
  memoryStore,
  seed,
  taskState,
  whenText,
} from '../plugins/crm/index.ts'
import { NOW, projectRoot } from './support.ts'

const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

async function open(state?: CrmState) {
  let ids = 0
  const store = memoryStore<CrmState>(state)
  const crm = await Crm.open({ store, clock: () => NOW, newId: (kind) => `${kind}-${++ids}` })
  return { crm, store }
}

const refuses = async (run: () => Promise<unknown>, code: string, message: RegExp) =>
  assert.rejects(run, (error: unknown) => error instanceof CrmError && error.code === code && message.test(error.message))

describe('formatting and dates', () => {
  test('money, days and times read the way the mockup writes them', () => {
    assert.equal(euro(28000), '€28,000')
    assert.equal(euroShort(56500), '€56.5k')
    assert.equal(euroShort(72000), '€72k')
    assert.equal(euroShort(900), '€900')
    assert.equal(whenText('2026-11-04T14:32', '2026-11-05'), 'Yesterday, 14:32')
    assert.equal(whenText('2026-11-05T11:00', '2026-11-05'), 'Today, 11:00')
    assert.equal(whenText('2026-10-30T10:00', '2026-11-05'), 'Oct 30, 10:00')
    assert.equal(addDays('2026-11-30', 1), '2026-12-01')
    assert.equal(initialsOf('Alex Morgan'), 'AM')
    assert.equal(initialsOf('Priya'), 'P')
  })

  test('dates and amounts are checked', () => {
    assert.equal(isDay('2026-02-30'), false)
    assert.equal(isDay('2026-11-14'), true)
    assert.equal(cleanStamp('2026-11-14', 'x'), '2026-11-14T09:00')
    assert.throws(() => cleanStamp('tomorrow', 'The due date'), /must be a date/)
    assert.equal(cleanValue('€12,500'), 12500)
    assert.throws(() => cleanValue('-3'), /amount/)
    assert.throws(() => cleanValue(''), /amount/)
  })

  test('a follow-up is overdue, due today, later or done', () => {
    const task = { id: 't', dealId: 'd', title: 'x', channel: 'Email' as const, dueAt: '2026-11-03T14:00', status: 'open' as const }
    assert.equal(taskState(task, '2026-11-05'), 'overdue')
    assert.equal(taskState({ ...task, dueAt: '2026-11-05T18:00' }, '2026-11-05'), 'today')
    assert.equal(taskState({ ...task, dueAt: '2026-11-06T09:00' }, '2026-11-05'), 'later')
    assert.equal(taskState({ ...task, status: 'done' }, '2026-11-05'), 'done')
  })
})

describe('the seed', () => {
  test('is saved on the first open and has the four stages, an unassigned deal and an orphan contact', async () => {
    const { crm, store } = await open()
    assert.equal(store.saved, 1)
    assert.equal(crm.deals().length, 7)
    assert.equal(crm.companies().length, 7)
    assert.equal(crm.contacts().length, 7)
    assert.deepEqual(crm.board().map((c) => c.deals.length), [3, 2, 1, 1])
    assert.equal(crm.filtered({ tab: 'unassigned' }).length, 1)
    assert.deepEqual(crm.orphans().map((c) => c.name), ['Priya Nair'])
    const states = crm.followUps().map((f) => f.state)
    assert.equal(states[0], 'overdue')
    assert.ok(states.includes('today'))
  })

  test('an existing state is opened as it is, and not saved again', async () => {
    const state = seed()
    state.deals = state.deals.slice(0, 2)
    const { crm, store } = await open(state)
    assert.equal(crm.deals().length, 2)
    assert.equal(store.saved, 0)
  })
})

describe('the pipeline', () => {
  test('totals count open deals, weight them by probability and add recent wins', async () => {
    const { crm } = await open()
    const totals = crm.totals()
    assert.equal(totals.pipeline, 180500)
    assert.equal(totals.weighted, 122450)
    assert.equal(totals.expectedThisMonth, 122450)
    assert.equal(totals.wonRecently, 22500)
  })

  test('tabs and search narrow the board', async () => {
    const { crm } = await open()
    assert.equal(crm.filtered({ tab: 'mine' }).length, 4)
    assert.deepEqual(crm.filtered({ q: 'elena' }).map((d) => d.id), ['deal-velocity'])
    assert.deepEqual(crm.filtered({ q: 'nothing like this' }), [])
    assert.deepEqual(crm.tabCounts(), { all: 7, mine: 4, unassigned: 1 })
  })

  test('creating a deal checks the company, the contact, the value and the date', async () => {
    const { crm, store } = await open()
    const deal = await crm.createDeal({ companyId: 'company-acme', title: 'Robot fleet support', value: '9,500', closeDate: '2026-12-01', contactId: 'contact-marc' })
    assert.equal(deal.stage, 'qualified')
    assert.equal(deal.probability, 35)
    assert.equal(store.state?.deals.length, 8)
    assert.equal(crm.activityOf(deal.id)[0]?.body, 'Deal created')
    await refuses(() => crm.createDeal({ companyId: '', title: 'x', value: 1, closeDate: '2026-12-01' }), 'invalid', /Pick a company/)
    await refuses(() => crm.createDeal({ companyId: 'company-nope', title: 'x', value: 1, closeDate: '2026-12-01' }), 'not-found', /company/)
    await refuses(() => crm.createDeal({ companyId: 'company-acme', title: ' ', value: 1, closeDate: '2026-12-01' }), 'invalid', /title is needed/)
    await refuses(() => crm.createDeal({ companyId: 'company-acme', title: 'x', value: 1, closeDate: '2026-12-01', contactId: 'contact-elena' }), 'invalid', /another company/)
    await refuses(() => crm.createDeal({ companyId: 'company-acme', title: 'x', value: 1, closeDate: '2026-13-01' }), 'invalid', /close date/)
    await refuses(() => crm.createDeal({ companyId: 'company-acme', title: 'x', value: 1, closeDate: '2026-12-01', stage: 'won' }), 'invalid', /starts in/)
  })

  test('moving a deal changes its probability and logs it; won and lost need the confirmation', async () => {
    const { crm } = await open()
    const moved = await crm.moveDeal('deal-acme', 'proposal')
    assert.equal(moved.probability, 60)
    assert.match(crm.activityOf('deal-acme')[0]?.body ?? '', /Moved from Qualified to Proposal/)
    await refuses(() => crm.moveDeal('deal-acme', 'won'), 'invalid', /confirmation/)
    await refuses(() => crm.closeDeal('deal-acme', 'won', 'no'), 'invalid', /Confirm/)
    const won = await crm.closeDeal('deal-velocity', 'won', 'yes')
    assert.equal(won.stage, 'won')
    assert.equal(won.closeDate, '2026-11-05')
    assert.equal(crm.nextAction('deal-velocity'), undefined)
    await refuses(() => crm.closeDeal('deal-velocity', 'lost', 'yes', 'x'), 'conflict', /already won/)
    await refuses(() => crm.closeDeal('deal-karo', 'lost', 'yes', ''), 'invalid', /reason/)
    const lost = await crm.closeDeal('deal-karo', 'lost', 'yes', 'Went with an agency')
    assert.equal(lost.lostReason, 'Went with an agency')
    assert.equal(crm.board().flatMap((c) => c.deals).some((d) => d.id === 'deal-karo'), false)
    const reopened = await crm.moveDeal('deal-karo', 'qualified')
    assert.equal(reopened.lostReason, undefined)
    assert.match(crm.activityOf('deal-karo')[0]?.body ?? '', /Reopened/)
  })

  test('owners, close dates, contacts, activity and the next action', async () => {
    const { crm } = await open()
    assert.equal((await crm.assignOwner('deal-fieldnote', 'owner-jl')).ownerId, 'owner-jl')
    assert.equal((await crm.assignOwner('deal-fieldnote', '')).ownerId, undefined)
    await refuses(() => crm.assignOwner('deal-fieldnote', 'owner-x'), 'invalid', /not in the team/)
    assert.equal((await crm.setCloseDate('deal-acme', '2026-12-24')).closeDate, '2026-12-24')
    assert.equal((await crm.setContact('deal-fieldnote', 'contact-priya')).contactId, 'contact-priya')
    await refuses(() => crm.setContact('deal-fieldnote', 'contact-elena'), 'invalid', /another company/)
    await crm.logActivity('deal-acme', { type: 'call', body: 'Demo booked' })
    await refuses(() => crm.logActivity('deal-acme', { type: 'stage', body: 'x' }), 'invalid', /call, email/)
    const first = crm.nextAction('deal-acme')
    const task = await crm.setNextAction('deal-acme', { title: 'Send the demo recording', dueAt: '2026-11-07', channel: 'Email' })
    assert.equal(crm.nextAction('deal-acme')?.id, task.id)
    assert.equal(crm.state.tasks.find((t) => t.id === first?.id)?.status, 'done')
    await crm.completeTask(task.id)
    assert.equal(crm.nextAction('deal-acme'), undefined)
    await refuses(() => crm.completeTask('task-nope'), 'not-found', /follow-up/)
  })
})

describe('contacts and companies', () => {
  test('a contact needs a name and a real email, and is not entered twice', async () => {
    const { crm } = await open()
    const contact = await crm.createContact({ name: 'Lea Brandt', email: 'lea@brandt.example', role: 'COO' })
    assert.equal(contact.companyId, undefined)
    await refuses(() => crm.createContact({ name: 'X', email: 'not-an-email' }), 'invalid', /not an email/)
    await refuses(() => crm.createContact({ name: 'X', email: 'LEA@brandt.example' }), 'conflict', /already a contact/)
    await refuses(() => crm.createContact({ name: '' }), 'invalid', /name is needed/)
    await refuses(() => crm.createCompany({ name: 'acme robotics' }), 'conflict', /already in the CRM/)
  })

  test('a CSV import adds what it can, creates new companies and reports the rest', async () => {
    const { crm } = await open()
    const result = await crm.importContacts('name,email,role,company\nLea Brandt,lea@brandt.example,COO,Brandt Logistics\nBad Row,nope,,\nOle Berg,ole@acme-robotics.example,Engineer,Acme Robotics')
    assert.equal(result.added, 2)
    assert.deepEqual(result.skipped, ['Line 3: nope is not an email address.'])
    assert.ok(crm.companies().some((c) => c.name === 'Brandt Logistics'))
    assert.equal(crm.contactsOf('company-acme').length, 2)
    await refuses(() => crm.importContacts('  \n '), 'invalid', /at least one line/)
  })

  test('the report sums stages, owners, the win rate and the average deal', async () => {
    const { crm } = await open()
    const report = crm.report()
    assert.equal(report.open.count, 6)
    assert.equal(report.won.value, 22500)
    assert.equal(report.winRate, 100)
    assert.equal(report.byOwner.find((o) => o.owner === null)?.count, 1)
    await crm.closeDeal('deal-karo', 'lost', 'yes', 'Timing')
    assert.equal(crm.report().winRate, 50)
  })
})

describe('the JSON file store', () => {
  test('saves, loads, and refuses a file that is not a Small CRM state', async () => {
    const dir = await mkdtemp(join(scratch, 'store-'))
    try {
      const file = join(dir, 'crm.json')
      const store = jsonFileStore<CrmState>(file, 'Small CRM')
      assert.equal(await store.load(), undefined)
      await store.save(seed())
      assert.equal((await store.load())?.deals.length, 7)
      assert.match(await readFile(file, 'utf8'), /"version": 1/)
      await writeFile(file, '{"version":2}')
      await assert.rejects(store.load(), /not a Small CRM state of version 1/)
      await writeFile(file, '{oops')
      await assert.rejects(store.load(), /not valid JSON/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
