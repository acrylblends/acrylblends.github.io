/** Rooms (aside) and Copy room code (header): the transfer rooms to switch between, create a room for a file, join one by its code, close one. "Copy room code" shows the code (and copies it when the browser allows). */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { percentOf, sizeLabel } from '../swarmdrop/index.ts'
import { escapeHtml, fieldOf, swarmErrorOf, withNotice } from '../swarm-shell/index.ts'

export const name = 'rooms'
export const inject = ['router', 'swarm', 'swarmShell']

export function apply(ctx: Context): void {
  const shell = ctx.swarmShell
  const swarm = ctx.swarm
  const top = (sel: ReturnType<typeof shell.selection>): string => `<form method="post" action="${shell.href(`/rooms/${encodeURIComponent(sel.room.id)}/copy`)}">${shell.hidden(sel)}<button class="btn" id="copy" type="submit" data-code="${escapeHtml(sel.room.code)}">Copy room code</button></form><script>(function(){var b=document.getElementById('copy');if(b)b.addEventListener('click',function(){try{navigator.clipboard.writeText(b.dataset.code)}catch(e){}})})()</script>`
  const render = (sel: ReturnType<typeof shell.selection>): string => {
    const rows = swarm.state.rooms.map((r) => `<div class="roomlink${r.id === sel.room.id ? ' sel' : ''}" data-room="${escapeHtml(r.id)}"><a href="${shell.hrefFor('/', { room: r.id })}"${r.id === sel.room.id ? ' aria-current="true"' : ''}><b>${escapeHtml(r.id)}</b> · ${escapeHtml(r.name)}<br><span class="muted">${escapeHtml(sizeLabel(r.sizeMb))} · ${String(percentOf(r))}%${r.completedAt === undefined ? (r.paused ? ' · paused' : '') : ' · complete'}</span></a></div>`).join('')
    return `<section class="panel"><h2>Transfer rooms</h2><div id="rooms">${rows}</div><form class="form" method="post" action="${shell.href('/rooms/join')}"><div><label for="code">Join a room by code</label><input id="code" name="code" placeholder="SWM-4K8P-Q2" maxlength="20" required></div><button class="btn small" type="submit">Join room</button></form><form class="form" method="post" action="${shell.href('/rooms')}"><div><label for="fname">New room: file name</label><input id="fname" name="name" maxlength="60" required placeholder="report.pdf"></div><div><label for="fsize">Size (MB)</label><input id="fsize" name="size" type="number" min="1" max="50000" value="100" required></div><button class="btn small" type="submit">Create room</button></form><form method="post" action="${shell.href(`/rooms/${encodeURIComponent(sel.room.id)}/close`)}" style="margin-top:10px"><button class="btn small" type="submit">Close this room</button></form></section>`
  }
  const respond = async (c: { redirect(url: string, status: 303): Response }, ok: string, fallback: string, work: () => Promise<{ id: string; text: string }>) => {
    try {
      const r = await work()
      return c.redirect(withNotice(shell.hrefFor('/', { room: r.id }), 'ok', r.text), 303)
    } catch (error) {
      const refusal = swarmErrorOf(error)
      if (refusal === undefined) throw error
      return c.redirect(withNotice(fallback, 'error', refusal.message), 303)
    }
    void ok
  }
  const app = new Acryl()
    .post('/rooms/join', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      return respond(c, '', shell.href('/'), async () => {
        const r = swarm.joinRoom(fieldOf(body, 'code'))
        return { id: r.id, text: `Joined room ${r.id} (${r.name}).` }
      })
    })
    .post('/rooms', async (c) => {
      const body = (await c.req.parseBody()) as Record<string, unknown>
      return respond(c, '', shell.href('/'), async () => {
        const r = await swarm.createRoom(fieldOf(body, 'name'), fieldOf(body, 'size'))
        return { id: r.id, text: `Room ${r.id} created for ${r.name}. Code ${r.code}.` }
      })
    })
    .post('/rooms/:id/copy', async (c) => {
      const id = c.req.param('id')
      return respond(c, '', shell.href('/'), async () => ({ id, text: `Room code ${swarm.room(id).code} (synthetic) is ready to share.` }))
    })
    .post('/rooms/:id/close', async (c) => {
      const id = c.req.param('id')
      return respond(c, '', shell.href('/'), async () => {
        const name = swarm.room(id).name
        await swarm.closeRoom(id)
        return { id: swarm.state.rooms[0]?.id ?? '', text: `Room for ${name} closed.` }
      })
    })
  ctx.router.route(shell.prefix === '' ? '/' : shell.prefix, app)
  ctx.effect(() => shell.side({ id: 'rooms-top', column: 'actions', order: 10, render: top }))
  ctx.effect(() => shell.side({ id: 'rooms', column: 'aside', order: 30, render }))
}
