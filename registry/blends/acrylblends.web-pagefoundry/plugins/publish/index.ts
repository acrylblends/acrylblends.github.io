/** Theme and publish (right column, below the inspector; top bar buttons): the accent colour and heading font, preview mode with a Desktop / Mobile switch, and "Publish", which records a simulated build with any contrast warnings. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { backTo, escapeHtml, fieldOf, siteErrorOf, withNotice } from '../builder-shell/index.ts'
import { whenLabel } from '../pagefoundry/index.ts'

export const name = 'publish'
export const inject = ['router', 'site', 'builderShell']

export function apply(ctx: Context): void {
  const shell = ctx.builderShell
  const site = ctx.site
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const t = site.state.theme
    const back = shell.hrefFor('/', { pageId: sel.page.id, ...(sel.section === undefined ? {} : { sectionId: sel.section.id }) })
    const builds = [...site.state.builds]
      .reverse()
      .slice(0, 4)
      .map((b) => `<li data-build="${escapeHtml(b.version)}">v${escapeHtml(b.version)} · ${escapeHtml(whenLabel(b.at, site.now()))} · ${String(b.pages)} pages, ${String(b.sections)} sections${b.warnings.length === 0 ? '' : `<br><span class="bad">${String(b.warnings.length)} ${b.warnings.length === 1 ? 'warning' : 'warnings'}: ${escapeHtml(b.warnings.join('; '))}</span>`}</li>`)
      .join('')
    return `<div class="cap" style="margin-top:22px">Theme and publish</div><form method="post" action="${shell.href('/theme')}"><input type="hidden" name="back" value="${escapeHtml(back)}"><div class="field"><label for="accent">Accent colour</label><input type="color" id="accent" name="accent" value="${escapeHtml(t.accent)}"></div><div class="field"><label for="font">Headings</label><select id="font" name="font"><option value="serif"${t.serif ? ' selected' : ''}>Serif (Georgia)</option><option value="sans"${t.serif ? '' : ' selected'}>Sans (Inter)</option></select></div><button class="btn small" type="submit">Save theme</button></form>${builds === '' ? '<div class="help">Nothing published yet.</div>' : `<ul class="builds" id="builds">${builds}</ul>`}`
  }
  const refused = (c: { redirect(url: string, status: 303): Response }, to: string, error: unknown) => {
    const refusal = siteErrorOf(error)
    if (refusal === undefined) throw error
    return c.redirect(withNotice(to, 'error', refusal.message), 303)
  }
  const app = new Acryl()
    .post('/theme', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const to = backTo(shell, fieldOf(body, 'back'), shell.href('/'))
      try {
        await site.setTheme(fieldOf(body, 'accent'), fieldOf(body, 'font'))
        return c.redirect(withNotice(to, 'ok', 'Theme saved.'), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
    .post('/preview', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const to = backTo(shell, fieldOf(body, 'back'), shell.href('/'))
      const device = fieldOf(body, 'device')
      await site.setPreview(fieldOf(body, 'on') === 'on', device === 'mobile' ? 'mobile' : device === 'desktop' ? 'desktop' : undefined)
      return c.redirect(to, 303)
    })
    .post('/publish', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const to = backTo(shell, fieldOf(body, 'back'), shell.href('/'))
      try {
        const build = await site.publish()
        return c.redirect(withNotice(to, build.warnings.length === 0 ? 'ok' : 'error', `Build published locally · version ${build.version} (simulation)${build.warnings.length === 0 ? '' : `, with ${String(build.warnings.length)} warning${build.warnings.length === 1 ? '' : 's'}`}.`), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'publish', column: 'right', order: 20, render }))
}
