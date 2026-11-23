/**
 * Workflow automation over HTTP: the JSON API the editor calls (`/automation/api/...`), the live event stream (`/automation/api/events`, SSE) and the
 * webhook entry other services call (`/automation/webhooks/<token>`). Routes are an adapter: every rule lives in the `automation` service, which the
 * agent tools call too (the spec, 13).
 *
 * Every change is a POST with a JSON body from this app's own page: a request from another site (a different Origin, or a form post that is not
 * JSON) is refused, so a web page in the person's browser cannot drive the automations on this machine. The webhook entry is the one route meant for
 * other callers; it answers only for an active workflow whose trigger is a webhook, by its unguessable token, with a 1 MB body limit.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl, type Context as RequestContext } from '../router/src/index.ts'
import { streamSSE } from '../router/src/helpers/index.ts'
import type {} from '../automation/index.ts'
import { Refusal, type Automation, type AutomationEvent, type Placement, type RunStatus, type StepSpec } from '../automation/index.ts'

export const name = 'automation-api'
export const inject = ['automation', 'automationScheduler', 'router']

export const API = '/automation/api'
export const WEBHOOKS = '/automation/webhooks'
const MAX_WEBHOOK_BYTES = 1_000_000

/** A change must come from this app's page: JSON (a cross-site form cannot send it without a preflight) and, when the browser says, the same origin. */
function ownPage(c: RequestContext): string | undefined {
  if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) return 'a change is sent as JSON'
  const origin = c.req.header('origin')
  if (origin !== undefined && origin !== 'null') {
    const host = c.req.header('host')
    try { if (new URL(origin).host !== host) return 'a change must come from this app' } catch { return 'a change must come from this app' }
  }
  return undefined
}

/** A path parameter; the route matched, so it is there. */
const param = (c: RequestContext, key: string): string => (c.req.param(key) as string | undefined) ?? ''

const status = (error: Refusal): 400 | 404 | 409 => (error.code === 'not_found' ? 404 : error.code === 'invalid' ? 400 : 409)

export function automationApi(automation: Automation, describe: (id: string) => unknown, scheduled: () => unknown[] = () => []): Acryl {
  type Handler = (c: RequestContext, body: Record<string, unknown>) => Promise<unknown> | unknown
  const change = (handler: Handler) => async (c: RequestContext) => {
    const refused = ownPage(c)
    if (refused !== undefined) return c.json({ error: refused, code: 'refused' }, 403)
    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ error: 'the body is not JSON', code: 'invalid' }, 400) }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return c.json({ error: 'the body is a JSON object', code: 'invalid' }, 400)
    try {
      return c.json((await handler(c, body as Record<string, unknown>)) ?? { ok: true })
    } catch (error) {
      if (error instanceof Refusal) return c.json({ error: error.message, code: error.code }, status(error))
      throw error
    }
  }
  const read = (handler: (c: RequestContext) => unknown) => (c: RequestContext) => {
    try { return c.json(handler(c) as object) } catch (error) {
      if (error instanceof Refusal) return c.json({ error: error.message, code: error.code }, status(error))
      throw error
    }
  }
  const revision = (body: Record<string, unknown>): number | undefined => (typeof body.revision === 'number' ? body.revision : undefined)
  const text = (value: unknown, field: string): string => {
    if (typeof value !== 'string' || value.trim() === '') throw new Refusal('invalid', `${field} is required`)
    return value
  }

  return new Acryl()
    .get(`${API}/catalog`, read(() => ({ integrations: automation.catalog.integrations() })))
    .post(`${API}/catalog/refresh`, change(async (_c, body) => {
      const kind = body.kind === 'trigger' ? 'trigger' : 'action'
      try {
        return await automation.catalog.refresh(text(body.integration, 'integration'), kind, text(body.operation, 'operation'), text(body.property, 'property'), (typeof body.input === 'object' && body.input !== null ? body.input : {}) as Record<string, unknown>)
      } catch (cause) {
        throw new Refusal('invalid', cause instanceof Error ? cause.message : String(cause))
      }
    }))
    .get(`${API}/schedules`, read(() => ({ schedules: scheduled() })))
    .get(`${API}/workflows`, read(() => ({ workflows: automation.list().map((w) => describe(w.id)) })))
    .post(`${API}/workflows`, change(async (_c, body) => describe((await automation.create({ name: text(body.name, 'name'), description: typeof body.description === 'string' ? body.description : '' })).id)))
    .post(`${API}/workflows/import`, change(async (_c, body) => { const { workflow, report } = await automation.importWorkflow(body.file); return { workflow: describe(workflow.id), report } }))
    .get(`${API}/workflows/:id`, read((c) => describe(param(c, 'id'))))
    .get(`${API}/workflows/:id/export`, read((c) => automation.exportWorkflow(param(c, 'id'))))
    .post(`${API}/workflows/:id/rename`, change(async (c, body) => describe((await automation.rename(param(c, 'id'), text(body.name, 'name'), typeof body.description === 'string' ? body.description : undefined)).id)))
    .post(`${API}/workflows/:id/duplicate`, change(async (c) => describe((await automation.duplicate(param(c, 'id'))).id)))
    .post(`${API}/workflows/:id/delete`, change(async (c) => { await automation.remove(param(c, 'id')); return { ok: true } }))
    .post(`${API}/workflows/:id/operations`, change(async (c, body) => describe((await automation.operate(param(c, 'id'), body.operation, revision(body))).id)))
    .post(`${API}/workflows/:id/trigger`, change(async (c, body) => describe((await automation.setTrigger(param(c, 'id'), { integration: text(body.integration, 'integration'), trigger: text(body.trigger, 'trigger'), ...(typeof body.input === 'object' && body.input !== null ? { input: body.input as Record<string, unknown> } : {}), ...(typeof body.displayName === 'string' ? { displayName: body.displayName } : {}) }, revision(body))).id)))
    .post(`${API}/workflows/:id/steps`, change(async (c, body) => {
      const { workflow, step } = await automation.addStep(param(c, 'id'), body.step as StepSpec, (body.placement ?? {}) as Placement, revision(body))
      return { step, workflow: describe(workflow.id) }
    }))
    .post(`${API}/workflows/:id/steps/:step/update`, change(async (c, body) => describe((await automation.updateStep(param(c, 'id'), param(c, 'step'), body.change as never, revision(body))).id)))
    .post(`${API}/workflows/:id/steps/:step/delete`, change(async (c, body) => describe((await automation.removeStep(param(c, 'id'), param(c, 'step'), revision(body))).id)))
    .post(`${API}/workflows/:id/validate`, change((c) => automation.validate(param(c, 'id'))))
    .post(`${API}/workflows/:id/publish`, change(async (c) => describe((await automation.publish(param(c, 'id'))).id)))
    .post(`${API}/workflows/:id/activate`, change(async (c) => describe((await automation.setStatus(param(c, 'id'), 'active')).id)))
    .post(`${API}/workflows/:id/deactivate`, change(async (c) => describe((await automation.setStatus(param(c, 'id'), 'inactive')).id)))
    .post(`${API}/workflows/:id/webhook/rotate`, change(async (c) => describe((await automation.rotateWebhook(param(c, 'id'))).id)))
    .post(`${API}/workflows/:id/test`, change(async (c, body) => automation.start(param(c, 'id'), { trigger: 'test', payload: body.payload })))
    .post(`${API}/workflows/:id/run`, change(async (c, body) => automation.start(param(c, 'id'), { trigger: 'manual', payload: body.payload })))
    .get(`${API}/runs`, read((c) => ({ runs: automation.runs({ ...(c.req.query('workflowId') === undefined ? {} : { workflowId: c.req.query('workflowId')! }), ...(c.req.query('status') === undefined ? {} : { status: c.req.query('status') as RunStatus }), limit: Math.min(200, Number(c.req.query('limit') ?? 50) || 50) }) })))
    .get(`${API}/runs/:id`, read((c) => automation.run(param(c, 'id'))))
    .post(`${API}/runs/:id/cancel`, change(async (c) => automation.cancel(param(c, 'id'))))
    .post(`${API}/runs/:id/retry`, change(async (c) => {
      const run = automation.run(param(c, 'id'))
      return automation.start(run.workflowId, { trigger: run.trigger === 'test' ? 'test' : 'manual', payload: run.triggerOutput })
    }))
    .get(`${API}/approvals`, read(() => ({ approvals: automation.approvals() })))
    .post(`${API}/approvals/:id/approve`, change((c) => automation.decide(param(c, 'id'), true)))
    .post(`${API}/approvals/:id/decline`, change((c) => automation.decide(param(c, 'id'), false)))
    .get(`${API}/connections`, read(() => ({ connections: automation.connections() })))
    .post(`${API}/connections`, change(async (_c, body) => automation.saveConnection({ name: text(body.name, 'name'), integration: text(body.integration, 'integration'), value: body.value })))
    .post(`${API}/connections/:name/delete`, change(async (c) => { await automation.removeConnection(param(c, 'name')); return { ok: true } }))
    .get(`${API}/events`, (c) => {
      const signal = c.req.raw.signal
      return streamSSE(c, async (stream) => {
        let end = (): void => {}
        const ended = new Promise<void>((resolve) => { end = resolve })
        stream.onAbort(end)
        signal.addEventListener('abort', end, { once: true })
        const send = (event: AutomationEvent): void => { stream.writeSSE({ event: event.type, data: JSON.stringify(event) }).catch(end) }
        const unsubscribe = automation.on(send)
        const beat = setInterval(() => { stream.writeSSE({ event: 'ping', data: '' }).catch(end) }, 15_000)
        try {
          await stream.writeSSE({ event: 'ready', data: '' })
          await ended
        } finally {
          clearInterval(beat)
          signal.removeEventListener('abort', end)
          unsubscribe()
        }
      })
    })
    .all(`${WEBHOOKS}/:token/:mode?`, async (c) => {
      const mode = c.req.param('mode') as string | undefined
      if (mode !== undefined && mode !== 'test') return c.json({ error: 'not found' }, 404)
      const workflow = automation.byWebhookToken(param(c, 'token'))
      const live = mode === undefined
      const version = live ? workflow?.published : workflow?.draft
      // Only a workflow whose trigger is a webhook answers; a live call needs it active.
      if (workflow === undefined || version === undefined || (live && workflow.status !== 'active') || !isWebhookTrigger(version.trigger)) return c.json({ error: 'not found' }, 404)
      const length = Number(c.req.header('content-length') ?? 0)
      if (length > MAX_WEBHOOK_BYTES) return c.json({ error: 'the body is larger than 1 MB' }, 413)
      const rawBody = c.req.method === 'GET' || c.req.method === 'HEAD' ? '' : await c.req.text()
      if (Buffer.byteLength(rawBody) > MAX_WEBHOOK_BYTES) return c.json({ error: 'the body is larger than 1 MB' }, 413)
      let body: unknown = rawBody
      try { if ((c.req.header('content-type') ?? '').includes('json') && rawBody !== '') body = JSON.parse(rawBody) } catch { /* kept as text */ }
      const headers = Object.fromEntries([...c.req.raw.headers].filter(([key]) => key !== 'cookie' && key !== 'authorization-proxy'))
      try {
        const run = await automation.start(workflow.id, { trigger: live ? 'webhook' : 'test', payload: { body, rawBody, headers, queryParams: c.req.query(), method: c.req.method } })
        const response = run.response as { status?: number, body?: unknown, headers?: Record<string, string> } | undefined
        if (response !== undefined && typeof response === 'object') return c.json((response.body ?? {}) as object, (response.status ?? 200) as 200, response.headers ?? {})
        return c.json({ ok: run.status !== 'failed', runId: run.id, status: run.status })
      } catch (error) {
        if (error instanceof Refusal) return c.json({ error: error.message }, error.code === 'refused' ? 401 : status(error))
        throw error
      }
    })
}

const isWebhookTrigger = (trigger: { type: string, settings?: { qadamName?: string } }): boolean => trigger.type === 'PIECE_TRIGGER' && trigger.settings?.qadamName === '@aiqadam/qadam-webhook'

/** A workflow as the editor and the agent read it: the record, the draft's problems, and where its webhook answers. */
export function describeWorkflow(automation: Automation, id: string): Record<string, unknown> {
  const workflow = automation.get(id)
  const validation = automation.validate(id)
  return {
    ...workflow,
    validation,
    webhookPath: `${WEBHOOKS}/${workflow.webhookToken}`,
    changedSincePublish: workflow.published === undefined ? true : JSON.stringify(workflow.published.trigger) !== JSON.stringify(workflow.draft.trigger),
  }
}

/** `prefix`: where the app is mounted, the root on its own server and the frame's canvas prefix (`/app`) when the frame hosts it (src/app.ts passes it). */
export function apply(ctx: Context, config: { readonly prefix?: string } = {}): void {
  const prefix = config.prefix ?? ''
  const automation = ctx.automation
  ctx.router.route(prefix === '' ? '/' : prefix, automationApi(automation, (id) => describeWorkflow(automation, id), () => ctx.automationScheduler.scheduled()))
}
