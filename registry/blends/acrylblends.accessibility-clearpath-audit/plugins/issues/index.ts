/** Issues by priority (rail): the severity filters with counts and the list of findings; picking one opens it in the preview and the detail column. */
import type { Context } from '@deepseek-ai/cordis'
import { SEVERITIES } from '../clearpath/index.ts'
import { FILTER_IDS, escapeHtml } from '../audit-shell/index.ts'

export const name = 'issues'
export const inject = ['audit', 'auditShell']

export function apply(ctx: Context): void {
  const shell = ctx.auditShell
  const audit = ctx.audit
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const all = audit.state.issues
    const count = (f: string) => all.filter((i) => f === 'all' || i.severity === f).length
    const filters = FILTER_IDS.map((f) => `<a class="${f === sel.filter ? 'active' : ''}" data-filter="${f}" href="${shell.hrefFor('/', { filter: f })}"${f === sel.filter ? ' aria-current="true"' : ''}>${f === 'all' ? `All ${String(count(f))}` : SEVERITIES[f].short}</a>`).join('')
    const list = all
      .filter((i) => sel.filter === 'all' || i.severity === sel.filter)
      .map((i) => `<a class="issue${i.id === sel.issue?.id ? ' active' : ''}${i.resolved ? ' done' : ''}" data-id="${escapeHtml(i.id)}" data-sev="${i.severity}" href="${shell.hrefFor('/', { filter: sel.filter, issue: i.id })}"${i.id === sel.issue?.id ? ' aria-current="true"' : ''}><b><i class="sev ${i.severity}"></i>${escapeHtml(i.title)}${i.resolved ? ' ✓' : ''}</b><small>${escapeHtml(i.component)}</small></a>`)
      .join('')
    return `<div class="cap">Issues by priority</div><nav class="filter" aria-label="Filter by priority">${filters}</nav><div id="issues">${list === '' ? '<div class="empty-note">No findings with this priority.</div>' : list}</div>`
  }
  ctx.effect(() => shell.side({ id: 'issues', column: 'left', order: 20, render }))
}
