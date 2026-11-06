/**
 * The preview, the first page (`/`): the sample page as it renders now (remediations applied), with the affected component of the open finding
 * outlined, and the three view settings (high contrast, larger text, focus outlines). Nothing here audits a real site.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { SETTINGS, type Setting, summarize } from '../clearpath/index.ts'
import { auditErrorOf, escapeHtml, fieldOf, withNotice } from '../audit-shell/index.ts'

export const name = 'preview'
export const inject = ['router', 'audit', 'auditShell', 'home']

export function apply(ctx: Context): void {
  const shell = ctx.auditShell
  const audit = ctx.audit

  const pageFor = (url: string): string => {
    const sel = shell.selection(url)
    const s = audit.state
    const done = (id: string): boolean => s.issues.find((i) => i.id === id)?.resolved === true
    const at = sel.issue?.target
    const mark = (target: string, extra = ''): string => `${at === target ? ' inspect' : ''}${extra}`
    const classes = ['previewbox', s.preview.contrast ? 'highcontrast' : '', s.preview.large ? 'large' : ''].filter(Boolean).join(' ')
    const focusRing = s.preview.focus && done('focus') ? ' focusring' : ''
    const tools = (Object.entries(SETTINGS) as [Setting, string][]).map(([k, label]) => `<form method="post" action="${shell.href('/preview-setting')}">${shell.hidden(sel)}<input type="hidden" name="setting" value="${k}"><button type="submit" id="${k}" class="${s.preview[k] ? 'active' : ''}" aria-pressed="${s.preview[k] ? 'true' : 'false'}">${escapeHtml(label)}</button></form>`).join('')
    const sm = summarize(s.issues)
    const outline = done('heading') ? 'h1 Make good work easier to do → h2 See the whole picture → h2 Keep momentum' : 'h1 Make good work easier to do → <span class="bad">h3</span> See the whole picture → <span class="bad">h3</span> Keep momentum'
    const main = `<div class="heading"><div><small>Live preview / ${sel.issue === undefined ? 'no finding selected' : 'select an issue'}</small><h1>Interface accessibility</h1></div><small>${escapeHtml(s.page)} · ${String(s.issues.length)} sample findings · ${String(sm.open)} open</small></div>
<div class="${classes}" id="preview"><div class="previewhead"><span>DESKTOP PREVIEW · 1440 PX</span><span>LOCAL SAMPLE PAGE</span></div><div class="site"><div class="sitehead"><b>northstar.</b><div><span>Platform</span><span class="${mark('nav', focusRing)}" data-component="nav">Resources</span><span>Sign in</span></div></div><div class="hero"><small>CALM WORK FOR COMPLEX TEAMS</small><div class="h">Make good work<br>easier to do.</div><p>Bring your projects, people and decisions into one thoughtful workspace. Spend less time searching and more time moving forward.</p><span class="cta${done('contrast') ? ' fixed' : ''}${mark('cta')}" data-component="cta">Start your free trial</span></div>
<div class="cards"><div class="card"><div class="illus${mark('illustration')}" data-component="illustration"${done('alt') ? ' role="img" aria-label="Team planning board"' : ''}></div><b>See the whole picture</b><p>A clear view of work across teams.</p><span class="chip${done('alt') ? ' ok' : ''}">${done('alt') ? 'alt: Team planning board' : '⚠ no alt text'}</span></div><div class="card"><b>Keep momentum</b><p>Make the next step visible.</p></div><div class="card"><b>Work together</b><p>Bring context into every decision.</p></div></div><div class="outline${mark('outline')}" data-component="outline">Page outline: ${outline}</div></div></div>
<div class="tools" role="group" aria-label="Preview settings">${tools}</div>${s.preview.focus && !done('focus') ? '<div class="status"><p>Focus outlines on: the Resources link still has no visible focus indicator (finding open).</p></div>' : ''}${shell.notice(url)}`
    return shell.page({ title: 'Interface accessibility', main, url })
  }

  const app = new Acryl()
    .get('/', (c) => c.html(pageFor(c.req.url)))
    .post('/preview-setting', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const back = shell.backFor(body)
      try {
        const r = await audit.togglePreview(fieldOf(body, 'setting'))
        return c.redirect(withNotice(back, 'ok', `${SETTINGS[r.setting].replace(/^\S+ /, '')} ${r.on ? 'on' : 'off'}.`), 303)
      } catch (error) {
        const refusal = auditErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(withNotice(back, 'error', refusal.message), 303)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(c.req.url))))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'preview',
      title: 'Accessibility audit',
      render: () => {
        const sm = summarize(audit.state.issues)
        return `<p><b>${String(sm.open)}</b> open · ${String(sm.resolved)} resolved · score ${String(audit.lastRun()?.score ?? 0)}</p>`
      },
    }),
  )
}
