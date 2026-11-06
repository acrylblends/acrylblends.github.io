/** The transfer room, the first page (`/`): the file hero with its progress, speed and time remaining. Everything else on the page is a part other plugins add. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type {} from '../home/index.ts'
import { CHUNKS, RANGES, count, etaLabel, percentOf, rateLabel, rateOf, sizeLabel } from '../swarmdrop/index.ts'
import { escapeHtml } from '../swarm-shell/index.ts'

export const name = 'room'
export const inject = ['router', 'swarm', 'swarmShell', 'home']

export function apply(ctx: Context): void {
  const shell = ctx.swarmShell
  const swarm = ctx.swarm
  const hero = (sel: ReturnType<typeof shell.selection>): string => {
    const r = sel.room
    const pct = percentOf(r)
    const ext = (r.name.split('.').pop() ?? '').slice(0, 3).toUpperCase()
    return `<section class="hero" aria-label="Transfer"><div class="file"><div class="fileicon" aria-hidden="true">${escapeHtml(ext === '' ? 'FILE' : ext)}</div><div><div class="sub">${r.completedAt === undefined ? 'ACTIVE TRANSFER' : 'COMPLETED TRANSFER'} · ${r.direction.toUpperCase()}${r.paused && r.completedAt === undefined ? ' · PAUSED' : ''}</div><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(sizeLabel(r.sizeMb))} · ${CHUNKS.toLocaleString('en-US')} chunks · SHA-256 fixture</small></div></div><div class="bigprogress"><strong id="percent">${String(pct)}%</strong><div class="track" role="progressbar" aria-valuenow="${String(pct)}" aria-valuemin="0" aria-valuemax="100"><i id="progress" style="width:${String(pct)}%"></i></div><div class="sub" id="speed">${escapeHtml(rateLabel(rateOf(r)))} · ${escapeHtml(etaLabel(r))}</div><div class="sub">${String(count(r, 'v'))} of ${String(RANGES)} ranges verified</div></div></section>`
  }
  const pageFor = (url: string): string => shell.page({ title: `Room ${shell.selection(url).room.id}`, url })
  const app = new Acryl().get('/', (c) => c.html(pageFor(c.req.url)))
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  if (shell.prefix !== '') ctx.router.route('/', new Acryl().get(`${shell.prefix}/`, (c) => c.html(pageFor(c.req.url))))
  ctx.effect(() => shell.side({ id: 'hero', column: 'hero', order: 10, render: hero }))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'room',
      title: 'Swarm',
      render: () => `<p><b>${String(swarm.state.rooms.length)}</b> transfer rooms</p>`,
    }),
  )
}
