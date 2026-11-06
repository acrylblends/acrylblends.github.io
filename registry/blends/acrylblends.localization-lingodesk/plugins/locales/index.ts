/** Locales and content (rail): the target locales with their translated share, the project card with its progress, and the content types. */
import type { Context } from '@deepseek-ai/cordis'
import { TYPES, ago, countsFor } from '../lingodesk/index.ts'
import { escapeHtml } from '../desk-shell/index.ts'

export const name = 'locales'
export const inject = ['desk', 'deskShell']

export function apply(ctx: Context): void {
  const shell = ctx.deskShell
  const desk = ctx.desk
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const s = desk.state
    const percent = (id: string): number => {
      const c = countsFor(s, id, sel.type)
      return c.total === 0 ? 0 : Math.round((c.translated / c.total) * 100)
    }
    const locales = s.locales.map((l) => `<a class="locale${l.id === sel.locale.id ? ' active' : ''}" data-locale="${escapeHtml(l.id)}" href="${shell.hrefFor('/', { locale: l, type: sel.type, filter: sel.filter })}"${l.id === sel.locale.id ? ' aria-current="page"' : ''}>${escapeHtml(l.name)} <span class="count">${String(percent(l.id))}%</span></a>`).join('')
    const c = countsFor(s, sel.locale.id, sel.type)
    const flow = TYPES.find((t) => t.id === sel.type)?.flow ?? ''
    const types = TYPES.map((t) => `<a class="locale${t.id === sel.type ? ' active' : ''}" data-type="${t.id}" href="${shell.hrefFor('/', { locale: sel.locale, type: t.id, filter: 'all' })}"${t.id === sel.type ? ' aria-current="page"' : ''}>${t.id === sel.type ? '●' : '○'} ${escapeHtml(t.name)}</a>`).join('')
    return `<div class="cap">Target locales</div><nav aria-label="Target locales">${locales}</nav><div class="projectcard"><b>${escapeHtml(flow)}</b><small>${String(c.translated)} of ${String(c.total)} strings translated</small><div class="progress"><span style="width:${String(c.total === 0 ? 0 : Math.round((c.translated / c.total) * 100))}%"></span></div><small style="margin-top:11px">Last synced · ${escapeHtml(ago(s.syncedAt, desk.now()))}</small></div><div class="cap" style="margin-top:27px">Content type</div><nav aria-label="Content type">${types}</nav>`
  }
  ctx.effect(() => shell.side({ id: 'locales', column: 'left', order: 10, render }))
}
