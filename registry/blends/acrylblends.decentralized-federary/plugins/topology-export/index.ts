/** Export topology (masthead button): downloads the instances with their relation, health and policy, and the links drawn on the map, as JSON. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'

export const name = 'topology-export'
export const inject = ['router', 'fed', 'fedShell']

export function apply(ctx: Context): void {
  const shell = ctx.fedShell
  const app = new Acryl().get('/export.json', (c) => c.body(`${JSON.stringify(ctx.fed.topology(), null, 2)}\n`, 200, { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="federary-topology.json"' }))
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'export', column: 'actions', order: 10, render: () => `<a class="btn" id="export" href="${shell.href('/export.json')}" download>Export topology</a>` }))
}
