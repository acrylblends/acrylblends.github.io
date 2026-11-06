/** Input modalities (rail): the six modalities to inspect; the open one is highlighted (`?modality=`). */
import type { Context } from '@deepseek-ai/cordis'
import { MODALITIES } from '../sensepath/index.ts'
import { escapeHtml } from '../sense-shell/index.ts'

export const name = 'modalities'
export const inject = ['lab', 'senseShell']

export function apply(ctx: Context): void {
  const shell = ctx.senseShell
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const items = MODALITIES.map((m) => `<a class="mod${m.id === sel.modality.id ? ' active' : ''}" data-modality="${m.id}" href="${shell.hrefFor('/', m.id)}"${m.id === sel.modality.id ? ' aria-current="page"' : ''}><span aria-hidden="true">${m.icon}</span>${escapeHtml(m.name)}</a>`).join('')
    return `<div class="caption">Input modalities</div><nav class="mods" aria-label="Input modalities">${items}</nav>`
  }
  ctx.effect(() => shell.side({ id: 'modalities', column: 'side', order: 10, render }))
}
