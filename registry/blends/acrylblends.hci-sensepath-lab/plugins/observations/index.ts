/**
 * Observations (header button and session column): save the latest run as an observation with a note, list the saved ones, delete one, and compare two
 * (the difference in completion and response time and in the settings). The comparison lives in the URL (`?a=&b=`), not in the saved data.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { modalityOf, whenLabel } from '../sensepath/index.ts'
import { escapeHtml, fieldOf, labErrorOf, withNotice } from '../sense-shell/index.ts'

export const name = 'observations'
export const inject = ['router', 'lab', 'senseShell']

const signed = (n: number, unit: string, digits = 0): string => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(digits)}${unit}`

export function apply(ctx: Context): void {
  const shell = ctx.senseShell
  const lab = ctx.lab

  const top = (): string => `<button class="btn" id="save" type="submit" form="obsform">Save observation</button>`

  const aside = (sel: ReturnType<typeof shell.selection>, url: string): string => {
    const q = new URL(url, 'http://local').searchParams
    const all = [...lab.state.observations].reverse()
    const list = all
      .slice(0, 6)
      .map(
        (o) => `<li data-observation="${escapeHtml(o.id)}"><form method="post" action="${shell.href(`/observations/${encodeURIComponent(o.id)}/delete`)}">${shell.hidden(sel)}<button class="del" type="submit" aria-label="Delete observation">×</button></form><b>${escapeHtml(modalityOf(o.modality).name)}</b> · ${escapeHtml(whenLabel(o.at, lab.now()))}<br>${String(o.completion)}% · ${o.latency.toFixed(1)} s · ${String(o.settings.sensitivity)}% sensitivity<br>${escapeHtml(o.note)}</li>`,
      )
      .join('')
    const options = (current: string | null) => all.map((o) => `<option value="${escapeHtml(o.id)}"${o.id === current ? ' selected' : ''}>${escapeHtml(modalityOf(o.modality).name)} · ${escapeHtml(whenLabel(o.at, lab.now()))} · ${String(o.completion)}%</option>`).join('')
    let result = ''
    if (q.has('a') || q.has('b')) {
      try {
        const c = lab.compare(q.get('a') ?? undefined, q.get('b') ?? undefined)
        const diffs = c.differences.length === 0 ? 'same settings' : c.differences.map(escapeHtml).join('; ')
        result = `<div class="delta" id="comparison">Completion ${signed(c.completion, ' pts')} · response ${signed(c.latency, ' s', 1)}<br>${diffs}</div>`
      } catch (error) {
        const refusal = labErrorOf(error)
        if (refusal === undefined) throw error
        result = `<div class="delta err" id="comparison" role="alert">${escapeHtml(refusal.message)}</div>`
      }
    }
    return `<div class="panel"><h2>Observations</h2><div class="sub">Saved to this local demo session · illustrative, not evidence</div>
<form id="obsform" method="post" action="${shell.href('/observations')}">${shell.hidden(sel)}<div class="field"><label for="note">Note for ${escapeHtml(sel.modality.name)} (optional)</label><input id="note" name="note" maxlength="200" placeholder="What did you observe?"></div></form>
${list === '' ? '<p class="sub" style="margin-top:10px">No observations saved yet.</p>' : `<ul class="obslist" id="observations">${list}</ul>`}
<form method="get" action="${shell.href('/')}" style="margin-top:12px"><input type="hidden" name="modality" value="${escapeHtml(sel.modality.id)}"><div class="cmp"><div class="field"><label for="cmpa">Compare</label><select id="cmpa" name="a">${options(q.get('a'))}</select></div><div class="field"><label for="cmpb">with</label><select id="cmpb" name="b">${options(q.get('b'))}</select></div></div><div class="actions"><button class="secondary" type="submit">Compare observations</button></div></form>${result}</div>`
  }

  const app = new Acryl()
    .post('/observations', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const id = fieldOf(body, 'modality') ?? ''
      const to = shell.hrefFor('/', shell.selection(`/?modality=${encodeURIComponent(id)}`).modality.id)
      try {
        await lab.saveObservation(id, fieldOf(body, 'note'))
        return c.redirect(withNotice(to, 'ok', 'Observation saved to local demo session.'), 303)
      } catch (error) {
        const refusal = labErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(withNotice(to, 'error', refusal.message), 303)
      }
    })
    .post('/observations/:id/delete', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const to = shell.hrefFor('/', shell.selection(`/?modality=${encodeURIComponent(fieldOf(body, 'modality') ?? '')}`).modality.id)
      try {
        await lab.deleteObservation(c.req.param('id'))
        return c.redirect(withNotice(to, 'ok', 'Observation deleted.'), 303)
      } catch (error) {
        const refusal = labErrorOf(error)
        if (refusal === undefined) throw error
        return c.redirect(withNotice(to, 'error', refusal.message), 303)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'observations-top', column: 'top', order: 10, render: top }))
  ctx.effect(() => shell.side({ id: 'observations', column: 'aside', order: 20, render: aside }))
}

