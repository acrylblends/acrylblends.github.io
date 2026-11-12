/**
 * ACRYL SDE, the Synthetic Data Engine, as a plugin: it opens the engine over the app's data home (`<home>/sde/`), provides it as `ctx.sde`, and
 * mounts the review pages at `/sde` (`/app/sde` inside the workbench). Switching the row off removes the pages; the runs stay on disk.
 *
 * Routes: GET /sde, POST /sde/suggest, POST /sde/runs, GET /sde/runs/:id, GET /sde/runs/:id/report/:name, POST /sde/runs/:id/review,
 * POST /sde/runs/:id/export, POST /sde/runs/:id/delete. Every change is a POST from the page; there is no route that sends anything elsewhere.
 */
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { Sde, SdeError } from './src/engine.ts'
import { homeBody, page, runBody } from './src/pages.ts'

export { Sde, SdeError } from './src/engine.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    sde: Sde
  }
}

export const name = 'sde'
export const inject = ['appInstance', 'router']

export interface SdeConfig {
  /** The engine's folder, absolute; `<app home>/sde` when absent. */
  readonly home?: string
}

/** The path the app is mounted at, read from the request: `` on the app's own server, `/app` in the workbench. */
const baseOf = (path: string): string => path.slice(0, Math.max(0, path.indexOf('/sde')))

type Notice = { kind: 'ok' | 'error'; text: string }
const noticeOf = (query: (key: string) => string | undefined): Notice | undefined => {
  const ok = query('ok')
  const error = query('error')
  return error ? { kind: 'error', text: error } : ok ? { kind: 'ok', text: ok } : undefined
}

export function apply(ctx: Context, config: SdeConfig = {}): void {
  const sde = new Sde({ home: config.home ?? join(ctx.appInstance.home, 'sde') })
  ctx.provide('sde', sde)

  const app = new Acryl()
    .get('/', (c) => {
      const base = baseOf(c.req.path)
      return c.html(page({ title: 'Runs', base, notice: noticeOf((key) => c.req.query(key)), body: homeBody(base, sde.list()) }))
    })
    .post('/suggest', async (c) => {
      const base = baseOf(c.req.path)
      const form = await c.req.parseBody()
      const path = String(form.path ?? '').trim()
      try {
        const terms = [...new Set([...String(form.terms ?? '').split(','), ...sde.suggestTerms(path)].map((term) => term.trim()).filter(Boolean))]
        return c.html(page({ title: 'Runs', base, notice: { kind: 'ok', text: 'Suggested project words added below: check them before you scan.' }, body: homeBody(base, sde.list(), { path, terms: terms.join(', ') }) }))
      } catch (error) {
        if (!(error instanceof SdeError)) throw error
        return c.html(page({ title: 'Runs', base, notice: { kind: 'error', text: error.message }, body: homeBody(base, sde.list(), { path, terms: String(form.terms ?? '') }) }), 400)
      }
    })
    .post('/runs', async (c) => {
      const base = baseOf(c.req.path)
      const form = await c.req.parseBody()
      try {
        const run = sde.scan({
          path: String(form.path ?? '').trim(),
          label: String(form.label ?? ''),
          terms: String(form.terms ?? '').split(','),
        })
        return c.redirect(`${base}/sde/runs/${encodeURIComponent(run.id)}?ok=${encodeURIComponent('Scanned and packaged. Review it below.')}`, 303)
      } catch (error) {
        if (!(error instanceof SdeError)) throw error
        return c.redirect(`${base}/sde?error=${encodeURIComponent(error.message)}`, 303)
      }
    })
    .get('/runs/:id', (c) => {
      const base = baseOf(c.req.path)
      try {
        const run = sde.get(c.req.param('id'))
        const file = c.req.query('file')
        const selected = file ? { path: file, text: sde.outputFile(run.id, file) } : undefined
        const security = (sde.report(run.id, 'security-report.json') as { findings: unknown[] }).findings.length
        return c.html(page({ title: run.label, base, notice: noticeOf((key) => c.req.query(key)), body: runBody(base, run, sde.outputFiles(run.id), selected, security) }))
      } catch (error) {
        if (!(error instanceof SdeError)) throw error
        return c.redirect(`${base}/sde?error=${encodeURIComponent(error.message)}`, 303)
      }
    })
    .get('/runs/:id/report/:name', (c) => {
      try {
        return c.json(sde.report(c.req.param('id'), c.req.param('name')))
      } catch (error) {
        if (!(error instanceof SdeError)) throw error
        return c.json({ error: error.message }, 404)
      }
    })
    .post('/runs/:id/review', async (c) => {
      const base = baseOf(c.req.path)
      const id = c.req.param('id')
      const form = await c.req.parseBody()
      try {
        const run = sde.review(id, {
          decision: form.decision === 'approved' ? 'approved' : 'rejected',
          reviewer: String(form.reviewer ?? ''),
          rightsAttested: form.rights === 'yes',
          notes: String(form.notes ?? ''),
        })
        return c.redirect(`${base}/sde/runs/${encodeURIComponent(id)}?ok=${encodeURIComponent(run.status === 'approved' ? 'Approved. You can export it now.' : 'Rejected.')}`, 303)
      } catch (error) {
        if (!(error instanceof SdeError)) throw error
        return c.redirect(`${base}/sde/runs/${encodeURIComponent(id)}?error=${encodeURIComponent(error.message)}`, 303)
      }
    })
    .post('/runs/:id/export', (c) => {
      const base = baseOf(c.req.path)
      const id = c.req.param('id')
      try {
        const run = sde.exportUnit(id)
        return c.redirect(`${base}/sde/runs/${encodeURIComponent(id)}?ok=${encodeURIComponent(`Exported to ${run.exportedTo ?? ''}`)}`, 303)
      } catch (error) {
        if (!(error instanceof SdeError)) throw error
        return c.redirect(`${base}/sde/runs/${encodeURIComponent(id)}?error=${encodeURIComponent(error.message)}`, 303)
      }
    })
    .post('/runs/:id/delete', (c) => {
      const base = baseOf(c.req.path)
      try {
        sde.remove(c.req.param('id'))
        return c.redirect(`${base}/sde?ok=${encodeURIComponent('Run deleted.')}`, 303)
      } catch (error) {
        if (!(error instanceof SdeError)) throw error
        return c.redirect(`${base}/sde?error=${encodeURIComponent(error.message)}`, 303)
      }
    })

  ctx.router.route('/sde', app)
}
