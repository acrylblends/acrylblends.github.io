/**
 * The pipeline page: the deals board (four stages, drag a card to change its stage), the totals above it, the right-hand inspector for the selected deal
 * and the form that adds a deal. It is the default work surface, so it also answers `/` with a redirect to it.
 *
 * Routes (under the shell's prefix): GET /, GET /pipeline?tab&q&deal&new&stage, POST /pipeline/deals, POST /pipeline/deals/:id/stage|owner|complete.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { BoardColumn, Deal, Stage } from '../crm/index.ts'

export const name = 'pipeline'
export const inject = ['crm', 'shell', 'router']

type Tab = 'all' | 'mine' | 'unassigned'
const tabOf = (value: string | undefined): Tab => (value === 'mine' || value === 'unassigned' ? value : 'all')

const CLIENT_SCRIPT = `<script>
(function(){
  var dragged=null;
  document.querySelectorAll('.card[data-deal]').forEach(function(card){
    card.addEventListener('dragstart',function(e){dragged=card;card.classList.add('dragging');e.dataTransfer.setData('text/plain',card.dataset.deal);e.dataTransfer.effectAllowed='move'});
    card.addEventListener('dragend',function(){card.classList.remove('dragging');document.querySelectorAll('.stage.over').forEach(function(s){s.classList.remove('over')})});
  });
  document.querySelectorAll('.stage[data-stage]').forEach(function(stage){
    stage.addEventListener('dragover',function(e){if(dragged){e.preventDefault();stage.classList.add('over')}});
    stage.addEventListener('dragleave',function(){stage.classList.remove('over')});
    stage.addEventListener('drop',function(e){
      e.preventDefault();stage.classList.remove('over');
      if(!dragged||dragged.closest('.stage')===stage)return;
      var body=new URLSearchParams({stage:stage.dataset.stage,back:location.pathname.replace(/^.*?(\\/pipeline)/,'$1')+location.search});
      fetch(dragged.dataset.move,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:body}).then(function(r){location.href=r.url});
    });
  });
})();
</script>`

export function apply(ctx: Context): void {
  const { crm, shell } = ctx
  const { euro, euroShort, isOpen, longDay, OPEN_STAGES, shortDay, STAGE_LABEL, taskState, whenText, isRefusal } = crm.kit
  const e = shell.e
  const prefix = shell.prefix

  const dueText = (deal: Deal): string => {
    if (deal.stage === 'won') return `Won ${shortDay(deal.closeDate)}`
    const task = crm.nextAction(deal.id)
    if (task !== undefined) {
      const state = taskState(task, crm.today)
      if (state === 'overdue') return '<span class="late">Overdue</span>'
      if (state === 'today') return '<span class="soon">Follow up today</span>'
    }
    return `Due ${shortDay(deal.closeDate)}`
  }

  const query = (parts: Record<string, string | undefined>): string => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(parts)) if (value !== undefined && value !== '' && !(key === 'tab' && value === 'all')) search.set(key, value)
    const text = search.toString()
    return text === '' ? '' : `?${text}`
  }

  const card = (deal: Deal, chosen: string | undefined, keep: { tab: Tab; q: string }): string => {
    const company = crm.company(deal.companyId)
    const owner = crm.owner(deal.ownerId)
    return `<a class="card${deal.id === chosen ? ' chosen' : ''}" href="${shell.href(`/pipeline${query({ ...keep, deal: deal.id })}`)}" draggable="true" data-deal="${e(deal.id)}" data-move="${shell.href(`/pipeline/deals/${encodeURIComponent(deal.id)}/stage`)}" data-row>${shell.mark(company)}<b>${e(company.name)}</b><small>${e(deal.title)}</small><strong>${euro(deal.value)}</strong><footer>${e(owner?.initials ?? 'Unassigned')} · ${dueText(deal)} <span class="pct">${deal.probability}%</span></footer></a>`
  }

  const column = (col: BoardColumn, chosen: string | undefined, keep: { tab: Tab; q: string }): string =>
    `<div class="stage" data-stage="${col.stage}"><header><b>${e(col.label)}</b><i>${col.deals.length}</i><strong>${euroShort(col.total)}</strong></header>${col.deals.map((deal) => card(deal, chosen, keep)).join('')}${col.stage === 'won' ? '' : `<a class="add" href="${shell.href(`/pipeline${query({ ...keep, new: '1', stage: col.stage })}`)}#new-deal">＋ Add deal</a>`}</div>`

  const inspector = (deal: Deal | undefined, back: string): string => {
    if (deal === undefined) return `<aside class="inspector" aria-label="Deal details"><span class="kicker">Deal details</span><p class="hint">Select a deal to see its value, owner, next action and history.</p></aside>`
    const company = crm.company(deal.companyId)
    const contact = deal.contactId === undefined ? undefined : crm.contact(deal.contactId)
    const task = crm.nextAction(deal.id)
    const act = crm.activityOf(deal.id).slice(0, 3)
    const id = encodeURIComponent(deal.id)
    const stageSelect = isOpen(deal.stage)
      ? `<form method="post" action="${shell.href(`/pipeline/deals/${id}/stage`)}"><input type="hidden" name="back" value="${e(back)}"><select name="stage" aria-label="Stage" onchange="this.form.submit()">${[...OPEN_STAGES, 'won'].map((s) => `<option value="${s}"${s === deal.stage ? ' selected' : ''}>${STAGE_LABEL[s as Stage]}</option>`).join('')}</select><noscript><button>Move</button></noscript></form>`
      : `<b>${STAGE_LABEL[deal.stage]}</b>`
    const ownerSelect = `<form method="post" action="${shell.href(`/pipeline/deals/${id}/owner`)}"><input type="hidden" name="back" value="${e(back)}"><select name="ownerId" aria-label="Owner" onchange="this.form.submit()"><option value=""${deal.ownerId === undefined ? ' selected' : ''}>Unassigned</option>${crm.owners().map((o) => `<option value="${e(o.id)}"${o.id === deal.ownerId ? ' selected' : ''}>${e(o.name)}</option>`).join('')}</select><noscript><button>Assign</button></noscript></form>`
    const nextBlock =
      task === undefined
        ? `<div class="next"><span class="kicker">Next action</span><b>None set</b><span>${isOpen(deal.stage) ? 'Set one on the deal page.' : 'The deal is closed.'}</span></div>`
        : `<div class="next"><span class="kicker">Next action</span><b>${e(task.title)}</b><span${taskState(task, crm.today) === 'overdue' ? ' class="late"' : ''}>${taskState(task, crm.today) === 'overdue' ? 'Overdue · ' : ''}${e(whenText(task.dueAt, crm.today))} · ${e(task.channel)}</span><form method="post" action="${shell.href(`/pipeline/deals/${id}/complete`)}"><input type="hidden" name="back" value="${e(back)}"><input type="hidden" name="taskId" value="${e(task.id)}"><button>Mark complete</button></form></div>`
    return `<aside class="inspector" aria-label="Deal details"><span class="kicker">Deal details</span><div class="dtitle">${shell.mark(company, true)}<span><b>${e(company.name)}</b><small>${e(deal.title)}</small></span></div><div class="amount"><span class="kicker">Deal value</span><b>${euro(deal.value)}</b><span>${e(STAGE_LABEL[deal.stage])} · ${deal.probability}% probability</span></div><div class="fields"><div><span class="kicker">Stage</span>${stageSelect}</div><div><span class="kicker">Owner</span>${ownerSelect}</div><div><span class="kicker">Close date</span><b>${e(longDay(deal.closeDate))}</b></div><div><span class="kicker">Company</span><b><a href="${shell.href(`/companies/${encodeURIComponent(company.id)}`)}">${e(company.name)} ↗</a></b></div><div><span class="kicker">Contact</span><b>${contact === undefined ? 'No contact yet' : e(contact.name)}</b></div></div>${nextBlock}<div class="activity"><span class="kicker">Recent activity</span>${act.length === 0 ? '<p>No activity yet.</p>' : act.map((a) => `<p>● &nbsp;${e(a.body)}<span>${e(whenText(a.at, crm.today))}</span></p>`).join('')}</div><p><a class="btn" href="${shell.href(`/deals/${id}`)}">Open the deal →</a></p></aside>`
  }

  const newDealForm = (stage: string | undefined, keep: { tab: Tab; q: string }): string =>
    `<section class="panel" id="new-deal"><h2>Add a deal</h2><form class="row" method="post" action="${shell.href('/pipeline/deals')}"><label>Company<select name="companyId" required><option value="">Pick a company…</option>${crm.companies().map((c) => `<option value="${e(c.id)}">${e(c.name)}</option>`).join('')}</select></label><label>Deal<input name="title" required maxlength="120" placeholder="What is being sold"></label><label>Value (EUR)<input name="value" required inputmode="numeric" placeholder="12000"></label><label>Close date<input name="closeDate" type="date" required value="${e(crm.today)}"></label><label>Stage<select name="stage">${OPEN_STAGES.map((s) => `<option value="${s}"${s === stage ? ' selected' : ''}>${STAGE_LABEL[s]}</option>`).join('')}</select></label><label>Owner<select name="ownerId"><option value="">Unassigned</option>${crm.owners().map((o) => `<option value="${e(o.id)}"${o.id === crm.me().id ? ' selected' : ''}>${e(o.name)}</option>`).join('')}</select></label><input type="hidden" name="back" value="/pipeline${e(query(keep))}"><button class="btn primary">Add deal</button> <a class="btn" href="${shell.href(`/pipeline${query(keep)}`)}">Cancel</a></form><p class="hint">The company must exist. <a href="${shell.href('/companies')}">Add a company</a> first if it is new.</p></section>`

  const app = new Acryl()
    .get('/', (c) => c.redirect(shell.href('/pipeline'), 302))
    .get('/pipeline', (c) => {
      const tab = tabOf(c.req.query('tab'))
      const q = (c.req.query('q') ?? '').slice(0, 80)
      const filter = { tab, q, me: crm.me().id }
      const keep = { tab, q }
      const board = crm.board(filter)
      const shown = board.flatMap((col) => col.deals)
      const requested = c.req.query('deal')
      const due = crm.followUps().find((f) => f.state === 'today' && shown.some((d) => d.id === f.deal.id))
      const chosen = shown.find((d) => d.id === requested) ?? shown.find((d) => d.id === due?.deal.id) ?? shown[0]
      const totals = crm.totals(filter)
      const counts = crm.tabCounts()
      const back = `/pipeline${query({ ...keep, deal: chosen?.id })}`
      const tabLink = (id: Tab, label: string, count: number) => `<a href="${shell.href(`/pipeline${query({ tab: id, q })}`)}"${id === tab ? ' class="on" aria-current="page"' : ''}>${label} <i>${count}</i></a>`
      const empty = shown.length === 0 ? `<p class="empty">No deals match${q === '' ? '' : ` “${e(q)}”`}${tab === 'all' ? '' : ' in this view'}. <a href="${shell.href('/pipeline')}">Show all deals</a></p>` : ''
      const main = `${shell.header({ eyebrow: 'Sales / Pipeline', title: 'Deals pipeline', lead: "See what's moving, what needs attention, and what closes next.", actions: `<a class="btn" href="${shell.href('/contacts#import')}">↥ Import</a><a class="btn primary" href="${shell.href(`/pipeline${query({ ...keep, new: '1' })}`)}#new-deal">＋ Add deal</a>` })}${shell.notice(c.req.url)}${c.req.query('new') === '1' ? newDealForm(c.req.query('stage'), keep) : ''}<nav class="tabs" aria-label="Deal views">${tabLink('all', 'All deals', counts.all)}${tabLink('mine', 'My deals', counts.mine)}${tabLink('unassigned', 'Unassigned', counts.unassigned)}<form method="get" action="${shell.href('/pipeline')}" role="search">${tab === 'all' ? '' : `<input type="hidden" name="tab" value="${tab}">`}<input name="q" value="${e(q)}" placeholder="Search deals…" aria-label="Search deals" maxlength="80"><button class="btn">Search</button></form></nav><div class="totals"><div><span class="kicker">Pipeline value</span><b>${euro(totals.pipeline)}</b></div><div><span class="kicker">Weighted value</span><b>${euro(totals.weighted)}</b></div><div><span class="kicker">Expected this month</span><b>${euro(totals.expectedThisMonth)}</b></div><div><span class="kicker">Won, last 30 days</span><b class="green">${euro(totals.wonRecently)}</b></div></div>${empty}<section class="board" aria-label="Deals by stage">${board.map((col) => column(col, chosen?.id, keep)).join('')}</section><p class="hint">Drag a deal to change stage · Select a card to inspect relationship history</p>`
      return c.html(shell.page({ active: 'pipeline', title: 'Deals pipeline', main, aside: inspector(chosen, back), scripts: CLIENT_SCRIPT }))
    })
    .post('/pipeline/deals', async (c) => {
      const form = await c.req.parseBody()
      const back = shell.back(form.back, '/pipeline')
      try {
        const deal = await crm.createDeal({
          companyId: form.companyId,
          title: form.title,
          value: form.value,
          closeDate: form.closeDate,
          stage: form.stage,
          ownerId: form.ownerId,
        })
        return c.redirect(shell.url(`/pipeline?deal=${encodeURIComponent(deal.id)}`, { kind: 'ok', text: `${crm.company(deal.companyId).name} was added to ${STAGE_LABEL[deal.stage]}.` }), 303)
      } catch (error) {
        if (!(isRefusal(error))) throw error
        const sep = back.includes('?') ? '&' : '?'
        return c.redirect(shell.url(`${back}${sep}new=1`, { kind: 'error', text: error.message }), 303)
      }
    })
    .post('/pipeline/deals/:id/stage', async (c) => {
      const form = await c.req.parseBody()
      const back = shell.back(form.back, '/pipeline')
      const id = c.req.param('id')
      try {
        if (form.stage === 'won' || form.stage === 'lost') {
          crm.deal(id)
          return c.redirect(shell.url(`/deals/${encodeURIComponent(id)}?confirm=${form.stage}`), 303)
        }
        const deal = await crm.moveDeal(id, form.stage)
        return c.redirect(shell.url(back, { kind: 'ok', text: `Moved to ${STAGE_LABEL[deal.stage]}.` }), 303)
      } catch (error) {
        if (!(isRefusal(error))) throw error
        return c.redirect(shell.url(back, { kind: 'error', text: error.message }), 303)
      }
    })
    .post('/pipeline/deals/:id/owner', async (c) => {
      const form = await c.req.parseBody()
      const back = shell.back(form.back, '/pipeline')
      try {
        const deal = await crm.assignOwner(c.req.param('id'), form.ownerId)
        const owner = crm.owner(deal.ownerId)
        return c.redirect(shell.url(back, { kind: 'ok', text: owner === undefined ? 'The deal is unassigned.' : `Assigned to ${owner.name}.` }), 303)
      } catch (error) {
        if (!(isRefusal(error))) throw error
        return c.redirect(shell.url(back, { kind: 'error', text: error.message }), 303)
      }
    })
    .post('/pipeline/deals/:id/complete', async (c) => {
      const form = await c.req.parseBody()
      const back = shell.back(form.back, '/pipeline')
      try {
        await crm.completeTask(String(form.taskId ?? ''))
        return c.redirect(shell.url(back, { kind: 'ok', text: 'Follow-up marked complete.' }), 303)
      } catch (error) {
        if (!(isRefusal(error))) throw error
        return c.redirect(shell.url(back, { kind: 'error', text: error.message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'pipeline', label: 'Pipeline', icon: '▥', path: '/pipeline', order: 10, count: () => crm.deals().filter((d) => isOpen(d.stage)).length }))
}
