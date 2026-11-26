/**
 * The content machine over HTTP, for its screen: projects and their settings, uploads, the steps' actions as jobs, the live event stream, the brand,
 * the library, the Settings page's services, and the project files (served with byte ranges, so the player seeks). Routes are an adapter: every rule
 * lives in the `content` service, which the agent's tools call too.
 *
 * A change comes only from this app's own page: JSON with no foreign Origin, or an upload with the `x-content-machine` header (a header a cross-site
 * page cannot send without a preflight this server never answers).
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl, type Context as RequestContext } from '../router/src/index.ts'
import { streamSSE } from '../router/src/helpers/index.ts'
import type {} from '../content/index.ts'
import { available, bool, describeService, type Machine, type MachineEvent, num, pick, Refusal, safeName, saveService, settingsChange, str } from '../content/index.ts'

export const name = 'content-api'
export const inject = ['content', 'router']

export const API = '/content/api'
const UPLOAD_HEADER = 'x-content-machine'
const MAX_UPLOAD = 8 * 1024 ** 3

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.srt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.json': 'application/json', '.mov': 'video/quicktime', '.webm': 'video/webm',
}

function ownPage(c: RequestContext, upload = false): string | undefined {
  if (upload) {
    if (c.req.header(UPLOAD_HEADER) !== 'upload') return 'an upload comes from this app\'s page'
  } else if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) return 'a change is sent as JSON'
  const origin = c.req.header('origin')
  if (origin !== undefined && origin !== 'null') {
    try { if (new URL(origin).host !== c.req.header('host')) return 'a change must come from this app' } catch { return 'a change must come from this app' }
  }
  return undefined
}

const param = (c: RequestContext, key: string): string => (c.req.param(key) as string | undefined) ?? ''
const status = (error: Refusal): 400 | 404 | 409 | 503 => (error.code === 'not_found' ? 404 : error.code === 'invalid' ? 400 : error.code === 'unavailable' ? 503 : 409)

/** Serves a file with byte ranges (a video player asks for pieces). */
export function serveFile(c: RequestContext, path: string, download?: string): Response {
  if (!existsSync(path)) return c.json({ error: 'no such file', code: 'not_found' }, 404)
  const size = statSync(path).size
  const type = TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'
  const headers: Record<string, string> = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-cache', ...(download ? { 'content-disposition': `attachment; filename="${download.replace(/"/g, '')}"` } : {}) }
  const range = /^bytes=(\d*)-(\d*)$/.exec(c.req.header('range') ?? '')
  if (range && size > 0) {
    const start = range[1] === '' ? Math.max(0, size - Number(range[2])) : Number(range[1])
    const end = range[1] !== '' && range[2] !== '' ? Math.min(Number(range[2]), size - 1) : size - 1
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
    return new Response(Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream, { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) } })
  }
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { status: 200, headers: { ...headers, 'content-length': String(size) } })
}

async function receive(c: RequestContext, path: string): Promise<number> {
  const body = c.req.raw.body
  if (!body) throw new Refusal('invalid', 'the upload is empty')
  const length = Number(c.req.header('content-length') ?? 0)
  if (length > MAX_UPLOAD) throw new Refusal('invalid', 'the file is larger than 8 GB')
  await pipeline(Readable.fromWeb(body as never), createWriteStream(path))
  const size = statSync(path).size
  if (size === 0) throw new Refusal('invalid', 'the upload is empty')
  return size
}

export function contentApi(machine: Machine): Acryl {
  type Handler = (c: RequestContext, body: Record<string, unknown>) => Promise<unknown> | unknown
  const fail = (c: RequestContext, error: unknown) => {
    if (error instanceof Refusal) return c.json({ error: error.message, code: error.code }, status(error))
    throw error
  }
  const change = (handler: Handler) => async (c: RequestContext) => {
    const refused = ownPage(c)
    if (refused !== undefined) return c.json({ error: refused, code: 'refused' }, 403)
    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ error: 'the body is not JSON', code: 'invalid' }, 400) }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return c.json({ error: 'the body is a JSON object', code: 'invalid' }, 400)
    try { return c.json((await handler(c, body as Record<string, unknown>)) ?? { ok: true }) } catch (error) { return fail(c, error) }
  }
  const read = (handler: (c: RequestContext) => unknown) => async (c: RequestContext) => {
    try { return c.json((await handler(c)) as object) } catch (error) { return fail(c, error) }
  }
  const features = () => machine.features.list().map((f) => ({
    id: f.id, title: f.title, order: f.order, summary: f.summary,
    actions: Object.entries(f.actions).map(([name, a]) => ({ name, title: a.title, description: a.description, input: a.input ?? null })),
  }))
  const projectView = (id: string) => ({ project: machine.get(id), jobs: machine.jobsOf(id).slice(0, 20) })

  return new Acryl()
    .get(`${API}/features`, read(() => ({ features: features() })))
    .get(`${API}/status`, read(async () => ({
      tools: { ffmpeg: await available(machine.tools.ffmpeg), ffprobe: await available(machine.tools.ffprobe), 'yt-dlp': await available('yt-dlp') },
      writer: describeService(machine.root, 'writer'),
      transcriber: describeService(machine.root, 'transcriber'),
    })))
    .post(`${API}/settings/:service`, change((c, body) => {
      const service = pick<'writer' | 'transcriber'>(param(c, 'service'), ['writer', 'transcriber'], 'service')
      saveService(machine.root, service, body)
      return describeService(machine.root, service)
    }))
    .get(`${API}/brand`, read(() => ({ brand: machine.brand() })))
    .post(`${API}/brand`, change((_c, body) => ({ brand: machine.setBrand(body as never) })))
    .get(`${API}/library`, read(() => ({ files: machine.library() })))
    .post(`${API}/library`, async (c) => {
      const refused = ownPage(c, true)
      if (refused !== undefined) return c.json({ error: refused, code: 'refused' }, 403)
      try {
        const name = safeName(c.req.query('name') ?? 'file')
        const temporary = `${machine.libraryDir}/.upload-${process.pid}-${Date.now()}`
        await receive(c, temporary)
        const file = machine.addToLibrary(name, readFileSync(temporary))
        rmSync(temporary, { force: true })
        return c.json({ file })
      } catch (error) { return fail(c, error) }
    })
    .get(`${API}/library/:file`, (c) => { try { return serveFile(c, machine.libraryFile(param(c, 'file'))) } catch (error) { return fail(c, error) } })
    .get(`${API}/projects`, read(() => ({ projects: machine.list() })))
    .post(`${API}/projects`, change((_c, body) => ({ project: machine.create(str(body.name, 120, 'name')) })))
    .get(`${API}/projects/:id`, read((c) => projectView(param(c, 'id'))))
    .post(`${API}/projects/:id/delete`, change((c) => { machine.remove(param(c, 'id')); return { ok: true } }))
    .post(`${API}/projects/:id/settings`, change((c, body) => {
      const id = param(c, 'id')
      const revision = typeof body.revision === 'number' ? body.revision : undefined
      return { project: machine.update(id, (p) => settingsChange(machine, p, body), revision) }
    }))
    .post(`${API}/projects/:id/removals/:rid`, change((c, body) => {
      const kept = bool(body.kept, 'kept')
      const rid = param(c, 'rid')
      return { project: machine.update(param(c, 'id'), (p) => {
        if (!p.removals.some((r) => r.id === rid)) throw new Refusal('not_found', `no suggestion ${rid}`)
        return { removals: p.removals.map((r) => (r.id === rid ? { ...r, kept } : r)), outputs: { ...p.outputs, cut: undefined, final: undefined } }
      }) }
    }))
    .post(`${API}/projects/:id/removals`, change((c, body) => {
      const start = num(body.start, 0, 86_400, 'start')
      const end = num(body.end, start + 0.05, 86_400, 'end')
      return { project: machine.update(param(c, 'id'), (p) => ({
        removals: [...p.removals, { id: `m${Date.now().toString(36)}`, start, end, reason: 'manual' as const, text: str(body.text ?? '', 400, 'text'), kept: false }].sort((a, b) => a.start - b.start),
        outputs: { ...p.outputs, cut: undefined, final: undefined },
      })) }
    }))
    .post(`${API}/projects/:id/upload`, async (c) => {
      const refused = ownPage(c, true)
      if (refused !== undefined) return c.json({ error: refused, code: 'refused' }, 403)
      try {
        const id = param(c, 'id')
        machine.get(id)
        const name = safeName(c.req.query('name') ?? 'upload')
        mkdirSync(machine.file(id, 'uploads'), { recursive: true })
        const bytes = await receive(c, machine.file(id, `uploads/${name}`))
        return c.json({ file: `uploads/${name}`, bytes })
      } catch (error) { return fail(c, error) }
    })
    .post(`${API}/projects/:id/run/:feature/:action`, change((c, body) => {
      const input = typeof body.input === 'object' && body.input !== null && !Array.isArray(body.input) ? (body.input as Record<string, unknown>) : {}
      return { job: machine.start(param(c, 'id'), param(c, 'feature'), param(c, 'action'), input).job }
    }))
    .post(`${API}/jobs/:job/stop`, change((c) => { machine.stop(param(c, 'job')); return { ok: true } }))
    .get(`${API}/projects/:id/files/*`, (c) => {
      try {
        const id = param(c, 'id')
        const prefix = `${API}/projects/${id}/files/`
        const path = decodeURIComponent(new URL(c.req.url).pathname.split(prefix)[1] ?? '')
        return serveFile(c, machine.file(id, path), c.req.query('download') === '1' ? `${machine.get(id).name}-${path.split('/').pop()}` : undefined)
      } catch (error) { return fail(c, error) }
    })
    .get(`${API}/events`, (c) => streamSSE(c, async (stream) => {
      const queue: MachineEvent[] = []
      let wake: (() => void) | undefined
      const off = machine.on((event) => { queue.push(event); wake?.() })
      stream.onAbort(off)
      await stream.writeSSE({ event: 'hello', data: '{}' })
      while (!stream.aborted) {
        const event = queue.shift()
        if (event) { await stream.writeSSE({ event: event.type, data: JSON.stringify(event) }); continue }
        await Promise.race([new Promise<void>((resolve) => { wake = resolve }), stream.sleep(15_000)])
        wake = undefined
        if (queue.length === 0) await stream.write(': keep-alive\n\n')
      }
      off()
    }))
}

export function apply(ctx: Context, config: { readonly prefix?: string } = {}): void {
  const prefix = config.prefix ?? ''
  ctx.router.route(prefix === '' ? '/' : prefix, contentApi(ctx.content))
}
