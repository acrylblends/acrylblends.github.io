/**
 * The editor, the first page (`/`): the header with its counts, the state filters, and the source / target segment table. A segment is saved as a draft
 * (needs review), approved, or reopened; an approved segment is read-only until it is reopened, so an approved translation is never rewritten silently.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { FILTERS, type Filter, type Segment, TYPES, ago, countsFor, filterMatches, placeholdersOf } from '../lingodesk/index.ts'
import { escapeHtml, fieldOf, deskErrorOf, withNotice } from '../desk-shell/index.ts'

export const name = 'editor'
export const inject = ['router', 'desk', 'deskShell', 'home']

export function apply(ctx: Context): void {
  const shell = ctx.deskShell
  const desk = ctx.desk

  const stateLine = (s: Segment, source: string): { text: string; cls: string } => {
    if (s.state === 'empty') return { text: '○ Untranslated', cls: ' empty' }
    if (s.state === 'approved') return { text: '✓ Approved', cls: '' }
    const want = placeholdersOf(source)
    const have = placeholdersOf(s.target)
    const ok = want.length === have.length && want.every((p) => have.includes(p))
    if (!ok) return { text: '● Needs review · placeholder problem', cls: ' bad' }
    return { text: `● Needs review${want.length > 0 ? ' · placeholder preserved' : ''}`, cls: '' }
  }

  const pageFor = (url: string): string => {
    const sel = shell.selection(url)
    const s = desk.state
    const counts = countsFor(s, sel.locale.id, sel.type)
    const keys = s.keys.filter((k) => k.type === sel.type)
    const rows = keys.map((k) => ({ k, seg: desk.segment(k.key, sel.locale.id) }))
    const last = rows.map((r) => r.seg).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    const filters = (Object.entries(FILTERS) as [Filter, string][]).map(([f, label]) => `<a class="filter${f === sel.filter ? ' active' : ''}" data-filter="${f}" href="${shell.hrefFor('/', { locale: sel.locale, type: sel.type, filter: f })}"${f === sel.filter ? ' aria-current="true"' : ''}>${escapeHtml(label)}</a>`).join('')
    const shown = rows.filter((r) => filterMatches(sel.filter, r.seg))
    const body = shown
      .map(({ k, seg }) => {
        const st = stateLine(seg, k.source)
        const selected = k.key === sel.key
        const base = `/segments/${encodeURIComponent(k.key)}`
        const approved = seg.state === 'approved'
        const buttons = approved
          ? `<button class="btn small" type="submit" formaction="${shell.href(`${base}/reopen`)}">Reopen for editing</button>`
          : `<button class="btn small primary" type="submit">Save draft</button>${seg.state === 'review' ? `<button class="btn small" type="submit" formaction="${shell.href(`${base}/approve`)}">Approve</button>` : ''}`
        return `<div class="segment${selected ? ' selected' : ''}" data-state="${seg.state}" data-key="${escapeHtml(k.key)}"><div><div class="key"><a href="${shell.hrefFor('/', sel, { key: k.key })}">${escapeHtml(k.key)}</a>${k.maxLength === undefined ? '' : ` · max ${String(k.maxLength)}`}</div><div class="source">${escapeHtml(k.source)}</div></div><form method="post" action="${shell.href(base)}">${shell.hidden(sel, k.key)}<textarea class="target" name="target" lang="${escapeHtml(sel.locale.id)}" aria-label="Translation for ${escapeHtml(k.key)}"${approved ? ' readonly' : ''} placeholder="Add translation…" maxlength="500">${escapeHtml(seg.target)}</textarea><div class="state${st.cls}">${st.text}</div><div class="rowbtns">${buttons}</div></form></div>`
      })
      .join('')
    const flow = TYPES.find((t) => t.id === sel.type)?.flow ?? ''
    const main = `<div class="head"><div><small>Localization / ${escapeHtml(sel.locale.id)}</small><h1>${escapeHtml(flow)}</h1><small class="low">${last === undefined ? '' : `Last edit by ${escapeHtml(last.by)} · ${escapeHtml(ago(last.updatedAt, desk.now()))}`}</small></div><div class="stats"><span><b>${String(counts.total)}</b> strings</span><span><b id="translated">${String(counts.translated)}</b> translated</span><span><b id="pending">${String(counts.review)}</b> pending review</span></div></div>
<nav class="filters" aria-label="Filter strings by state">${filters}</nav>
<div class="editor"><div class="tablehead"><span>ENGLISH SOURCE</span><span>${escapeHtml(sel.locale.header)}</span></div>${body === '' ? `<div class="empty-note">No strings are ${escapeHtml((FILTERS[sel.filter]).toLowerCase())} in this locale.</div>` : body}</div>${shell.notice(url)}`
    return shell.page({ title: `${flow} · ${sel.locale.id}`, main, url })
  }

  const respond = async (c: { redirect(url: string, status: 303): Response }, back: string, work: () => Promise<string>) => {
    try {
      return c.redirect(withNotice(back, 'ok', await work()), 303)
    } catch (error) {
      const refusal = deskErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(back, 'error', refusal.message), 303)
    }
  }
  const form = async (c: { req: { parseBody(): Promise<unknown>; param(n: string): string } }) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const key = c.req.param('key')
    const locale = shell.selection(`/?locale=${encodeURIComponent(fieldOf(body, 'locale') ?? '')}`).locale.id
    return { body, key, locale, back: shell.backFor(body, key) }
  }

  const app = new Acryl()
    .get('/', (c) => c.html(pageFor(c.req.url)))
    .post('/segments/:key', async (c) => {
      const { body, key, locale, back } = await form(c)
      return respond(c, back, async () => {
        const before = desk.segment(key, locale)
        const after = await desk.edit(key, locale, fieldOf(body, 'target'))
        return after === before ? `No change to ${key}.` : after.state === 'empty' ? `${key} is untranslated again.` : `Draft saved for ${key}.`
      })
    })
    .post('/segments/:key/approve', async (c) => {
      const { key, locale, back, body } = await form(c)
      return respond(c, back, async () => {
        // A typed but unsaved change is saved first, so what is approved is what is on the screen.
        await desk.edit(key, locale, fieldOf(body, 'target'))
        await desk.approve(key, locale)
        return `Approved ${key}.`
      })
    })
    .post('/segments/:key/reopen', async (c) => {
      const { key, locale, back } = await form(c)
      return respond(c, back, async () => {
        await desk.reopen(key, locale)
        return `${key} reopened for editing; it needs review again.`
      })
    })

  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(c.req.url))))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'editor',
      title: 'Localization',
      render: () => `<p><b>${escapeHtml(desk.state.project)}</b> · ${String(desk.state.locales.length)} locales · ${String(desk.state.keys.length)} strings</p>`,
    }),
  )
}

