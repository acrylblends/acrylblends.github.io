/**
 * The canvas, the first page (`/`): the browser-framed live preview of the current page, built from its sections; clicking a section selects it for the
 * inspector. In preview mode the outlines go and the editor's panels fold away, with a Desktop / Mobile switch.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { escapeHtml } from '../builder-shell/index.ts'
import { type Section, type Site, KIND_NAME, textColorOf } from '../pagefoundry/index.ts'

export const name = 'canvas'
export const inject = ['router', 'site', 'builderShell', 'home']

const lines = (text: string): string => escapeHtml(text).replaceAll('\n', '<br>')

function sectionHtml(s: Section, accent: string, serif: boolean, selected: boolean, link: string): string {
  const cls = `sec ${s.kind} w-${s.width}${s.visibility === 'hidden-mobile' ? ' hidden-mobile' : ''}${serif ? ' serif' : ''}${selected ? ' selected' : ''}`
  const text = textColorOf(s.kind)
  const go = s.button === '' ? '' : `<span class="go" style="background:${accent}">${escapeHtml(s.button)}</span>`
  let inner = ''
  if (s.kind === 'hero') inner = `<div class="eyebrow">Independent digital studio</div><h1>${lines(s.headline)}</h1>${s.body === '' ? '' : `<p>${escapeHtml(s.body)}</p>`}${go}`
  else if (s.kind === 'features') inner = `<h2>${lines(s.headline)}</h2><div class="featuregrid">${s.items.map((i) => `<div class="feature"><b class="h">${escapeHtml(i.title)}</b><p>${escapeHtml(i.text)}</p></div>`).join('')}</div>`
  else if (s.kind === 'quote') inner = `<blockquote>${lines(s.headline)}</blockquote>${s.body === '' ? '' : `<small>${escapeHtml(s.body)}</small>`}`
  else inner = `<div><b class="h">${lines(s.headline)}</b><br><small>${escapeHtml(s.body)}</small></div>${go}`
  return `<a class="${cls}" href="${link}" data-section="${escapeHtml(KIND_NAME[s.kind])}" data-section-id="${escapeHtml(s.id)}"${selected ? ' aria-current="true"' : ''} style="background:${s.bg};color:${text}"><div class="inner">${inner}</div></a>`
}

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.builderShell
  const site: Site = ctx.site
  const sel = shell.selection(url)
  const view = site.state.view
  const { theme } = site.state
  const sections = sel.page.sections.map((s) => sectionHtml(s, theme.accent, theme.serif, !view.preview && s.id === sel.section?.id, shell.hrefFor('/', { pageId: sel.page.id, sectionId: s.id }))).join('')
  const nav = site.state.pages.map((p) => `<a href="${shell.hrefFor('/', { pageId: p.id })}"${p.id === sel.page.id ? ' class="on"' : ''}>${escapeHtml(p.name)}</a>`).join('')
  const devices = view.preview
    ? `<div class="devices"><form method="post" action="${shell.href('/preview')}"><input type="hidden" name="on" value="on"><input type="hidden" name="device" value="desktop"><input type="hidden" name="back" value="${escapeHtml(shell.hrefFor('/', { pageId: sel.page.id }))}"><button class="btn small${view.device === 'desktop' ? ' on' : ''}" type="submit">Desktop</button></form><form method="post" action="${shell.href('/preview')}"><input type="hidden" name="on" value="on"><input type="hidden" name="device" value="mobile"><input type="hidden" name="back" value="${escapeHtml(shell.hrefFor('/', { pageId: sel.page.id }))}"><button class="btn small${view.device === 'mobile' ? ' on' : ''}" type="submit">Mobile</button></form></div>`
    : ''
  const main = `<section class="stage${view.preview && view.device === 'mobile' ? ' mobile' : ''}" aria-label="Page preview">${shell.notice(url)}${devices}<div class="browserbar"><div class="lights" aria-hidden="true"><i></i><i></i><i></i></div><span class="url">${escapeHtml(site.state.domain)}${sel.page.id === site.state.pages[0]?.id ? '' : `/${escapeHtml(sel.page.id)}`}</span><span aria-hidden="true">↻</span></div><div class="preview" id="previewpage"><nav class="webnav"><b class="${theme.serif ? 'serif' : ''}">${escapeHtml(site.state.name.split(' ')[0]?.toLowerCase() ?? 'site')}.</b><div>${nav}</div></nav>${sections === '' ? '<div style="padding:60px;text-align:center;color:#758078">This page has no sections yet. Add a block from the library.</div>' : sections}</div></section>`
  return shell.page({ title: sel.page.name, main, url })
}

export function apply(ctx: Context): void {
  const shell = ctx.builderShell
  const app = new Acryl().get('/', (c) => c.html(pageFor(ctx, c.req.url)))
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(ctx, c.req.url))))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'canvas',
      title: 'Site',
      render: () => `<p><b>${escapeHtml(ctx.site.state.name)}</b> · ${String(ctx.site.state.pages.length)} pages · ${String(ctx.site.state.builds.length)} builds</p>`,
    }),
  )
}
