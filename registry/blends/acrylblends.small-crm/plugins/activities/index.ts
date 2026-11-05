/**
 * Activities: the follow-up queue (overdue first, then today, then later) and the timeline of everything logged across deals, filterable by type.
 *
 * Routes (under the shell's prefix): GET /activities?type, POST /activities/tasks/:id/complete.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { ActivityType } from '../crm/index.ts'

export const name = 'activities'
export const inject = ['crm', 'shell', 'router']

export function apply(ctx: Context): void {
  const { crm, shell } = ctx
  const { ACTIVITY_TYPES, whenText, isRefusal } = crm.kit
  const e = shell.e
  const prefix = shell.prefix

  const app = new Acryl()
    .get('/activities', (c) => {
      const wanted = c.req.query('type')
      const type = ACTIVITY_TYPES.includes(wanted as ActivityType) ? (wanted as ActivityType) : undefined
      const followUps = crm.followUps()
      const queue =
        followUps.length === 0
          ? '<p class="empty">No open follow-ups. Every deal has its next step done.</p>'
          : `<ul class="list">${followUps.map((f) => `<li>${shell.mark(f.company)}<span><b>${e(f.task.title)}</b><br><small><a href="${shell.href(`/deals/${encodeURIComponent(f.deal.id)}`)}">${e(f.company.name)} · ${e(f.deal.title)}</a> · ${e(whenText(f.task.dueAt, crm.today))} · ${e(f.task.channel)}</small></span>${f.state === 'overdue' ? '<span class="pill lost">Overdue</span>' : f.state === 'today' ? '<span class="pill warn">Today</span>' : '<span class="pill">Later</span>'}<form method="post" action="${shell.href(`/activities/tasks/${encodeURIComponent(f.task.id)}/complete`)}"><button class="btn">Done</button></form></li>`).join('')}</ul>`
      const list = crm.activities(type)
      const filters = `<nav class="tabs" aria-label="Activity types"><a href="${shell.href('/activities')}"${type === undefined ? ' class="on" aria-current="page"' : ''}>All</a>${ACTIVITY_TYPES.map((t) => `<a href="${shell.href(`/activities?type=${t}`)}"${t === type ? ' class="on" aria-current="page"' : ''}>${t[0]?.toUpperCase()}${t.slice(1)}</a>`).join('')}</nav>`
      const timeline =
        list.length === 0
          ? '<p class="empty">Nothing of this type logged yet.</p>'
          : `<ul class="list">${list.map((a) => {
              const deal = crm.deal(a.dealId)
              const company = crm.company(deal.companyId)
              return `<li><span class="pill">${e(a.type)}</span><span>${e(a.body)}<br><small><a href="${shell.href(`/deals/${encodeURIComponent(deal.id)}`)}">${e(company.name)} · ${e(deal.title)}</a> · ${e(whenText(a.at, crm.today))}${a.ownerId === undefined ? '' : ` · ${e(crm.owner(a.ownerId)?.name ?? '')}`}</small></span></li>`
            }).join('')}</ul>`
      const main = `${shell.header({ eyebrow: 'Sales / Activities', title: 'Activities', lead: 'What needs doing next, and everything that happened.' })}${shell.notice(c.req.url)}<section class="panel"><h2>Follow-up queue</h2>${queue}</section><section class="panel"><h2>Timeline</h2>${filters}${timeline}</section>`
      return c.html(shell.page({ active: 'activities', title: 'Activities', main }))
    })
    .post('/activities/tasks/:id/complete', async (c) => {
      try {
        await crm.completeTask(c.req.param('id'))
        return c.redirect(shell.url('/activities', { kind: 'ok', text: 'Follow-up marked complete.' }), 303)
      } catch (error) {
        if (!(isRefusal(error))) throw error
        return c.redirect(shell.url('/activities', { kind: 'error', text: error.message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() =>
    shell.nav({ id: 'activities', label: 'Activities', icon: '◷', path: '/activities', order: 40, count: () => crm.followUps().filter((f) => f.state !== 'later').length }),
  )
}
