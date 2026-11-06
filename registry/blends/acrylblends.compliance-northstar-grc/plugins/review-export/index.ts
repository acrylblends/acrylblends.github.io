/** Export review (masthead button): downloads the review as a Markdown file: posture, controls, risks and open audit actions. Synthetic data only. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { reviewMarkdown } from '../grc/index.ts'

export const name = 'review-export'
export const inject = ['router', 'grc', 'grcShell']

export function apply(ctx: Context): void {
  const shell = ctx.grcShell
  const grc = ctx.grc
  const app = new Acryl().get('/export', (c) => c.body(reviewMarkdown(grc.state, grc.now()), 200, { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': 'attachment; filename="northstar-control-review.md"' }))
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'export', column: 'actions', order: 10, render: () => `<a class="btn" id="export" href="${shell.href('/export')}" download>Export review</a>` }))
}
