/** Compatibility (`/compat`): the runtime compatibility matrix, workload by workload, current runtime against target with a verdict and the reason; each row leads to a prepared rollout. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { escapeHtml } from '../run-shell/index.ts'
import { VERDICT_LABEL } from '../runlevel/index.ts'

export const name = 'compat'
export const inject = ['router', 'desk', 'runShell']

const BADGE = { verified: 'badge', review: 'badge yellow', blocked: 'badge red' } as const

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.runShell
  const sel = shell.selection(url)
  const rows = ctx.desk.state.rules
    .map(
      (r) =>
        `<tr data-rule="${escapeHtml(r.id)}"><td>${escapeHtml(r.workload)}</td><td>${escapeHtml(r.current)}</td><td>${escapeHtml(r.target)}</td><td><span class="${BADGE[r.verdict]}">${VERDICT_LABEL[r.verdict]}</span><br><small class="muted">${escapeHtml(r.note)}</small></td></tr>`,
    )
    .join('')
  const main = `<div id="tab-compat"><div class="sectiontitle">Runtime compatibility matrix</div><div class="scroll"><table class="table"><thead><tr><th scope="col">Workload</th><th scope="col">Current</th><th scope="col">Target</th><th scope="col">Compatibility</th></tr></thead><tbody>${rows}</tbody></table></div>
${shell.has('rollouts') ? `<p><a class="btn" href="${shell.hrefFor('/rollouts', { hostId: sel.host.id })}&prepare=1#prepare">Prepare a rollout from these results</a></p>` : ''}</div>`
  return shell.page({ active: 'compat', title: 'Compatibility', main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.runShell
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, new Acryl().get('/compat', (c) => c.html(pageFor(ctx, c.req.url))))
  ctx.effect(() => shell.tab({ id: 'compat', label: 'Compatibility', path: '/compat', order: 20 }))
}
