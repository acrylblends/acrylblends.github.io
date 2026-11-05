import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { FRAME_MOUNT_PREFIX } from '../src/routes.ts'
import { noticeOf, withApp } from './support.ts'

describe('pipeline', () => {
  test('/ goes to the pipeline, which shows the seeded board, the totals and the inspector on today\'s follow-up', () =>
    withApp(async (app) => {
      const root = await app.root.router.request('/')
      assert.equal(root.status, 302)
      assert.equal(root.headers.get('location'), '/pipeline')
      const { status, html } = await app.page('/pipeline')
      assert.equal(status, 200)
      assert.match(html, /<h1>Deals pipeline<\/h1>/)
      assert.match(html, /All deals <i>7<\/i>/)
      assert.match(html, /€180,500/)
      for (const name of ['Acme Robotics', 'Nordic Freight', 'Fieldnote GmbH', 'Studio Karo', 'Meridian Foods', 'Lakehouse Labs']) assert.match(html, new RegExp(name))
      assert.match(html, /class="card chosen"[^>]*data-deal="deal-velocity"/)
      assert.match(html, /Follow up on proposal/)
      assert.match(html, /<span class="late">Overdue<\/span>/)
      assert.match(html, /Unassigned · Due Nov 24/)
    }))

  test('tabs, search and the empty filter', () =>
    withApp(async (app) => {
      const mine = await app.page('/pipeline?tab=unassigned')
      assert.match(mine.html, /Fieldnote GmbH/)
      assert.doesNotMatch(mine.html, /data-deal="deal-acme"/)
      const found = await app.page('/pipeline?q=meridian')
      assert.match(found.html, /data-deal="deal-meridian"/)
      assert.doesNotMatch(found.html, /data-deal="deal-acme"/)
      const none = await app.page('/pipeline?q=%3Cscript%3E')
      assert.match(none.html, /No deals match “&lt;script&gt;”/)
    }))

  test('adding a deal, with the form and its errors', () =>
    withApp(async (app) => {
      const form = await app.page('/pipeline?new=1&stage=proposal')
      assert.match(form.html, /id="new-deal"/)
      assert.match(form.html, /<option value="proposal" selected>/)
      const bad = await app.post('/pipeline/deals', { companyId: 'company-acme', title: '', value: '10', closeDate: '2026-12-01', back: '/pipeline' })
      assert.deepEqual(noticeOf(bad), { kind: 'error', text: 'The deal title is needed.', path: '/pipeline' })
      assert.match(bad.headers.get('location') ?? '', /new=1/)
      const ok = await app.post('/pipeline/deals', { companyId: 'company-acme', title: 'Spare parts portal', value: '8000', closeDate: '2026-12-01', stage: 'proposal', ownerId: 'owner-jl' })
      assert.equal(noticeOf(ok).kind, 'ok')
      const deal = app.root.crm.deals().find((d) => d.title === 'Spare parts portal')
      assert.equal(deal?.stage, 'proposal')
      assert.match(ok.headers.get('location') ?? '', new RegExp(`deal=${deal?.id}`))
    }))

  test('stage, owner and complete from the inspector; won asks for the confirmation', () =>
    withApp(async (app) => {
      const moved = await app.post('/pipeline/deals/deal-acme/stage', { stage: 'negotiation', back: '/pipeline?deal=deal-acme' })
      assert.deepEqual(noticeOf(moved), { kind: 'ok', text: 'Moved to Negotiation.', path: '/pipeline' })
      assert.equal(app.root.crm.deal('deal-acme').stage, 'negotiation')
      const won = await app.post('/pipeline/deals/deal-acme/stage', { stage: 'won' })
      assert.equal(won.headers.get('location'), '/deals/deal-acme?confirm=won')
      assert.equal(app.root.crm.deal('deal-acme').stage, 'negotiation')
      const owner = await app.post('/pipeline/deals/deal-fieldnote/owner', { ownerId: 'owner-am' })
      assert.equal(noticeOf(owner).text, 'Assigned to Alex Morgan.')
      const done = await app.post('/pipeline/deals/deal-velocity/complete', { taskId: 'task-1' })
      assert.equal(noticeOf(done).text, 'Follow-up marked complete.')
      const missing = await app.post('/pipeline/deals/deal-nope/stage', { stage: 'proposal' })
      assert.equal(noticeOf(missing).kind, 'error')
      const offsite = await app.post('/pipeline/deals/deal-acme/stage', { stage: 'proposal', back: '//evil.example/' })
      assert.equal(noticeOf(offsite).path, '/pipeline')
    }))
})

describe('deal page', () => {
  test('shows the deal, its next action and activity; 404 for an unknown deal', () =>
    withApp(async (app) => {
      const { status, html } = await app.page('/deals/deal-velocity')
      assert.equal(status, 200)
      assert.match(html, /<h1>Customer portal redesign<\/h1>/)
      assert.match(html, /Follow up on proposal/)
      assert.match(html, /Proposal sent/)
      assert.equal((await app.page('/deals/deal-nope')).status, 404)
    }))

  test('won and lost confirmation, then reopening', () =>
    withApp(async (app) => {
      const ask = await app.page('/deals/deal-karo?confirm=lost')
      assert.match(ask.html, /Mark this deal as lost\?/)
      const noReason = await app.post('/deals/deal-karo/close', { outcome: 'lost', confirmed: 'yes', reason: '' })
      assert.equal(noticeOf(noReason).kind, 'error')
      assert.match(noReason.headers.get('location') ?? '', /confirm=lost/)
      const lost = await app.post('/deals/deal-karo/close', { outcome: 'lost', confirmed: 'yes', reason: 'Budget cut' })
      assert.equal(noticeOf(lost).text, 'Marked lost.')
      assert.match((await app.page('/deals/deal-karo')).html, /Budget cut/)
      const won = await app.post('/deals/deal-meridian/close', { outcome: 'won', confirmed: 'yes' })
      assert.equal(noticeOf(won).text, 'Marked won. Well done.')
      const reopen = await app.post('/deals/deal-karo/stage', { stage: 'qualified' })
      assert.equal(noticeOf(reopen).text, 'Moved to Qualified.')
      assert.equal(app.root.crm.deal('deal-karo').stage, 'qualified')
    }))

  test('owner, close date, contact, activity, next action and completing it', () =>
    withApp(async (app) => {
      assert.equal(noticeOf(await app.post('/deals/deal-fieldnote/owner', { ownerId: 'owner-jl' })).text, 'Assigned to Jamie Lee.')
      assert.equal(noticeOf(await app.post('/deals/deal-fieldnote/close-date', { closeDate: '2026-12-02' })).text, 'Close date saved.')
      assert.equal(noticeOf(await app.post('/deals/deal-fieldnote/close-date', { closeDate: 'soon' })).kind, 'error')
      assert.equal(noticeOf(await app.post('/deals/deal-fieldnote/contact', { contactId: 'contact-priya' })).text, 'Contact saved.')
      assert.equal(noticeOf(await app.post('/deals/deal-fieldnote/activity', { type: 'call', body: 'Intro call' })).text, 'Activity logged.')
      assert.equal(noticeOf(await app.post('/deals/deal-fieldnote/next-action', { title: 'Send a proposal', dueAt: '2026-11-09', channel: 'Email' })).text, 'Next action set.')
      const task = app.root.crm.nextAction('deal-fieldnote')
      assert.equal(task?.title, 'Send a proposal')
      assert.equal(noticeOf(await app.post(`/deals/deal-fieldnote/tasks/${task?.id}/complete`, {})).text, 'Follow-up marked complete.')
      assert.equal(app.root.crm.nextAction('deal-fieldnote'), undefined)
      assert.equal(noticeOf(await app.post('/deals/deal-nope/owner', { ownerId: '' })).path, '/pipeline')
    }))
})

describe('contacts, companies, activities and reports', () => {
  test('contacts: list, orphans, search, add and import', () =>
    withApp(async (app) => {
      const list = await app.page('/contacts')
      assert.match(list.html, /Elena Fischer/)
      assert.match(list.html, /No company <i>1<\/i>/)
      const orphans = await app.page('/contacts?orphans=1')
      assert.match(orphans.html, /Priya Nair/)
      assert.doesNotMatch(orphans.html, /Elena Fischer/)
      assert.match((await app.page('/contacts?q=zzz')).html, /No contacts match/)
      assert.equal(noticeOf(await app.post('/contacts', { name: 'Lea Brandt', email: 'lea@brandt.example', companyId: '' })).text, 'Lea Brandt was added.')
      assert.equal(noticeOf(await app.post('/contacts', { name: 'X', email: 'bad' })).kind, 'error')
      const imported = await app.post('/contacts/import', { csv: 'Ole Berg,ole@berg.example,CEO,Berg AS\nNo Mail,bad,,' })
      assert.equal(noticeOf(imported).kind, 'warn')
      assert.match(noticeOf(imported).text, /1 contact imported\. Skipped Line 2/)
    }))

  test('companies: list, profile, add a company and a contact; 404 for an unknown one', () =>
    withApp(async (app) => {
      assert.match((await app.page('/companies')).html, /Meridian Foods/)
      const profile = await app.page('/companies/company-velocity')
      assert.match(profile.html, /Customer portal redesign/)
      assert.match(profile.html, /Elena Fischer/)
      assert.equal((await app.page('/companies/company-nope')).status, 404)
      const added = await app.post('/companies', { name: 'Brandt Logistics', industry: 'Logistics' })
      assert.equal(noticeOf(added).text, 'Brandt Logistics was added.')
      assert.equal(noticeOf(await app.post('/companies', { name: 'Acme Robotics' })).kind, 'error')
      const contact = await app.post('/companies/company-acme/contacts', { name: 'Ole Berg', email: 'ole@acme-robotics.example' })
      assert.equal(noticeOf(contact).path, '/companies/company-acme')
      assert.equal(noticeOf(await app.post('/companies/company-nope/contacts', { name: 'X' })).path, '/companies')
    }))

  test('activities: the follow-up queue (overdue first), the timeline filter and completing', () =>
    withApp(async (app) => {
      const { html } = await app.page('/activities')
      assert.ok(html.indexOf('Chase the sample fleet data') < html.indexOf('Follow up on proposal'))
      assert.match(html, /Overdue/)
      const calls = await app.page('/activities?type=call')
      assert.match(calls.html, /Discovery call/)
      assert.doesNotMatch(calls.html, /Proposal sent</)
      assert.equal(noticeOf(await app.post('/activities/tasks/task-3/complete', {})).text, 'Follow-up marked complete.')
      assert.equal(noticeOf(await app.post('/activities/tasks/task-nope/complete', {})).kind, 'error')
    }))

  test('reports: stages, owners and the win rate', () =>
    withApp(async (app) => {
      const { html } = await app.page('/reports')
      assert.match(html, /Pipeline report/)
      assert.match(html, /€180,500/)
      assert.match(html, /100%/)
      assert.match(html, /Unassigned/)
    }))

  test('under the frame prefix every link and redirect carries it', () =>
    withApp(
      async (app) => {
        const { html } = await app.page('/pipeline')
        assert.match(html, new RegExp(`href="${FRAME_MOUNT_PREFIX}/contacts"`))
        const moved = await app.post('/pipeline/deals/deal-acme/stage', { stage: 'proposal', back: '/pipeline' })
        assert.match(moved.headers.get('location') ?? '', new RegExp(`^${FRAME_MOUNT_PREFIX}/pipeline\\?ok=`))
      },
      { prefix: FRAME_MOUNT_PREFIX },
    ))
})
