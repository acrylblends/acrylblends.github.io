/** Package detail (right column): the selected package's summary, version, install command with a Copy button, version history, and "Add to stack comparison" at a chosen version. */
import type { Context } from '@deepseek-ai/cordis'
import { escapeHtml } from '../foundry-shell/index.ts'
import { latestOf } from '../foundry/index.ts'

export const name = 'detail'
export const inject = ['router', 'atlas', 'foundryShell']

const installLine = (eco: string, dev: boolean, install: string): string => (eco === 'npm' ? `npm install ${dev ? '-D ' : ''}${install}` : eco === 'cargo' ? `cargo add ${install}` : `pip install ${install}`)

export function apply(ctx: Context): void {
  const shell = ctx.foundryShell
  const atlas = ctx.atlas
  const render = (q: ReturnType<typeof shell.query>, url: string): string => {
    const results = atlas.search({ q: q.q, group: q.group, framework: q.framework, language: q.language })
    const id = q.package !== '' ? q.package : (results[0]?.id ?? '')
    const pkg = atlas.state.packages.find((p) => p.id === id)
    if (pkg === undefined) return `<div class="cap">Package detail</div><div class="detail"><div class="empty">Pick a package to see its detail.</div></div>`
    const command = installLine(pkg.ecosystem, pkg.dev, pkg.install)
    const history = pkg.versions.map((v) => `<div><span>${escapeHtml(v.version)}</span><span class="meta">${escapeHtml(v.channel)}</span></div>`).join('')
    const entry = atlas.inStack(pkg.id)
    const back = shell.link('/', url, { package: pkg.id })
    const options = pkg.versions.map((v) => `<option value="${escapeHtml(v.version)}">${escapeHtml(v.version)} · ${escapeHtml(v.channel)}</option>`).join('')
    const stack = shell.has('stack')
      ? entry === undefined
        ? `<form method="post" action="${shell.href('/stack')}" style="margin-top:13px"><input type="hidden" name="package" value="${escapeHtml(pkg.id)}"><input type="hidden" name="back" value="${escapeHtml(back)}"><label class="sr" for="version">Version</label><select class="input" id="version" name="version" style="width:100%;margin-bottom:8px">${options}</select><button class="btn dark" style="width:100%" id="compare" type="submit">＋ Add to stack comparison</button></form>`
        : `<p class="note">In your stack at ${escapeHtml(entry.version)}. <a href="${shell.href('/stack')}">Open the stack</a></p>`
      : ''
    return `<div class="cap">Package detail</div><div class="detail"><h2 id="dname">${escapeHtml(pkg.name)}</h2><div class="meta" id="dtype">${escapeHtml(pkg.kind)} · v${escapeHtml(latestOf(pkg))}</div>
<p id="ddesc" style="line-height:1.6">${escapeHtml(pkg.summary)}</p>
<div class="meta">${escapeHtml(pkg.languages.join(', '))} · runs on ${escapeHtml(pkg.runtimes.join(', '))}${pkg.requires.length === 0 ? '' : ` · needs ${pkg.requires.map((r) => `${escapeHtml(atlas.state.packages.find((p) => p.id === r.packageId)?.name ?? r.packageId)} ${String(r.minMajor)}+`).join(', ')}`}</div>
<div class="install"><button id="copy" type="button" data-copy="${escapeHtml(command)}">Copy</button><span id="install">${escapeHtml(command)}</span></div>
<div class="versions"><b>Version history</b>${history}</div>
<div class="note">Illustrative catalogue metadata only. Versions and commands are seed examples; package resolution and installation are not performed here.</div>${stack}</div>`
  }
  ctx.effect(() => shell.side({ id: 'detail', column: 'right', order: 10, render }))
}
