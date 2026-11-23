import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Automation, Catalog } from '../plugins/automation/index.ts'
import { memorySecrets, memoryStore } from '../plugins/automation/store.ts'
import { automationTools } from '../plugins/automation-tools/index.ts'

const open = () => Automation.open({ catalog: new Catalog(), workflows: memoryStore(), runs: memoryStore(), secrets: memorySecrets(), clock: () => new Date(), publicUrl: () => '' })
const parse = (text: unknown) => (typeof text === 'string' ? JSON.parse(text) : text) as Record<string, unknown>

test('builds, validates and tests a workflow: a manual payload through math and JSON steps', async () => {
  const automation = await open()
  const w = await automation.create({ name: 'Sum' })
  await automation.setTrigger(w.id, { integration: '@aiqadam/qadam-manual-trigger', trigger: 'manual_trigger' })
  const { step } = await automation.addStep(w.id, { kind: 'action', integration: '@aiqadam/qadam-math-helper', action: 'addition_math', input: { first_number: '{{trigger.a}}', second_number: '{{trigger.b}}' } }, {})
  assert.equal(step, 'step_1')
  assert.deepEqual(automation.validate(w.id).problems, [])
  const run = await automation.start(w.id, { trigger: 'test', payload: { a: 2, b: 40 } })
  assert.equal(run.status, 'succeeded')
  assert.equal(run.steps.step_1?.output, 42)
})

test('a stale revision is refused instead of overwriting', async () => {
  const automation = await open()
  const w = await automation.create({ name: 'R' })
  const stale = w.revision
  await automation.rename(w.id, 'R2')
  await assert.rejects(automation.setTrigger(w.id, { integration: '@aiqadam/qadam-manual-trigger', trigger: 'manual_trigger' }, stale), /revision|changed/iu)
})

test('agent tools: publish and an effectful test wait for the person, and an approval is used once', async () => {
  const automation = await open()
  const tools = new Map(automationTools(automation).map((t) => [t.name, t]))
  const created = parse(await tools.get('automation_create_workflow')!.run({ name: 'Ping' }))
  const id = String(created.id)
  await tools.get('automation_set_trigger')!.run({ workflowId: id, integration: '@aiqadam/qadam-manual-trigger', trigger: 'manual_trigger' })
  await tools.get('automation_add_step')!.run({ workflowId: id, step: { kind: 'action', integration: '@aiqadam/qadam-http', action: 'send_request', input: { method: 'GET', url: 'http://127.0.0.1:9/', headers: {}, queryParams: {} } } })

  const test1 = parse(await tools.get('automation_test_workflow')!.run({ workflowId: id }))
  assert.equal(test1.status, 'awaiting_approval')
  assert.match(String(test1.summary), /sends GET request to http:\/\/127\.0\.0\.1:9\//u)
  assert.throws(() => automation.consumeApproval(String(test1.approvalId), id, 'test'), /not answered/u)

  const publish = parse(await tools.get('automation_publish_workflow')!.run({ workflowId: id }))
  assert.equal(publish.status, 'awaiting_approval')
  automation.decide(String(publish.approvalId), true)
  const published = parse(await tools.get('automation_publish_workflow')!.run({ workflowId: id, approvalId: publish.approvalId }))
  assert.deepEqual((published.published as { version: number }).version, 1)
  await assert.rejects(Promise.resolve().then(() => tools.get('automation_publish_workflow')!.run({ workflowId: id, approvalId: publish.approvalId })), /already used/u)

  const activate = parse(await tools.get('automation_activate_workflow')!.run({ workflowId: id }))
  automation.decide(String(activate.approvalId), false)
  await assert.rejects(Promise.resolve().then(() => tools.get('automation_activate_workflow')!.run({ workflowId: id, approvalId: activate.approvalId })), /declined/u)
  assert.equal(automation.get(id).status, 'inactive')
})

test('the catalog finds actions by words and serves dynamic fields', async () => {
  const catalog = new Catalog()
  assert.ok(catalog.search('http request').some((op) => op.name === 'send_request'))
  const refreshed = await catalog.refresh('@aiqadam/qadam-http', 'action', 'send_request', 'body', { body_type: 'json' })
  assert.ok(JSON.stringify(refreshed).length > 2)
})

test('a saved secret is masked without showing any of its JSON', async () => {
  const { mask } = await import('../plugins/automation/automation.ts')
  assert.equal(mask('sk-live-abcdef1234'), '••••1234')
  assert.equal(mask('abc'), '••••')
  assert.equal(mask({ type: 'SECRET_TEXT', secret_text: 'xyz-123' }), '•••• (2 values)')
})
