/**
 * The languages settings page: which five languages the library knows, the file extension each one gets, and how much of the library each holds.
 * It is read-only by design: a language is a property of the code, not a label someone renames.
 *
 * Route (under the shell's prefix): GET /settings/languages.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { LANGUAGES } from '../snippets/index.ts'
import { badge } from '../snips-shell/index.ts'

export const name = 'language-settings'
export const inject = ['snippets', 'shell', 'router']

const EXTENSIONS: Readonly<Record<string, string>> = {
  TypeScript: '.ts',
  JavaScript: '.js',
  Python: '.py',
  SQL: '.sql',
  Shell: '.sh',
}

export function apply(ctx: Context): void {
  const { snippets, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const counts = new Map(snippets.languages().map((item) => [item.language, item.count]))
  const rows = LANGUAGES.map((language) => {
    const count = counts.get(language) ?? 0
    return `<tr><td>${badge(language)} <b>${e(language)}</b></td><td>${e(EXTENSIONS[language] ?? '')}</td><td>${String(count)} snippets</td><td><a href="${shell.href(`/snippets?language=${encodeURIComponent(language)}`)}">Browse ${e(language)}</a></td></tr>`
  }).join('')
  const main = `<div class="i-toolbar"><div><h1>Languages</h1><p>The five languages the library knows and the file name each snippet gets</p></div></div><section class="i-section"><header><b>Supported languages</b><small>Read-only: a snippet's language comes from the snippet</small></header><table><thead><tr><th>LANGUAGE</th><th>EXTENSION</th><th>IN THE LIBRARY</th><th></th></tr></thead><tbody>${rows}</tbody></table></section><div class="i-form"><h2>How it works</h2><p class="hint">A snippet's language is chosen in the editor and decides its badge, its file name and its syntax colours. Changing a snippet's language changes its file name; the code itself is never rewritten.</p><div class="actions"><a class="primary" href="${shell.href('/new')}" style="background:#214f3e;color:white">New snippet</a><a href="${shell.href('/snippets')}">Back to the library</a></div></div>`

  const app = new Acryl().get('/settings/languages', (c) => c.html(shell.page({ active: 'language-settings', title: 'Languages', crumbs: ['Library', 'Settings', 'Languages'], main })))
  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'language-settings', label: 'Languages', icon: '⌗', path: '/settings/languages', order: 90, group: 'SETTINGS' }))
}
