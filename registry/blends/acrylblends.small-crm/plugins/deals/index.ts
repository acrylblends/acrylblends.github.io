/**
 * The deal page: one deal in full (value, stage, owner, close date, contact), its next action, the activity log and the won / lost confirmation.
 *
 * Routes (under the shell's prefix): GET /deals/:id?confirm=won|lost, POST /deals/:id/stage|owner|close-date|contact|activity|next-action|close|tasks/:taskId/complete.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'

export const name = 'deals'
export const inject = ['crm', 'shell', 'router']

export function apply(ctx: Context): void {
  const { crm, shell } = ctx
  const { CHANNELS, euro, isOpen, longDay, OPEN_STAGES, STAGE_LABEL, taskState, whenText, isRefusal } = crm.kit
  const e = shell.e
  const prefix = shell.prefix
  const link = (id: string, tail = '') => `/deals/${encodeURIComponent(id)}${tail}`

  const app = new Acryl()
    .get('/deals/:id', (c) => {
      let deal: ReturnType<typeof crm.deal>
      try {
        deal = crm.deal(c.req.param('id'))
      } catch {
        return c.html(shell.page({ active: 'pipeline', title: 'Deal not found', main: `${shell.header({ eyebrow: 'Sales / Deals', title: 'Deal not found' })}<p class="empty">That deal does not exist. <a href="${shell.href('/pipeline')}">Back to the pipeline</a></p>` }), 404)
      }
      const company = crm.company(deal.companyId)
      const owner = crm.owner(deal.ownerId)
      const contact = deal.contactId === undefined ? undefined : crm.contact(deal.contactId)
      const task = crm.nextAction(deal.id)
      const open = isOpen(deal.stage)
      const confirm = c.req.query('confirm')
      const here = link(deal.id)
      const stage = open
        ? `<form class="row" method="post" action="${shell.href(link(deal.id, '/stage'))}"><label>Stage<select name="stage">${[...OPEN_STAGES].map((s) => `<option value="${s}"${s === deal.stage ? ' selected' : ''}>${STAGE_LABEL[s]}</option>`).join('')}</select></label><button class="btn">Move</button></form>`
        : `<p>${deal.stage === 'won' ? '<span class="pill won">Won</span>' : '<span class="pill lost">Lost</span>'} ${e(longDay(deal.closeDate))}${deal.lostReason === undefined ? '' : ` · ${e(deal.lostReason)}`}</p><form method="post" action="${shell.href(link(deal.id, '/stage'))}"><input type="hidden" name="stage" value="qualified"><button class="btn">Reopen in Qualified</button></form>`
      const companyContacts = crm.contacts().filter((x) => x.companyId === deal.companyId || x.companyId === undefined)
      const confirmPanel =
        (confirm === 'won' || confirm === 'lost') && open
          ? `<section class="panel confirm" aria-label="Confirm"><h2>${confirm === 'won' ? 'Mark this deal as won?' : 'Mark this deal as lost?'}</h2><p>${e(company.name)} · ${euro(deal.value)}. ${confirm === 'won' ? 'It moves to Won with a close date of today.' : 'It leaves the board; a reason keeps the history honest.'} Open follow-ups are closed with it.</p><form class="row" method="post" action="${shell.href(link(deal.id, '/close'))}"><input type="hidden" name="outcome" value="${confirm}"><input type="hidden" name="confirmed" value="yes">${confirm === 'lost' ? '<label>Why was it lost?<input name="reason" required maxlength="200" placeholder="Budget, timing, a competitor…"></label>' : ''}<button class="btn ${confirm === 'won' ? 'primary' : 'danger'}">Yes, mark ${confirm}</button> <a class="btn" href="${shell.href(here)}">Cancel</a></form></section>`
          : ''
      const actions = open ? `<a class="btn primary" href="${shell.href(`${here}?confirm=won`)}">Mark won</a><a class="btn danger" href="${shell.href(`${here}?confirm=lost`)}">Mark lost</a>` : ''
      const next = open
        ? `<section class="panel"><h2>Next action</h2>${task === undefined ? '<p class="hint">No next action. Set one so the deal does not stall.</p>' : `<p><b>${e(task.title)}</b><br>${taskState(task, crm.today) === 'overdue' ? '<span class="pill lost">Overdue</span> ' : ''}${e(whenText(task.dueAt, crm.today))} · ${e(task.channel)}</p><form method="post" action="${shell.href(link(deal.id, `/tasks/${encodeURIComponent(task.id)}/complete`))}"><button class="btn primary">Mark complete</button></form>`}<form class="row" method="post" action="${shell.href(link(deal.id, '/next-action'))}"><label>Action<input name="title" required maxlength="120" placeholder="Send the revised quote"></label><label>When<input name="dueAt" type="date" required value="${e(crm.today)}"></label><label>Channel<select name="channel">${CHANNELS.map((x) => `<option>${x}</option>`).join('')}</select></label><button class="btn">${task === undefined ? 'Set next action' : 'Replace next action'}</button></form></section>`
        : ''
      const log = `<section class="panel"><h2>Activity</h2><form class="row" method="post" action="${shell.href(link(deal.id, '/activity'))}"><label>Type<select name="type"><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="note">Note</option></select></label><label>What happened<input name="body" required maxlength="300" size="40"></label><button class="btn">Log activity</button></form><ul class="list">${crm.activityOf(deal.id).map((a) => `<li><span class="pill">${e(a.type)}</span><span>${e(a.body)}<br><small>${e(whenText(a.at, crm.today))}${a.ownerId === undefined ? '' : ` · ${e(crm.owner(a.ownerId)?.name ?? '')}`}</small></span></li>`).join('')}</ul></section>`
      const details = `<section class="panel"><h2>Details</h2><div class="two"><div><span class="kicker">Company</span><p><a href="${shell.href(`/companies/${encodeURIComponent(company.id)}`)}">${e(company.name)} ↗</a></p><span class="kicker">Value</span><p><b>${euro(deal.value)}</b> · ${deal.probability}%</p><span class="kicker">Close date</span><form class="row" method="post" action="${shell.href(link(deal.id, '/close-date'))}"><input type="date" name="closeDate" value="${e(deal.closeDate)}" aria-label="Close date"><button class="btn">Save</button></form></div><div><span class="kicker">Owner</span><form class="row" method="post" action="${shell.href(link(deal.id, '/owner'))}"><select name="ownerId" aria-label="Owner"><option value=""${owner === undefined ? ' selected' : ''}>Unassigned</option>${crm.owners().map((o) => `<option value="${e(o.id)}"${o.id === deal.ownerId ? ' selected' : ''}>${e(o.name)}</option>`).join('')}</select><button class="btn">Save</button></form><span class="kicker">Contact</span><form class="row" method="post" action="${shell.href(link(deal.id, '/contact'))}"><select name="contactId" aria-label="Contact"><option value="">No contact yet</option>${companyContacts.map((x) => `<option value="${e(x.id)}"${x.id === contact?.id ? ' selected' : ''}>${e(x.name)}${x.companyId === undefined ? ' (no company)' : ''}</option>`).join('')}</select><button class="btn">Save</button></form></div></div>${stage}</section>`
      const main = `<p class="crumbs"><a href="${shell.href('/pipeline')}">Pipeline</a> / ${e(company.name)}</p>${shell.header({ eyebrow: `Deal · ${STAGE_LABEL[deal.stage]}`, title: deal.title, lead: `${company.name} · ${euro(deal.value)}`, actions })}${shell.notice(c.req.url)}${confirmPanel}${details}${next}${log}`
      return c.html(shell.page({ active: 'pipeline', title: deal.title, main }))
    })

  /** Run a change, then go back to the deal with a notice. */
  const change =
    (path: string, run: (id: string, form: Record<string, unknown>) => Promise<string>) =>
    async (c: { req: { param(name: string): string; parseBody(): Promise<Record<string, unknown>> }; redirect(url: string, status: 303): Response }) => {
      const id = c.req.param('id')
      const form = await c.req.parseBody()
      try {
        return c.redirect(shell.url(link(id), { kind: 'ok', text: await run(id, form) }), 303)
      } catch (error) {
        if (!(isRefusal(error))) throw error
        if (error.code === 'not-found') return c.redirect(shell.url('/pipeline', { kind: 'error', text: error.message }), 303)
        return c.redirect(shell.url(`${link(id)}${path}`, { kind: 'error', text: error.message }), 303)
      }
    }

  app
    .post('/deals/:id/stage', change('', async (id, form) => {
      if (form.stage === 'won' || form.stage === 'lost') return `Confirm to mark the deal ${form.stage}.`
      return `Moved to ${STAGE_LABEL[(await crm.moveDeal(id, form.stage)).stage]}.`
    }))
    .post('/deals/:id/owner', change('', async (id, form) => {
      const deal = await crm.assignOwner(id, form.ownerId)
      return deal.ownerId === undefined ? 'The deal is unassigned.' : `Assigned to ${crm.owner(deal.ownerId)?.name}.`
    }))
    .post('/deals/:id/close-date', change('', async (id, form) => {
      await crm.setCloseDate(id, form.closeDate)
      return 'Close date saved.'
    }))
    .post('/deals/:id/contact', change('', async (id, form) => {
      await crm.setContact(id, form.contactId)
      return 'Contact saved.'
    }))
    .post('/deals/:id/activity', change('', async (id, form) => {
      await crm.logActivity(id, { type: form.type, body: form.body })
      return 'Activity logged.'
    }))
    .post('/deals/:id/next-action', change('', async (id, form) => {
      await crm.setNextAction(id, { title: form.title, dueAt: form.dueAt, channel: form.channel })
      return 'Next action set.'
    }))
    .post('/deals/:id/close', async (c) => {
      const id = c.req.param('id')
      const form = await c.req.parseBody()
      try {
        const deal = await crm.closeDeal(id, form.outcome, form.confirmed, form.reason)
        return c.redirect(shell.url(link(id), { kind: 'ok', text: deal.stage === 'won' ? 'Marked won. Well done.' : 'Marked lost.' }), 303)
      } catch (error) {
        if (!(isRefusal(error))) throw error
        const back = error.code === 'not-found' ? '/pipeline' : `${link(id)}?confirm=${String(form.outcome)}`
        return c.redirect(shell.url(back, { kind: 'error', text: error.message }), 303)
      }
    })
    .post('/deals/:id/tasks/:taskId/complete', async (c) => {
      const id = c.req.param('id')
      try {
        await crm.completeTask(c.req.param('taskId'))
        return c.redirect(shell.url(link(id), { kind: 'ok', text: 'Follow-up marked complete.' }), 303)
      } catch (error) {
        if (!(isRefusal(error))) throw error
        return c.redirect(shell.url(link(id), { kind: 'error', text: error.message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
