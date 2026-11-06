/** The control register, the first page (`/`): controls with owner, framework, status and evidence freshness, filtered by framework, owner and status. Picking a control opens its evidence (`?control=`). */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { agoLabel, filterControls, isFresh, latestEvidence, posture, statusOf } from '../grc/index.ts'
import { escapeHtml } from '../grc-shell/index.ts'

export const name = 'register'
export const inject = ['router', 'grc', 'grcShell', 'home']

export function apply(ctx: Context): void {
  const shell = ctx.grcShell
  const grc = ctx.grc

  const pageFor = (url: string): string => {
    const sel = shell.selection(url)
    const now = grc.now()
    const s = grc.state
    const rows = filterControls(s, { framework: sel.framework, owner: sel.owner, status: sel.status }, now)
    const owners = [...new Set(s.controls.map((c) => c.owner))].sort()
    const opt = (value: string, label: string, current: string) => `<option value="${escapeHtml(value)}"${value === current ? ' selected' : ''}>${escapeHtml(label)}</option>`
    const body = rows
      .map((c) => {
        const st = statusOf(c, now)
        const e = latestEvidence(c)
        const fresh = e === undefined ? '—' : `${isFresh(e, now) ? '' : 'Stale · '}${agoLabel(e.collectedAt, now)}`
        const pill = st === 'Current' ? '' : st === 'Review' ? ' warn' : ' bad'
        return `<tr data-control="${escapeHtml(c.id)}" data-status="${st}"${c.id === sel.control?.id ? ' class="sel"' : ''}><td><a href="${shell.hrefFor('/', sel, { control: c.id })}"${c.id === sel.control?.id ? ' aria-current="true"' : ''}><b>${escapeHtml(c.id)}</b><br>${escapeHtml(c.title)}</a></td><td>${escapeHtml(c.owner)}</td><td>${escapeHtml(c.framework)}</td><td><span class="pill${pill}">${st}</span><div class="hint">${escapeHtml(fresh)}</div></td></tr>`
      })
      .join('')
    const filters = `<form method="get" action="${shell.href('/')}" class="filters" aria-label="Filter controls"><label class="sr" for="framework">Framework</label><select id="framework" name="framework">${opt('all', 'All frameworks', sel.framework)}${s.frameworks.map((f) => opt(f, f, sel.framework)).join('')}</select><label class="sr" for="owner">Owner</label><select id="owner" name="owner">${opt('all', 'All owners', sel.owner)}${owners.map((o) => opt(o, o, sel.owner)).join('')}</select><label class="sr" for="status">Status</label><select id="status" name="status">${opt('all', 'All statuses', sel.status)}${['Current', 'Review', 'Exception'].map((x) => opt(x, x, sel.status)).join('')}</select><button class="btn small" type="submit">Apply filters</button>${sel.framework === 'all' && sel.owner === 'all' && sel.status === 'all' ? '' : `<a class="btn small" href="${shell.href('/')}">Clear</a>`}</form>`
    const main = `<section class="card"><h2>Control register</h2><div class="hint">Select a control to review its evidence and assurance trail.</div>${filters}<div class="tablewrap"><table class="controls" id="controlTable"><thead><tr><th>Control</th><th>Owner</th><th>Framework</th><th>Evidence</th></tr></thead><tbody>${body === '' ? '<tr><td colspan="4" class="hint">No controls match these filters.</td></tr>' : body}</tbody></table></div><div class="hint" style="margin-top:12px">Demo register · synthetic controls and evidence only · ${String(rows.length)} of ${String(s.controls.length)} shown</div>${shell.notice(url)}</section>`
    return shell.page({ title: 'Control register', main, url })
  }

  const app = new Acryl().get('/', (c) => c.html(pageFor(c.req.url)))
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(c.req.url))))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'register',
      title: 'Control assurance',
      render: () => {
        const p = posture(grc.state, grc.now())
        return `<p><b>${String(p.coverage)}%</b> control coverage · ${String(p.openRisks)} open risks · ${String(p.actions)} audit actions</p>`
      },
    }),
  )
}
