/**
 * "Save as workflow" and its replay, through the Workflow Automation Blend (acrylblends.workflow-automation), never a second workflow engine: a run's
 * tool steps become a workflow there (a manual trigger, then one HTTP step per tool that posts it back to this computer's `/api/aos/replay`), published,
 * and "Run again" starts it with that app's own API. The replay calls the same tools by name, so it does what the run did, and no model is called.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Door, LauncherService } from '@acryldev/launcher-desktop/node'
import { DesktopRefusal } from './desktop.ts'

export const WORKFLOW_BLEND = 'acrylblends.workflow-automation'
export interface WorkflowStep { readonly tool: string; readonly args?: unknown }

type Fetch = typeof fetch

/** The workflow app's API, found through its running door (its loopback address); its routes sit under the frame's `/app` when the frame hosts it. */
async function apiOf(launcher: LauncherService, fetchImpl: Fetch): Promise<string> {
  const app = launcher.state().apps.find((a) => a.blend === WORKFLOW_BLEND)
  if (app === undefined) throw new DesktopRefusal('Workflow Automation is not on this computer: make it from the Blends store first')
  // Its running door names its loopback address, whoever started it; an app that is not running is started in its window, and asked again later.
  let url: string | undefined
  try { url = (JSON.parse(readFileSync(join(app.path, '.acryl', 'door.json'), 'utf8')) as { url: string }).url.replace(/\/+$/, '') } catch { /* not running */ }
  for (const base of url === undefined ? [] : [`${url}/app/automation/api`, `${url}/automation/api`]) {
    const answer = await fetchImpl(`${base}/workflows`).catch(() => undefined)
    if (answer?.ok === true && (answer.headers.get('content-type') ?? '').includes('json')) return base
  }
  if (app.state === 'stopped') launcher.start(app.id, 'desktop')
  throw new DesktopRefusal('Workflow Automation is starting in its own window; try again when it is open')
}

export function workflows(ports: { launcher: LauncherService, door: Door }, fetchImpl: Fetch = fetch) {
  const call = async (base: string, path: string, body?: unknown): Promise<Record<string, unknown>> => {
    const answer = await fetchImpl(`${base}${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const value = await answer.json() as Record<string, unknown>
    if (!answer.ok) throw new DesktopRefusal(`Workflow Automation: ${String(value.error ?? answer.status)}`)
    return value
  }
  return {
    async list() {
      const base = await apiOf(ports.launcher, fetchImpl)
      const all = ((await call(base, '/workflows')).workflows ?? []) as Array<Record<string, unknown>>
      return { workflows: all.filter((w) => String(w.description ?? '').startsWith('ACRYL AOS')).map((w) => ({ id: w.id, name: w.name, version: w.versionNumber, status: w.status })) }
    },
    async save(name: string, steps: readonly WorkflowStep[], replayUrl: string, token: string) {
      if (steps.length === 0) throw new DesktopRefusal('this run has no tool steps to save')
      const base = await apiOf(ports.launcher, fetchImpl)
      const made = await call(base, '/workflows', { name, description: `ACRYL AOS run: ${steps.map((s) => s.tool).join(' -> ')}` })
      const id = String(made.id)
      await call(base, `/workflows/${id}/trigger`, { integration: '@aiqadam/qadam-manual-trigger', trigger: 'manual_trigger', displayName: 'Run again' })
      for (const step of steps) {
        await call(base, `/workflows/${id}/steps`, {
          step: {
            kind: 'action', integration: '@aiqadam/qadam-http', action: 'send_request', displayName: step.tool,
            input: {
              method: 'POST', url: replayUrl, headers: { 'content-type': 'application/json' }, queryParams: {},
              authType: 'BEARER_TOKEN', authFields: { token }, body_type: 'json', body: { data: { tool: step.tool, args: step.args ?? {} } },
              response_is_binary: false, use_proxy: false, followRedirects: false, failureMode: 'retry_none',
            },
          },
        })
      }
      await call(base, `/workflows/${id}/publish`, {})
      return { id, name, steps: steps.length }
    },
    async run(id: string) {
      const base = await apiOf(ports.launcher, fetchImpl)
      const run = await call(base, `/workflows/${encodeURIComponent(id)}/run`, { payload: {} })
      return { run: run.id, status: run.status }
    },
  }
}
