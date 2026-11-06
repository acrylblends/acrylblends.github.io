/**
 * Stack comparison (`/stack`): the packages a person added, each pinned to a version and compared with its newest; peer-requirement warnings; and the
 * manifest and install commands the stack would produce. Add (`POST /stack`), re-pin, remove and clear.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { atlasErrorOf, backTo, escapeHtml, fieldOf, withNotice } from '../foundry-shell/index.ts'
import { commandsOf, latestOf, manifestOf, standing, warningsOf } from '../foundry/index.ts'

export const name = 'stack'
export const inject = ['router', 'atlas', 'foundryShell']

function pageFor(ctx: Context, url: string): string {
  const shell = ctx.foundryShell
  const atlas = ctx.atlas
  const { packages, stack } = atlas.state
  const back = shell.link('/stack', url)
  const rows = stack
    .map((e) => {
      const p = packages.find((x) => x.id === e.packageId)
      if (p === undefined) return ''
      const options = p.versions.map((v) => `<option value="${escapeHtml(v.version)}"${v.version === e.version ? ' selected' : ''}>${escapeHtml(v.version)} · ${escapeHtml(v.channel)}</option>`).join('')
      const id = encodeURIComponent(p.id)
      return `<tr data-stack="${escapeHtml(p.id)}"><td><a href="${shell.link('/', url, { package: p.id, q: '' })}"><b>${escapeHtml(p.name)}</b></a><br><small class="muted">${escapeHtml(p.kind)}</small></td><td><form class="inline" method="post" action="${shell.href(`/stack/${id}/pin`)}"><input type="hidden" name="back" value="${escapeHtml(back)}"><label class="sr" for="v-${escapeHtml(p.id)}">Version of ${escapeHtml(p.name)}</label><select class="input" id="v-${escapeHtml(p.id)}" name="version">${options}</select> <button class="btn small" type="submit">Pin</button></form></td><td>${escapeHtml(latestOf(p))}</td><td>${escapeHtml(standing(p, e.version))}</td><td><form class="inline" method="post" action="${shell.href(`/stack/${id}/remove`)}"><input type="hidden" name="back" value="${escapeHtml(back)}"><button class="btn small" type="submit" aria-label="Remove ${escapeHtml(p.name)}">Remove</button></form></td></tr>`
    })
    .join('')
  const warnings = warningsOf(packages, stack).map((w) => `<div class="warnbox" role="status" data-warning="${escapeHtml(w.packageId)}">${escapeHtml(w.text)}</div>`).join('')
  const manifest = manifestOf(packages, stack)
  const commands = commandsOf(packages, stack)
  const preview =
    stack.length === 0
      ? '<div class="empty"><b>The stack is empty.</b><br>Add packages from the catalogue to compare their versions and preview a manifest.</div>'
      : `<div class="scroll"><table class="table"><thead><tr><th scope="col">Package</th><th scope="col">Pinned version</th><th scope="col">Newest</th><th scope="col">Standing</th><th scope="col"></th></tr></thead><tbody>${rows}</tbody></table></div>${warnings}`
  const main = `<div class="cap">Stack comparison <span class="muted" id="count">${String(stack.length)} ${stack.length === 1 ? 'package' : 'packages'}</span></div>${preview}
${stack.length === 0 ? '' : `<div class="cap" style="border-top:1px solid var(--line2)">Manifest preview <span><button class="btn small" type="button" data-copy="${escapeHtml(commands.join('\n'))}">Copy install commands</button> <form class="inline" method="post" action="${shell.href('/stack/clear')}"><input type="hidden" name="back" value="${escapeHtml(back)}"><button class="btn small" type="submit">Clear stack</button></form></span></div><pre class="manifest" id="manifest">${escapeHtml(`${commands.map((c) => `$ ${c}`).join('\n')}\n\n${JSON.stringify(manifest, null, 2)}`)}</pre>`}`
  return shell.page({ title: 'Stack comparison', main, url, wide: true })
}

export function apply(ctx: Context): void {
  const shell = ctx.foundryShell
  const atlas = ctx.atlas
  const refused = (c: { redirect(url: string, status: 303): Response }, to: string, error: unknown) => {
    const refusal = atlasErrorOf(error)
    if (refusal === undefined) throw error
    return c.redirect(withNotice(to, 'error', refusal.message), 303)
  }
  const app = new Acryl()
    .get('/stack', (c) => c.html(pageFor(ctx, c.req.url)))
    .post('/stack', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const to = backTo(shell, fieldOf(body, 'back'), shell.href('/'))
      try {
        const id = fieldOf(body, 'package') ?? ''
        const entry = await atlas.addToStack(id, fieldOf(body, 'version'))
        return c.redirect(withNotice(to, 'ok', `${atlas.package(id).name} ${entry.version} added to the local stack comparison.`), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
    .post('/stack/clear', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const to = backTo(shell, fieldOf(body, 'back'), shell.href('/stack'))
      try {
        await atlas.clearStack()
        return c.redirect(withNotice(to, 'ok', 'The stack is empty.'), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
    .post('/stack/:id/pin', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const to = backTo(shell, fieldOf(body, 'back'), shell.href('/stack'))
      try {
        const e = await atlas.pin(c.req.param('id'), fieldOf(body, 'version'))
        return c.redirect(withNotice(to, 'ok', `${atlas.package(e.packageId).name} pinned to ${e.version}.`), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
    .post('/stack/:id/remove', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      const to = backTo(shell, fieldOf(body, 'back'), shell.href('/stack'))
      try {
        const name = atlas.package(c.req.param('id')).name
        await atlas.removeFromStack(c.req.param('id'))
        return c.redirect(withNotice(to, 'ok', `${name} removed from the stack.`), 303)
      } catch (error) {
        return refused(c, to, error)
      }
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.nav({ id: 'stack', label: () => `Stack (${String(atlas.state.stack.length)})`, path: '/stack', order: 10 }))
}
