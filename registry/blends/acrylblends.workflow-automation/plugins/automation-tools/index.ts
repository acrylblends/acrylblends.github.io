/**
 * Workflow automation for the ACRYL agent: typed tools in the app's `tools` registry, the one the built-in chat reads; the door offers the same tools
 * to Claude Code, Codex, Pi and every terminal agent (`acryl tool list`, `acryl tool call --tool <name>`, its `tools.expose` lists them). The agent is
 * the app's operator, not a chatbot inside it (the spec, 1 and 12): it finds actions and triggers, builds the graph step by step, fills settings,
 * validates, tests and reads runs, through the same `automation` service the screen uses, so what it does appears on the canvas at once.
 *
 * What only the person may allow is checked here, not asked of the model: publishing, activating, and a test that would reach outside the app (an
 * HTTP request...) answer `awaiting_approval` with an approval id; the app shows the request with Approve and Decline, and the same call with that id
 * then goes through, once. Secrets never pass through a tool: a connection is made by the person on the Connections page.
 *
 * Owned while active: the registrations (removed when the plugin or the registry goes).
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../automation/index.ts'
import { type Automation, type Placement, Refusal, type StepSpec } from '../automation/index.ts'

export const name = 'automation-tools'
export const inject = ['automation']

type Schema = Readonly<Record<string, unknown>>

export interface AutomationTool {
  readonly name: string
  readonly description: string
  readonly parameters: Schema
  run(input: Record<string, unknown>): Promise<unknown> | unknown
}

const object = (properties: Record<string, unknown>, required: readonly string[] = []): Schema => ({ type: 'object', properties, required, additionalProperties: false })
const str = (description: string): Schema => ({ type: 'string', description })
const revision = { type: 'integer', description: 'The revision you last read (automation_get_workflow). A change made since is refused instead of overwritten.' }
const approval = str('The id from an earlier awaiting_approval answer, once the person pressed Approve in the app.')
const id = str('The workflow id (wf_...)')

/** A compact view of a workflow for a model: its steps in order with their settings and problems, no internals it does not need. */
export function workflowForAgent(automation: Automation, workflowId: string): unknown {
  const workflow = automation.get(workflowId)
  const steps: unknown[] = []
  const walk = (step: unknown, where: string): void => {
    for (let s = step as Record<string, unknown> | undefined; s !== undefined && s !== null; s = s.nextAction as Record<string, unknown> | undefined) {
      const settings = (s.settings ?? {}) as Record<string, unknown>
      steps.push({
        name: s.name, displayName: s.displayName, type: s.type, where,
        ...(settings.qadamName === undefined ? {} : { integration: settings.qadamName, operation: settings.actionName ?? settings.triggerName }),
        ...(settings.input === undefined ? {} : { input: settings.input }),
        ...(s.type === 'ROUTER' ? { branches: settings.branches, executionType: settings.executionType } : {}),
        ...(s.type === 'LOOP_ON_ITEMS' ? { items: settings.items } : {}),
        ...(s.skip === true ? { skip: true } : {}),
      })
      if (s.firstLoopAction !== undefined) walk(s.firstLoopAction, `inside ${String(s.name)}`)
      for (const [index, child] of ((s.children ?? []) as unknown[]).entries()) walk(child, `${String(s.name)} branch ${index}`)
    }
  }
  walk(workflow.draft.trigger, 'main')
  return {
    id: workflow.id, name: workflow.name, status: workflow.status, revision: workflow.revision,
    published: workflow.published === undefined ? null : { version: workflow.versionNumber, at: workflow.publishedAt },
    webhookPath: `/automation/webhooks/${workflow.webhookToken}`, steps, validation: automation.validate(workflow.id),
  }
}

export function automationTools(automation: Automation): AutomationTool[] {
  const awaiting = (workflowId: string, action: 'publish' | 'activate' | 'test') => {
    const approval = automation.requestApproval(workflowId, action)
    return { status: 'awaiting_approval', approvalId: approval.id, summary: approval.summary, next: `Tell the person what this does (the summary) and ask them to press Approve in the app; then call this tool again with approvalId "${approval.id}".` }
  }
  return [
    {
      name: 'automation_list_workflows',
      description: 'List the workflows: id, name, status (active/inactive), revision, trigger, and how many problems each draft has.',
      parameters: object({}),
      run: () => automation.list().map((w) => ({ id: w.id, name: w.name, status: w.status, revision: w.revision, trigger: w.draft.trigger.displayName, published: w.versionNumber, problems: automation.validate(w.id).problems.length })),
    },
    {
      name: 'automation_get_workflow',
      description: 'Read one workflow: its steps in order (name, integration, operation, input), routers and loops, problems, revision and webhook path. Read it before changing it.',
      parameters: object({ workflowId: id }, ['workflowId']),
      run: (input) => workflowForAgent(automation, String(input.workflowId)),
    },
    {
      name: 'automation_create_workflow',
      description: 'Create an empty workflow (no trigger yet). Then set its trigger and add steps.',
      parameters: object({ name: str('Its name'), description: str('What it is for') }, ['name']),
      run: async (input) => workflowForAgent(automation, (await automation.create({ name: String(input.name), ...(typeof input.description === 'string' ? { description: input.description } : {}) })).id),
    },
    {
      name: 'automation_rename_workflow',
      description: 'Rename a workflow (and optionally change its description).',
      parameters: object({ workflowId: id, name: str('The new name'), description: str('The new description') }, ['workflowId', 'name']),
      run: async (input) => workflowForAgent(automation, (await automation.rename(String(input.workflowId), String(input.name), typeof input.description === 'string' ? input.description : undefined)).id),
    },
    {
      name: 'automation_search_nodes',
      description: 'Search the catalog of actions and triggers (integration, name, what it does, whether it needs a connection). Use the words of the task: "http request", "schedule every day", "webhook", "json", "date".',
      parameters: object({ query: str('Words to look for'), kind: { type: 'string', enum: ['action', 'trigger'] } }, ['query']),
      run: (input) => automation.catalog.search(String(input.query), input.kind === 'action' || input.kind === 'trigger' ? input.kind : undefined).map((op) => ({ integration: op.integration, name: op.name, kind: op.kind, displayName: op.displayName, description: op.description, requiresConnection: op.requiresConnection })),
    },
    {
      name: 'automation_get_node_definition',
      description: 'The fields of one action or trigger: name, type, required, choices, default. Fields marked dynamic have sub-fields that depend on others (ask with automation_get_dynamic_fields).',
      parameters: object({ integration: str('@aiqadam/qadam-...'), kind: { type: 'string', enum: ['action', 'trigger'] }, name: str('The action or trigger name') }, ['integration', 'kind', 'name']),
      run: (input) => {
        const op = automation.catalog.operation(String(input.integration), input.kind === 'trigger' ? 'trigger' : 'action', String(input.name))
        if (op === undefined) throw new Refusal('not_found', `${String(input.integration)} has no ${String(input.kind)} ${String(input.name)}`)
        return op
      },
    },
    {
      name: 'automation_get_dynamic_fields',
      description: 'The sub-fields or choices of a dynamic field for the given input (e.g. the HTTP body for body_type "json").',
      parameters: object({ integration: str('@aiqadam/qadam-...'), kind: { type: 'string', enum: ['action', 'trigger'] }, operation: str('The action or trigger name'), property: str('The dynamic field'), input: { type: 'object', description: 'The other fields as set now' } }, ['integration', 'kind', 'operation', 'property']),
      run: (input) => automation.catalog.refresh(String(input.integration), input.kind === 'trigger' ? 'trigger' : 'action', String(input.operation), String(input.property), (input.input ?? {}) as Record<string, unknown>),
    },
    {
      name: 'automation_set_trigger',
      description: 'Set what starts the workflow: a manual start (@aiqadam/qadam-manual-trigger manual_trigger), a schedule (@aiqadam/qadam-schedule every_day, every_hour, cron_expression...), or a webhook (@aiqadam/qadam-webhook catch_webhook).',
      parameters: object({ workflowId: id, integration: str('@aiqadam/qadam-...'), trigger: str('The trigger name'), input: { type: 'object', description: 'Its fields, e.g. { "hour_of_the_day": 8, "timezone": "Europe/Vienna" }' }, revision }, ['workflowId', 'integration', 'trigger']),
      run: async (input) => workflowForAgent(automation, (await automation.setTrigger(String(input.workflowId), { integration: String(input.integration), trigger: String(input.trigger), ...(typeof input.input === 'object' && input.input !== null ? { input: input.input as Record<string, unknown> } : {}) }, input.revision as number | undefined)).id),
    },
    {
      name: 'automation_add_step',
      description: 'Add a step: an action of an integration, a router (branches by conditions) or a loop over a list. It goes after `after` (default: the last step), or first inside a loop (inside "loop") or a router branch (inside "branch" with branchIndex). Values can reference earlier steps: "{{trigger.body.email}}", "{{step_1.status}}". Returns the new step\'s name.',
      parameters: object({
        workflowId: id,
        step: { type: 'object', description: '{ "kind": "action", "integration": "@aiqadam/qadam-http", "action": "send_request", "input": {...}, "displayName": "..." } or { "kind": "router", "branches": [{ "name": "Urgent", "conditions": [[{ "operator": "TEXT_CONTAINS", "firstValue": "{{trigger.body.subject}}", "secondValue": "urgent" }]] }] } or { "kind": "loop", "items": "{{step_1.body.items}}" }' },
        after: str('The step to add after (a step name, or "trigger")'),
        inside: { type: 'string', enum: ['loop', 'branch', 'on_success', 'on_failure'] },
        branchIndex: { type: 'integer' },
        revision,
      }, ['workflowId', 'step']),
      run: async (input) => {
        const placement: Placement = { ...(typeof input.after === 'string' ? { after: input.after } : {}), ...(typeof input.inside === 'string' ? { inside: input.inside as Placement['inside'] } : {}), ...(typeof input.branchIndex === 'number' ? { branchIndex: input.branchIndex } : {}) }
        const { workflow, step } = await automation.addStep(String(input.workflowId), input.step as StepSpec, placement, input.revision as number | undefined)
        return { added: step, workflow: workflowForAgent(automation, workflow.id) }
      },
    },
    {
      name: 'automation_update_step',
      description: 'Change a step: its input fields (merged into what it has), its name on the canvas, skip, retry on failure, continue on failure, a loop\'s items, a router\'s branches (input.branches). Use "trigger" for the trigger\'s fields.',
      parameters: object({ workflowId: id, step: str('The step name (step_1...) or "trigger"'), change: { type: 'object', description: '{ "input": {...}, "displayName": "...", "skip": false, "retryOnFailure": true, "continueOnFailure": false, "items": "{{...}}" }' }, revision }, ['workflowId', 'step', 'change']),
      run: async (input) => workflowForAgent(automation, (await automation.updateStep(String(input.workflowId), String(input.step), input.change as never, input.revision as number | undefined)).id),
    },
    {
      name: 'automation_remove_step',
      description: 'Remove a step (a router or loop with the steps inside it).',
      parameters: object({ workflowId: id, step: str('The step name'), revision }, ['workflowId', 'step']),
      run: async (input) => workflowForAgent(automation, (await automation.removeStep(String(input.workflowId), String(input.step), input.revision as number | undefined)).id),
    },
    {
      name: 'automation_validate_workflow',
      description: 'What is missing or wrong in the draft, step by step and field by field. Empty problems: it can be tested and published.',
      parameters: object({ workflowId: id }, ['workflowId']),
      run: (input) => automation.validate(String(input.workflowId)),
    },
    {
      name: 'automation_test_workflow',
      description: 'Run the draft now with this trigger data and return every step\'s input, output and error. A test whose steps reach outside the app (an HTTP request...) needs the person\'s approval first: it answers awaiting_approval with an approvalId.',
      parameters: object({ workflowId: id, payload: { description: 'The trigger\'s data (for a webhook: { "body": {...}, "headers": {...} })' }, approvalId: approval }, ['workflowId']),
      run: async (input) => {
        const workflowId = String(input.workflowId)
        if (automation.testHasEffects(workflowId)) {
          if (typeof input.approvalId !== 'string') return awaiting(workflowId, 'test')
          automation.consumeApproval(input.approvalId, workflowId, 'test')
        }
        const run = await automation.start(workflowId, { trigger: 'test', payload: input.payload })
        return { runId: run.id, status: run.status, error: run.error, steps: Object.values(run.steps).map((s) => ({ step: s.path, status: s.status, output: s.output, error: s.error })) }
      },
    },
    {
      name: 'automation_publish_workflow',
      description: 'Publish the draft as the version that runs when active. Needs the person\'s approval: the first call answers awaiting_approval with an approvalId.',
      parameters: object({ workflowId: id, approvalId: approval }, ['workflowId']),
      run: async (input) => {
        const workflowId = String(input.workflowId)
        const report = automation.validate(workflowId)
        if (!report.valid) throw new Refusal('invalid', `Fix these first: ${report.problems.map((p) => `${p.step}: ${p.message}`).join('; ')}`)
        if (typeof input.approvalId !== 'string') return awaiting(workflowId, 'publish')
        automation.consumeApproval(input.approvalId, workflowId, 'publish')
        return workflowForAgent(automation, (await automation.publish(workflowId)).id)
      },
    },
    {
      name: 'automation_activate_workflow',
      description: 'Activate the published version: it then starts by itself on its schedule or webhook. Needs the person\'s approval: the first call answers awaiting_approval with an approvalId.',
      parameters: object({ workflowId: id, approvalId: approval }, ['workflowId']),
      run: async (input) => {
        const workflowId = String(input.workflowId)
        if (automation.get(workflowId).published === undefined) throw new Refusal('refused', 'It has no published version: publish it first')
        if (typeof input.approvalId !== 'string') return awaiting(workflowId, 'activate')
        automation.consumeApproval(input.approvalId, workflowId, 'activate')
        return workflowForAgent(automation, (await automation.setStatus(workflowId, 'active')).id)
      },
    },
    {
      name: 'automation_deactivate_workflow',
      description: 'Deactivate a workflow: it no longer starts by itself (no approval needed: it only stops things).',
      parameters: object({ workflowId: id }, ['workflowId']),
      run: async (input) => workflowForAgent(automation, (await automation.setStatus(String(input.workflowId), 'inactive')).id),
    },
    {
      name: 'automation_list_runs',
      description: 'Recent runs (newest first), optionally of one workflow or with one status (running, waiting, succeeded, failed, cancelled).',
      parameters: object({ workflowId: str('Only this workflow'), status: { type: 'string', enum: ['running', 'waiting', 'succeeded', 'failed', 'cancelled'] }, limit: { type: 'integer' } }),
      run: (input) => automation.runs({ ...(typeof input.workflowId === 'string' ? { workflowId: input.workflowId } : {}), ...(typeof input.status === 'string' ? { status: input.status as never } : {}), limit: typeof input.limit === 'number' ? Math.min(100, input.limit) : 20 }),
    },
    {
      name: 'automation_get_run',
      description: 'One run in full: every step\'s input, output, error, duration and attempts (secrets masked).',
      parameters: object({ runId: str('run_...') }, ['runId']),
      run: (input) => automation.run(String(input.runId)),
    },
    {
      name: 'automation_explain_run_failure',
      description: 'For a failed run: the failed step, its error, the input it got and the steps before it, with what to look at. Use it before proposing a fix.',
      parameters: object({ runId: str('run_...') }, ['runId']),
      run: (input) => {
        const run = automation.run(String(input.runId))
        if (run.status !== 'failed' || run.error === undefined) return { status: run.status, explanation: 'This run did not fail.' }
        const records = Object.values(run.steps)
        const failed = run.steps[run.error.step]
        return {
          failedStep: run.error.step, error: run.error.message, input: failed?.input, attempts: failed?.attempts,
          before: records.filter((r) => r.status === 'succeeded').map((r) => ({ step: r.path, output: r.output })),
          hints: [
            /not valid|required/iu.test(run.error.message) ? 'A field is missing or of the wrong type: compare the input above with automation_get_node_definition.' : undefined,
            /no step|Unresolved|reference/iu.test(run.error.message) ? 'A {{ }} reference names a step or field that is not there: check the names in the earlier outputs above.' : undefined,
            /ENOTFOUND|ECONNREFUSED|timeout|longer than/iu.test(run.error.message) ? 'The remote service could not be reached or was slow: check the URL and that it is up.' : undefined,
            /40[13]/u.test(run.error.message) ? 'The service refused the credentials: the connection may be wrong or expired (the person updates it on the Connections page).' : undefined,
          ].filter((hint) => hint !== undefined),
        }
      },
    },
    {
      name: 'automation_cancel_run',
      description: 'Stop a run that is running or waiting.',
      parameters: object({ runId: str('run_...') }, ['runId']),
      run: async (input) => { const run = await automation.cancel(String(input.runId)); return { runId: run.id, status: run.status } },
    },
    {
      name: 'automation_list_connections',
      description: 'The saved connections by name and integration (values masked). A step uses one with "auth": "{{connections[\'name\']}}". The person adds connections on the Connections page; never ask for a secret in the chat.',
      parameters: object({}),
      run: () => automation.connections().map((c) => ({ name: c.name, integration: c.integration, masked: c.masked })),
    },
  ]
}

/** The two shapes of the `tools` registry (the framework agent's and DSH's), as the door registers into both. */
interface ToolsPort { register(name: string, tool: { description: string, parameters?: Schema, run(input: unknown): unknown }): () => void }
interface DshToolsPort {
  register(definition: { name: string, description: string, parameters: Schema, output: { schema: Schema, render(args: unknown, value: unknown): Array<{ type: 'text', text: string }> }, execute(args: unknown, exec: { signal?: AbortSignal }): Promise<unknown> }): () => void
  schemas(): unknown
}
const isDsh = (tools: unknown): tools is DshToolsPort => typeof (tools as { schemas?: unknown } | undefined)?.schemas === 'function'

/** Run a tool and answer what a model reads: the result as JSON, or the refusal in words. */
async function answer(tool: AutomationTool, input: unknown): Promise<string> {
  try {
    return JSON.stringify(await tool.run((input ?? {}) as Record<string, unknown>), null, 1)
  } catch (cause) {
    if (cause instanceof Refusal) return JSON.stringify({ refused: cause.code, message: cause.message })
    throw cause
  }
}

export function registerTools(tools: unknown, list: readonly AutomationTool[]): () => void {
  const removers: Array<() => void> = []
  const removeAll = (): void => { for (const remove of removers.splice(0).reverse()) remove() }
  try {
    for (const tool of list) {
      if (isDsh(tools)) {
        removers.push(tools.register({
          name: tool.name, description: tool.description, parameters: tool.parameters,
          output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
          execute: (args) => answer(tool, args),
        }))
      } else {
        removers.push((tools as ToolsPort).register(tool.name, { description: tool.description, parameters: tool.parameters, run: (input) => answer(tool, input) }))
      }
    }
  } catch (cause) {
    removeAll()
    throw cause
  }
  return removeAll
}

export function apply(ctx: Context): void {
  const list = automationTools(ctx.automation)
  // The registry is optional: on the app's own server there is none, and the tools wait for it.
  ctx.inject(['tools'], (inner) => {
    inner.effect(() => registerTools(inner.get('tools'), list), 'automation-tools: the tools in the registry')
  })
}

export const TOOL_NAMES = automationTools({} as Automation).map((tool) => tool.name)
