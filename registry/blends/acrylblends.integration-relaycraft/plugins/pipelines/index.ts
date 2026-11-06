/**
 * Pipelines, the first page (`/`): the pipeline canvas (source, transform, destination), source and destination pickers, the field mappings with their
 * status, a sample-record preview with the unmapped source fields, and Save draft. Mappings are added, removed or suggested; any change leaves the draft
 * unsaved until Save draft bumps its version. A new pipeline is made between two connected connectors.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { escapeHtml, fieldOf, studioErrorOf, withNotice } from '../craft-shell/index.ts'
import { TRANSFORMS, ago, checkMappings, missingRequired, preview } from '../relaycraft/index.ts'

export const name = 'pipelines'
export const inject = ['router', 'studio', 'craftShell', 'home']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.craftShell
  const studio = ctx.studio
  const p = shell.selected(url)
  const source = studio.connector(p.sourceId)
  const destination = studio.connector(p.destinationId)
  const query = new URL(url, 'http://local').searchParams
  const checks = checkMappings(p, source)
  const rules = p.mappings.filter((m) => m.transform !== 'none').length
  const missing = missingRequired(p, destination)
  const here = shell.hrefFor('/', p.id)
  const id = encodeURIComponent(p.id)
  const chips = studio.state.pipelines.map((x) => `<a class="chip${x.id === p.id ? ' on' : ''}" href="${shell.hrefFor('/', x.id)}"${x.id === p.id ? ' aria-current="true"' : ''} data-pipeline="${escapeHtml(x.id)}">${escapeHtml(x.name)}</a>`).join('')
  const options = (role: 'source' | 'destination', selected: string) =>
    studio.state.connectors.filter((c) => c.role === role).map((c) => `<option value="${escapeHtml(c.id)}"${c.id === selected ? ' selected' : ''}>${escapeHtml(c.name)}${c.connected ? '' : ' (not connected)'}</option>`).join('')
  const rows = checks
    .map(({ mapping: m, status }) => `<tr data-mapping="${escapeHtml(m.destination)}"><td>${escapeHtml(m.source)}</td><td>${escapeHtml(TRANSFORMS[m.transform].label)}</td><td>${escapeHtml(m.destination)}</td><td><span class="pill${status === 'review' ? ' review' : ''}">${status === 'review' ? 'Review' : 'Mapped'}</span></td><td><form class="inline" method="post" action="${shell.href(`/pipelines/${id}/mappings/remove`)}"><input type="hidden" name="destination" value="${escapeHtml(m.destination)}"><button class="small" type="submit" aria-label="Remove mapping to ${escapeHtml(m.destination)}">Remove</button></form></td></tr>`)
    .join('')
  const sourceOptions = source.fields.map((f) => `<option>${escapeHtml(f.name)}</option>`).join('')
  const destOptions = destination.fields.filter((f) => !p.mappings.some((m) => m.destination === f.name)).map((f) => `<option>${escapeHtml(f.name)}</option>`).join('')
  const transformOptions = Object.entries(TRANSFORMS).map(([k, v]) => `<option value="${k}">${escapeHtml(v.label === '—' ? 'No transform' : v.label)}</option>`).join('')
  const pv = preview(p, source)
  const columns = p.mappings.map((m) => m.destination)
  const main = `<div class="chips" aria-label="Pipelines">${chips}<a class="chip" href="${shell.hrefFor('/', p.id)}&new=1#new">＋ New pipeline</a></div>
<form class="panel form" id="new" method="post" action="${shell.href('/pipelines')}"${query.get('new') === '1' ? '' : ' hidden'}><label class="field">Name<input class="input" name="name" required maxlength="40" placeholder="Invoice export"></label><label class="field">Source<select class="input" name="sourceId">${options('source', 'hubspot')}</select></label><label class="field">Destination<select class="input" name="destinationId">${options('destination', 'postgres')}</select></label><button class="primary" type="submit">Create pipeline</button></form>
<div class="panel"><div class="runhead"><div><h2>Pipeline canvas</h2><div class="sub">A clear path from source records to the destination schema.</div></div><span class="pill${p.dirty ? ' review' : ''}">● Draft v${String(p.version)}${p.dirty ? ' · unsaved' : ''}</span></div>
<div class="canvas"><div class="node"><div class="ico">${escapeHtml(source.letter)}</div><strong>${escapeHtml(source.name)}</strong><small>Source · ${String(source.records)} records</small></div><div class="connector"></div><div class="node"><div class="ico" style="background:var(--blue);color:var(--blueink)">ƒx</div><strong>Normalize fields</strong><small>Transform · ${String(rules)} ${rules === 1 ? 'rule' : 'rules'}</small></div><div class="connector"></div><div class="node"><div class="ico" style="background:var(--amber);color:var(--amberink)">↗</div><strong>${escapeHtml(destination.name)}</strong><small>Destination · ${escapeHtml(destination.object)}</small></div></div>
<form class="form" method="post" action="${shell.href(`/pipelines/${id}/ends`)}"><label class="field">Source<select class="input" name="sourceId">${options('source', p.sourceId)}</select></label><label class="field">Destination<select class="input" name="destinationId">${options('destination', p.destinationId)}</select></label><button type="submit">Change connectors</button></form>
<div class="pipeline-foot"><span>Last edited by ${escapeHtml(p.editedBy)} · ${escapeHtml(ago(p.editedAt, studio.now()))}</span><span>${String(rules > 0 ? 3 : 2)} steps · ${(Math.round(source.records * 0.005 * 10) / 10).toFixed(1)} MB estimated</span></div></div>
<div class="panel"><div class="runhead"><div><h2>Field mapping</h2><div class="sub">Transform source values into the destination contract.</div></div><span><form class="inline" method="post" action="${shell.href(`/pipelines/${id}/suggest`)}"><button class="small" type="submit">Suggest mappings</button></form> <a class="btn small" id="addmap" href="${here}&add=1#add">+ Add mapping</a></span></div>
${missing.length === 0 ? '' : `<p class="alert error" role="status">${escapeHtml(destination.name)} requires ${escapeHtml(missing.join(', '))}; not mapped yet.</p>`}
<form class="form" id="add" method="post" action="${shell.href(`/pipelines/${id}/mappings`)}"${query.get('add') === '1' ? '' : ' hidden'}><label class="field">Source field<select class="input" name="source">${sourceOptions}</select></label><label class="field">Transform<select class="input" name="transform">${transformOptions}</select></label><label class="field">Destination field<select class="input" name="destination">${destOptions}</select></label><button class="primary" type="submit">Add mapping</button></form>
${rows === '' ? '<div class="empty"><b>No mappings yet.</b><br>Add one, or ask for suggestions.</div>' : `<div class="scroll"><table class="table" id="maps"><thead><tr><th scope="col">Source field</th><th scope="col">Transform</th><th scope="col">Destination field</th><th scope="col">Status</th><th scope="col"></th></tr></thead><tbody>${rows}</tbody></table></div>`}</div>
<div class="panel"><h2>Sample records</h2><div class="sub">The first ${String(pv.rows.length)} source rows as ${escapeHtml(destination.name)} would receive them.${pv.unmapped.length === 0 ? '' : ` Unmapped source fields: <b>${escapeHtml(pv.unmapped.join(', '))}</b>.`}</div>${columns.length === 0 ? '<div class="empty">Map a field to see a preview.</div>' : `<div class="scroll"><table class="table" id="preview"><thead><tr>${columns.map((c) => `<th scope="col">${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${pv.rows.map((r) => `<tr>${columns.map((c) => `<td>${escapeHtml(r[c] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}</div>`
  const save = `<form method="post" action="${shell.href(`/pipelines/${id}/save`)}"><button id="save" type="submit">Save draft</button></form>`
  const run = shell.has('runs') ? `<form method="post" action="${shell.href(`/pipelines/${id}/run`)}"><button class="primary" id="run" type="submit">▶ Run pipeline</button></form>` : ''
  return shell.page({ active: 'pipelines', title: p.name, main, url, actions: `${save}${run}`, aside: true })
}

export function apply(ctx: Context): void {
  const shell = ctx.craftShell
  const studio = ctx.studio
  const refused = (c: { redirect(url: string, status: 303): Response }, to: string, error: unknown) => {
    const refusal = studioErrorOf(error)
    if (refusal === undefined) throw error
    return c.redirect(withNotice(to, 'error', refusal.message), 303)
  }
  const at = (id: string) => shell.hrefFor('/', id)
  const app = new Acryl()
    .get('/', (c) => c.html(pageFor(ctx, c.req.url)))
    .post('/pipelines', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      try {
        const p = await studio.createPipeline({ name: fieldOf(body, 'name'), sourceId: fieldOf(body, 'sourceId'), destinationId: fieldOf(body, 'destinationId') })
        return c.redirect(withNotice(at(p.id), 'ok', `Pipeline ${p.name} created. Suggest or add mappings next.`), 303)
      } catch (error) {
        return refused(c, `${shell.href('/')}?new=1#new`, error)
      }
    })
    .post('/pipelines/:id/ends', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const id = c.req.param('id')
      try {
        const p = await studio.setEnds(id, fieldOf(body, 'sourceId'), fieldOf(body, 'destinationId'))
        return c.redirect(withNotice(at(id), 'ok', `Connectors changed; ${String(p.mappings.length)} mappings suggested.`), 303)
      } catch (error) {
        return refused(c, at(id), error)
      }
    })
    .post('/pipelines/:id/mappings', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const id = c.req.param('id')
      try {
        await studio.addMapping(id, { source: fieldOf(body, 'source'), transform: fieldOf(body, 'transform'), destination: fieldOf(body, 'destination') })
        return c.redirect(withNotice(at(id), 'ok', 'Mapping added.'), 303)
      } catch (error) {
        return refused(c, `${at(id)}&add=1#add`, error)
      }
    })
    .post('/pipelines/:id/mappings/remove', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const id = c.req.param('id')
      try {
        await studio.removeMapping(id, fieldOf(body, 'destination'))
        return c.redirect(withNotice(at(id), 'ok', 'Mapping removed.'), 303)
      } catch (error) {
        return refused(c, at(id), error)
      }
    })
    .post('/pipelines/:id/suggest', async (c) => {
      const id = c.req.param('id')
      try {
        const p = await studio.suggest(id)
        return c.redirect(withNotice(at(id), 'ok', `Suggested mappings added; the pipeline has ${String(p.mappings.length)}.`), 303)
      } catch (error) {
        return refused(c, at(id), error)
      }
    })
    .post('/pipelines/:id/save', async (c) => {
      const id = c.req.param('id')
      try {
        const p = await studio.saveDraft(id)
        return c.redirect(withNotice(at(id), 'ok', `Draft saved as v${String(p.version)}.`), 303)
      } catch (error) {
        return refused(c, at(id), error)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(ctx, c.req.url))))
  ctx.effect(() => shell.nav({ id: 'pipelines', label: 'Pipelines', icon: '◈', path: '/', order: 10 }))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'pipelines',
      title: 'Pipelines',
      render: () => `<p><b>${String(studio.state.pipelines.length)}</b> of ${String(studio.state.planLimit)} flows · <b>${String(studio.runs().length)}</b> runs</p>`,
    }),
  )
}
