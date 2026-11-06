/** Scene validation (right column): the checks the scene passes or fails (overlaps, bounds, hidden interactions), recomputed on every page. */
import type { Context } from '@deepseek-ai/cordis'
import { validate } from '../luma/index.ts'
import { escapeHtml } from '../luma-shell/index.ts'

export const name = 'validation'
export const inject = ['scene', 'lumaShell']

export function apply(ctx: Context): void {
  const shell = ctx.lumaShell
  const render = (): string => {
    const findings = validate(ctx.scene.state)
    const items = findings.length === 0 ? '<li class="ok">✓ No conflicts, all objects inside the scene bounds.</li>' : findings.map((f) => `<li class="${f.level}">${f.level === 'error' ? '✕' : '!'} ${escapeHtml(f.text)}</li>`).join('')
    return `<div class="label" style="margin-top:22px">Scene validation</div><ul class="findings" id="findings">${items}</ul>`
  }
  ctx.effect(() => shell.side({ id: 'validation', column: 'right', order: 20, render }))
}
