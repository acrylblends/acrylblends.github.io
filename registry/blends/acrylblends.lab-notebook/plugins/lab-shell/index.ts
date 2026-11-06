/** The Lab Notebook shell: the FIELD / LAB sidebar with notebooks, the new-notebook action, the experiments and the project footer. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { dateText, type Lab } from '../lab/index.ts'
import { createShell, escapeHtml, type Shell } from './core.ts'
import { STYLES } from './styles.ts'
export * from './core.ts'
export * from './ui.ts'
export const APP_TITLE = 'Lab Notebook'
export interface ShellConfig {
  readonly prefix?: string
}
export const name = 'lab-shell'
export const inject = ['lab', 'router']
declare module '@deepseek-ai/cordis' {
  interface Context {
    shell: Shell
  }
}

function syncText(now: Date): string {
  return `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`
}

export function apply(ctx: Context, config: ShellConfig = {}): void {
  const lab: Lab = ctx.lab
  const prefix = config.prefix ?? ''
  const sidebar = (notebookId: string | undefined, experimentId: string | undefined, href: (path: string) => string): string => {
    const notebook = notebookId === undefined ? lab.notebooks()[0] : lab.notebook(notebookId)
    const experiments = notebook === undefined ? [] : lab.experiments(notebook.id)
    const notebooks = lab.notebooks()
      .map((entry) => {
        const active = entry.id === notebook?.id
        const count = lab.experiments(entry.id).length
        return `<a class="exp${active ? ' active' : ''}" href="${href('/notebooks')}#${encodeURIComponent(entry.id)}"><span>${active ? '◉' : '◌'} ${escapeHtml(entry.title)}</span><small>Notebook ${escapeHtml(entry.code)} · ${String(count)} experiments</small></a>`
      })
      .join('')
    const items = experiments
      .slice(0, 3)
      .map(
        (experiment) =>
          `<a class="exp${experiment.id === experimentId ? ' active' : ''}" href="${href(`/experiments/${encodeURIComponent(experiment.id)}`)}"><span>${String(experiment.number).padStart(2, '0')} · ${escapeHtml(experiment.title)}</span><small>Started ${dateText(experiment.startedAt)} · ${escapeHtml(experiment.code)}</small></a>`,
      )
      .join('')
    const project = notebook === undefined ? 'UNASSIGNED' : notebook.project.toUpperCase()
    return `<aside class="side"><a class="labbrand" href="${href('/')}">FIELD <i>／</i> LAB</a><h4>MY NOTEBOOKS</h4>${notebooks}<a class="newbook" href="${href('/notebooks/new')}">＋ New notebook</a><h4>EXPERIMENTS</h4>${items}<div class="sidefoot">PROJECT: ${escapeHtml(project)}<br>ACCESS: PRIVATE RESEARCH GROUP<br>LAST SYNC: ${syncText(lab.now)}</div></aside>`
  }
  const shell = createShell(prefix, { appTitle: APP_TITLE, css: STYLES, bodyClass: 'lab', sidebar })
  ctx.provide('shell', shell)
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
}
