/** The federation topology, the first page (`/`): the instance cards on the map with their trust edges; picking one (`?instance=`) opens its profile. Edges follow the relations: blocked instances lose their links. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { counts, edges, healthLabel } from '../federary/index.ts'
import { escapeHtml } from '../fed-shell/index.ts'

export const name = 'topology'
export const inject = ['router', 'fed', 'fedShell', 'home']

export function apply(ctx: Context): void {
  const shell = ctx.fedShell
  const fed = ctx.fed
  const pageFor = (url: string): string => {
    const sel = shell.selection(url)
    const s = fed.state
    const lines = edges(s).map((e) => `<line class="${e.style}" x1="${String(e.a.x)}" y1="${String(e.a.y)}" x2="${String(e.b.x)}" y2="${String(e.b.y)}"/>`).join('')
    const nodes = s.instances
      .map((i) => {
        const cls = ['node', i.id === sel.instance.id ? 'selected' : '', i.relation === 'pending-in' || i.relation === 'pending-out' ? 'pending' : '', i.relation === 'blocked' ? 'blocked' : i.relation === 'quarantined' ? 'quarantined' : i.health].filter(Boolean).join(' ')
        return `<a class="${cls}" style="left:${String(i.x)}%;top:${String(i.y)}%" data-name="${escapeHtml(i.id)}" href="${shell.hrefFor('/', i.id)}"${i.id === sel.instance.id ? ' aria-current="true"' : ''}><b><i class="pulse"></i>${escapeHtml(i.id)}</b><small>${escapeHtml(healthLabel(i))}</small></a>`
      })
      .join('')
    const main = `<section class="panel"><h2>Federation topology</h2><div class="muted">Select an instance to inspect its policy and peer relationships.</div><div class="graph" id="graph" role="group" aria-label="Federation graph"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${nodes}</div>${shell.notice(url)}</section>`
    return shell.page({ title: 'Federation map', main, url })
  }
  const app = new Acryl().get('/', (c) => c.html(pageFor(c.req.url)))
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(c.req.url))))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'topology',
      title: 'Federation',
      render: () => {
        const c = counts(fed.state)
        return `<p><b>${String(c.known)}</b> instances · ${String(c.healthy)} healthy · ${String(c.pendingIn)} pending requests</p>`
      },
    }),
  )
}
