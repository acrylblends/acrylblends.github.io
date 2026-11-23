/**
 * The workflow editor: the toolbar (name, status, problems, Test, Publish, Activate), the canvas (React Flow, Qadam Flow's layout), the catalog to add
 * a step where a + was pressed, the inspector of the selected step, and the last test run. Every change goes through the API (the same operations the
 * agent tools use) with the revision this page has; the page follows the workflow's events, so a change made by the agent shows at once (the spec,
 * 12.4). The canvas keeps only view state (selection, viewport).
 */
import { type BranchCondition, BranchOperator, FlowActionType, type FlowAction, FlowOperationType, type FlowTrigger, FlowTriggerType, flowStructureUtil, StepLocationRelativeToParent } from '@aiqadam/shared'
import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError, base, type ConnectionView, events, type IntegrationView, type OperationView, type RunView, type ScheduleView, type WorkflowView } from './api'
import { CanvasActionsContext, type CanvasActions } from './canvas/actions'
import { ApLoopReturnLineCanvasEdge } from './canvas/edges/loop-return-edge'
import { ApLoopStartLineCanvasEdge } from './canvas/edges/loop-start-edge'
import { ApRouterEndCanvasEdge } from './canvas/edges/router-end-edge'
import { ApRouterStartCanvasEdge } from './canvas/edges/router-start-edge'
import { ApStraightLineCanvasEdge } from './canvas/edges/straight-line-edge'
import { flowCanvasUtils } from './canvas/flow-canvas-utils'
import { BigAddButtonNode, GraphEndNode, kindOf, LoopReturnNode, StepNode } from './canvas/nodes'
import { ApEdgeType, ApNodeType, type ApButtonData } from './canvas/types'
import { Field, focusedField } from './fields'
import { RunSteps, StatusBadge, when } from './runs'

const nodeTypes = { [ApNodeType.STEP]: StepNode, [ApNodeType.BIG_ADD_BUTTON]: BigAddButtonNode, [ApNodeType.LOOP_RETURN_NODE]: LoopReturnNode, [ApNodeType.GRAPH_END_WIDGET]: GraphEndNode }
const edgeTypes = { [ApEdgeType.STRAIGHT_LINE]: ApStraightLineCanvasEdge, [ApEdgeType.LOOP_START_EDGE]: ApLoopStartLineCanvasEdge, [ApEdgeType.LOOP_RETURN_EDGE]: ApLoopReturnLineCanvasEdge, [ApEdgeType.ROUTER_START_EDGE]: ApRouterStartCanvasEdge, [ApEdgeType.ROUTER_END_EDGE]: ApRouterEndCanvasEdge }

type Step = FlowAction | FlowTrigger

function KindTile({ step }: { step: Step }) {
  const kind = kindOf(step)
  return <span className="wa-glyph" aria-hidden="true" style={{ background: kind.color, color: '#fff' }}>{kind.glyph}</span>
}
type Side = { kind: 'step' } | { kind: 'add', where: ApButtonData } | { kind: 'trigger' } | { kind: 'problems' } | { kind: 'test' }

const message = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

export function Editor({ id, catalog, navigate }: { id: string, catalog: readonly IntegrationView[], navigate: (path: string) => void }) {
  const [workflow, setWorkflow] = useState<WorkflowView | undefined>(undefined)
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [side, setSide] = useState<Side>({ kind: 'step' })
  const [run, setRun] = useState<RunView | undefined>(undefined)
  const [note, setNote] = useState<{ text: string, error?: boolean } | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [connections, setConnections] = useState<ConnectionView[]>([])
  const [schedules, setSchedules] = useState<ScheduleView[]>([])
  const [confirm, setConfirm] = useState<'activate' | 'delete' | undefined>(undefined)

  const reload = useCallback(async () => {
    try { setWorkflow(await api.workflow(id)) } catch (cause) { setNote({ text: message(cause), error: true }) }
  }, [id])

  useEffect(() => {
    void reload()
    void api.connections().then((c) => { setConnections(c.connections) }, () => undefined)
    void api.schedules().then((s) => { setSchedules(s.schedules) }, () => undefined)
    void api.runs(id).then(async (r) => { const last = r.runs[0]; if (last !== undefined) setRun(await api.run(last.id)) }, () => undefined)
    return events(
      (changed) => { if (changed === id) { void reload(); void api.schedules().then((s) => { setSchedules(s.schedules) }, () => undefined) } },
      (summary) => { if (summary.workflowId === id) void api.run(summary.id).then(setRun, () => undefined) },
    )
  }, [id, reload])

  /** Every change: with the revision this page has; a refusal says why, a conflict reloads. */
  const change = useCallback(async (work: (w: WorkflowView) => Promise<WorkflowView | { workflow: WorkflowView }>, done?: string): Promise<WorkflowView | undefined> => {
    if (workflow === undefined) return undefined
    setBusy(true)
    try {
      const answer = await work(workflow)
      const next = 'workflow' in answer ? answer.workflow : answer
      setWorkflow(next)
      if (done !== undefined) setNote({ text: done })
      return next
    } catch (cause) {
      setNote({ text: message(cause), error: true })
      if (cause instanceof ApiError && cause.code === 'conflict') void reload()
      return undefined
    } finally {
      setBusy(false)
    }
  }, [workflow, reload])

  const stepStatus = useMemo(() => {
    const byName = new Map<string, string>()
    for (const record of Object.values(run?.steps ?? {})) byName.set(record.name, record.status)
    return byName
  }, [run])

  const actions: CanvasActions = useMemo(() => ({
    readonly: false,
    add: (where) => { setSide({ kind: 'add', where }) },
    select: (name) => { setSelected(name); setSide(name === 'trigger' && workflow?.draft.trigger.type === FlowTriggerType.EMPTY ? { kind: 'trigger' } : { kind: 'step' }) },
    selected,
    status: (name) => stepStatus.get(name),
  }), [selected, stepStatus, workflow])

  if (workflow === undefined) return <section className="wa-page"><p className="wa-hint">{note?.text ?? 'Loading the workflow...'}</p></section>

  const trigger = workflow.draft.trigger
  const step = selected === undefined ? undefined : flowStructureUtil.getStep(selected, trigger) as Step | undefined
  const problems = workflow.validation.problems
  const webhookUrl = `${location.origin}${base()}${workflow.webhookPath}`

  return (
    <section className="wa-editor" aria-label={`Workflow ${workflow.name}`}>
      <header className="wa-toolbar">
        <button type="button" className="wa-btn" data-ghost="" onClick={() => { navigate('/workflows') }} aria-label="Back to workflows">‹</button>
        <NameEditor name={workflow.name} onRename={(name) => { void change((w) => api.rename(w.id, name)) }} />
        <StatusBadge status={workflow.status === 'active' ? 'active' : 'inactive'} />
        <span className="wa-meta" title="Every change moves the revision">rev {workflow.revision}{workflow.versionNumber > 0 ? ` · published v${workflow.versionNumber}${workflow.changedSincePublish ? ' (draft has changes)' : ''}` : ' · not published'}</span>
        <span className="wa-spacer" />
        <button type="button" className="wa-btn" data-warn={problems.length > 0 ? '' : undefined} onClick={() => { setSide({ kind: 'problems' }) }}>{problems.length === 0 ? 'No problems' : `${problems.length} problem${problems.length === 1 ? '' : 's'}`}</button>
        <button type="button" className="wa-btn" onClick={() => { setSide({ kind: 'test' }) }}>Test</button>
        <button type="button" className="wa-btn" disabled={busy || problems.length > 0 || (workflow.versionNumber > 0 && !workflow.changedSincePublish)} onClick={() => { void change((w) => api.publish(w.id), `Published v${workflow.versionNumber + 1}.`) }}>Publish</button>
        {workflow.status === 'active'
          ? <button type="button" className="wa-btn" disabled={busy} onClick={() => { void change((w) => api.deactivate(w.id), 'Deactivated: it no longer starts by itself.') }}>Deactivate</button>
          : <button type="button" className="wa-btn" data-primary="" disabled={busy || workflow.published === undefined} title={workflow.published === undefined ? 'Publish it first' : 'It will start by itself: on its schedule or webhook'} onClick={() => { setConfirm('activate') }}>Activate</button>}
        <button type="button" className="wa-btn" data-ghost="" title="Download as a file (no secrets)" onClick={() => { void api.exportFile(workflow.id).then((file) => { download(`${workflow.name}.workflow.json`, file) }) }}>Export</button>
      </header>
      {confirm === 'activate' ? (
        <div className="wa-confirm" role="alertdialog" aria-label="Activate the workflow">
          <span>Activate <b>{workflow.name}</b> (published v{workflow.versionNumber})? It will run by itself when its trigger fires, with real effects.</span>
          <button type="button" className="wa-btn" data-primary="" onClick={() => { setConfirm(undefined); void change((w) => api.activate(w.id), 'Active: it now starts by itself.') }}>Activate</button>
          <button type="button" className="wa-btn" onClick={() => { setConfirm(undefined) }}>Cancel</button>
        </div>
      ) : null}
      {note === undefined ? null : <p className="wa-note" data-error={note.error === true ? '' : undefined} role={note.error === true ? 'alert' : 'status'}>{note.text} <button type="button" className="wa-x" aria-label="Dismiss" onClick={() => { setNote(undefined) }}>×</button></p>}
      <div className="wa-workspace">
        <div className="wa-canvas" aria-label="Workflow canvas">
          <CanvasActionsContext.Provider value={actions}>
            <ReactFlowProvider>
              <Canvas workflow={workflow} />
            </ReactFlowProvider>
          </CanvasActionsContext.Provider>
        </div>
        <aside className="wa-side" aria-label="Inspector">
          {side.kind === 'add' ? (
            <Catalog kind="action" catalog={catalog} onCancel={() => { setSide({ kind: 'step' }) }} onPick={(pick) => {
              void change(async (w) => {
                const where = side.where
                const placement = {
                  after: where.parentStepName,
                  ...(where.stepLocationRelativeToParent === StepLocationRelativeToParent.INSIDE_LOOP ? { inside: 'loop' } : {}),
                  ...(where.stepLocationRelativeToParent === StepLocationRelativeToParent.INSIDE_BRANCH ? { inside: 'branch', branchIndex: where.branchIndex } : {}),
                  ...(where.stepLocationRelativeToParent === StepLocationRelativeToParent.INSIDE_ON_SUCCESS_BRANCH ? { inside: 'on_success' } : {}),
                  ...(where.stepLocationRelativeToParent === StepLocationRelativeToParent.INSIDE_ON_FAILURE_BRANCH ? { inside: 'on_failure' } : {}),
                }
                const answer = await api.addStep(w.id, { step: pick, placement, revision: w.revision })
                setSelected(answer.step)
                setSide({ kind: 'step' })
                return answer
              })
            }} />
          ) : side.kind === 'trigger' ? (
            <Catalog kind="trigger" catalog={catalog} onCancel={() => { setSide({ kind: 'step' }) }} onPick={(pick) => {
              if (pick.kind !== 'action') return
              void change(async (w) => { const next = await api.setTrigger(w.id, { integration: pick.integration, trigger: pick.action, revision: w.revision }); setSelected('trigger'); setSide({ kind: 'step' }); return next })
            }} />
          ) : side.kind === 'problems' ? (
            <section className="wa-panel" aria-label="Problems">
              <h3>Problems</h3>
              {problems.length === 0 ? <p className="wa-hint">None: it can be tested and published.</p> : (
                <ul className="wa-problems">{problems.map((p, i) => <li key={String(i)}><button type="button" className="wa-link" onClick={() => { setSelected(p.step); setSide({ kind: 'step' }) }}>{p.step}{p.field === undefined ? '' : ` · ${p.field}`}</button> {p.message}</li>)}</ul>
              )}
            </section>
          ) : side.kind === 'test' ? (
            <TestPanel workflow={workflow} run={run} onRun={async (payload) => {
              setBusy(true)
              try { setRun(await api.test(workflow.id, payload)) } catch (cause) { setNote({ text: message(cause), error: true }) } finally { setBusy(false) }
            }} busy={busy} onCancel={() => { if (run !== undefined) void api.cancel(run.id).then(setRun, (cause: unknown) => { setNote({ text: message(cause), error: true }) }) }} />
          ) : step === undefined ? (
            <section className="wa-panel"><h3>Select a step</h3><p className="wa-hint">Click a step on the canvas to set it up, or a + to add one. {trigger.type === FlowTriggerType.EMPTY ? 'Start with the trigger: what starts this workflow.' : ''}</p></section>
          ) : (
            <Inspector
              key={`${step.name}-${workflow.revision}`}
              workflow={workflow}
              step={step}
              catalog={catalog}
              connections={connections}
              run={run}
              webhookUrl={webhookUrl}
              schedule={schedules.find((s) => s.workflowId === workflow.id)}
              onChangeTrigger={() => { setSide({ kind: 'trigger' }) }}
              onUpdate={(changeSet) => { void change((w) => api.updateStep(w.id, step.name, changeSet, w.revision)) }}
              onOperate={(operation) => { void change((w) => api.operate(w.id, operation, w.revision)) }}
              onRemove={() => { void change(async (w) => { const next = await api.removeStep(w.id, step.name, w.revision); setSelected(undefined); return next }, `${step.displayName} removed.`) }}
              onRotate={() => { void change((w) => api.rotateWebhook(w.id), 'A new webhook address: the old one no longer answers.') }}
            />
          )}
        </aside>
      </div>
    </section>
  )
}

function Canvas({ workflow }: { workflow: WorkflowView }) {
  const graph = useMemo(() => flowCanvasUtils.createFlowGraph({ version: workflow.draft, notes: [], orientation: 'vertical' }), [workflow.draft])
  const flow = useReactFlow()
  const shape = useMemo(() => graph.nodes.filter((n) => n.type === ApNodeType.STEP).length, [graph])
  useEffect(() => { const t = setTimeout(() => { void flow.fitView({ padding: 0.08, maxZoom: 1.1 }) }, 30); return () => { clearTimeout(t) } }, [shape, flow])
  return (
    <ReactFlow nodes={graph.nodes as never} edges={graph.edges as never} nodeTypes={nodeTypes as never} edgeTypes={edgeTypes as never} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} fitView minZoom={0.2} maxZoom={1.5} proOptions={{ hideAttribution: true }}>
      <Background gap={20} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

function NameEditor({ name, onRename }: { name: string, onRename: (name: string) => void }) {
  const [text, setText] = useState(name)
  useEffect(() => { setText(name) }, [name])
  return <input className="wa-name" aria-label="Workflow name" size={Math.max(12, Math.min(48, text.length + 2))} value={text} onChange={(e) => { setText(e.target.value) }} onBlur={() => { if (text.trim() !== '' && text !== name) onRename(text) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
}

type Pick = { kind: 'action', integration: string, action: string } | { kind: 'router' } | { kind: 'loop', items: string }

function Catalog({ kind, catalog, onPick, onCancel }: { kind: 'action' | 'trigger', catalog: readonly IntegrationView[], onPick: (pick: Pick) => void, onCancel: () => void }) {
  const [query, setQuery] = useState('')
  const words = query.toLowerCase().split(/\s+/u).filter(Boolean)
  const groups = catalog.map((i) => ({ i, ops: (kind === 'action' ? i.actions : i.triggers).filter((op) => words.every((w) => `${i.displayName} ${op.displayName} ${op.description}`.toLowerCase().includes(w))) })).filter((g) => g.ops.length > 0)
  const core = kind === 'action' && words.every((w) => 'router branch condition if loop each items'.includes(w))
  return (
    <section className="wa-panel" aria-label={kind === 'action' ? 'Add a step' : 'Choose a trigger'}>
      <div className="wa-panel-top"><h3>{kind === 'action' ? 'Add a step' : 'What starts this workflow?'}</h3><button type="button" className="wa-x" aria-label="Close" onClick={onCancel}>×</button></div>
      <input className="wa-input" type="search" autoFocus placeholder={kind === 'action' ? 'Search actions: http, json, date...' : 'Search triggers: schedule, webhook...'} aria-label={kind === 'action' ? 'Search actions' : 'Search triggers'} value={query} onChange={(e) => { setQuery(e.target.value) }} />
      <div className="wa-catalog">
        {core ? (
          <div className="wa-group">
            <h4>Flow control</h4>
            <button type="button" className="wa-op" onClick={() => { onPick({ kind: 'router' }) }}><KindTile step={{ type: FlowActionType.ROUTER } as never} /><span><b>Router</b><small>Branches by conditions, with an Otherwise branch</small></span></button>
            <button type="button" className="wa-op" onClick={() => { onPick({ kind: 'loop', items: '' }) }}><KindTile step={{ type: FlowActionType.LOOP_ON_ITEMS } as never} /><span><b>Loop on items</b><small>Runs the steps inside once per item of a list</small></span></button>
          </div>
        ) : null}
        {groups.map(({ i, ops }) => (
          <div className="wa-group" key={i.name}>
            <h4>{i.displayName}</h4>
            {ops.map((op) => (
              <button type="button" className="wa-op" key={op.name} onClick={() => { onPick({ kind: 'action', integration: op.integration, action: op.name }) }}>
                <KindTile step={{ type: kind === 'action' ? 'PIECE' : 'PIECE_TRIGGER', settings: { qadamName: op.integration } } as never} />
                <span><b>{op.displayName}</b><small>{op.description}</small></span>
              </button>
            ))}
          </div>
        ))}
        {groups.length === 0 && !core ? <p className="wa-hint">Nothing matches "{query}".</p> : null}
      </div>
    </section>
  )
}

function Inspector(props: {
  workflow: WorkflowView, step: Step, catalog: readonly IntegrationView[], connections: readonly ConnectionView[], run: RunView | undefined, webhookUrl: string, schedule: ScheduleView | undefined,
  onChangeTrigger: () => void, onUpdate: (change: Record<string, unknown>) => void, onOperate: (operation: unknown) => void, onRemove: () => void, onRotate: () => void,
}) {
  const { step, workflow } = props
  const isTrigger = step.type === FlowTriggerType.EMPTY || step.type === FlowTriggerType.PIECE
  const [name, setName] = useState(step.displayName)
  const [removing, setRemoving] = useState(false)
  const problems = workflow.validation.problems.filter((p) => p.step === step.name)
  const settings = (step as { settings?: { qadamName?: string, actionName?: string, triggerName?: string, input?: Record<string, unknown>, errorHandlingOptions?: { retryOnFailure?: { value?: boolean }, continueOnFailure?: { value?: boolean } } } }).settings
  const operation: OperationView | undefined = step.type === FlowActionType.PIECE || step.type === FlowTriggerType.PIECE
    ? props.catalog.find((i) => i.name === settings?.qadamName)?.[isTrigger ? 'triggers' : 'actions'].find((op) => op.name === (isTrigger ? settings?.triggerName : settings?.actionName))
    : undefined
  const input = settings?.input ?? {}
  const record = Object.values(props.run?.steps ?? {}).filter((r) => r.name === step.name).at(-1)
  return (
    <section className="wa-panel" aria-label={`Step ${step.name}`}>
      <div className="wa-panel-top">
        <KindTile step={step} />
        <input className="wa-name" aria-label="Step name" value={name} onChange={(e) => { setName(e.target.value) }} onBlur={() => { if (name.trim() !== '' && name !== step.displayName) props.onUpdate({ displayName: name }) }} />
      </div>
      <p className="wa-meta">{isTrigger ? 'Trigger' : step.name}{operation === undefined ? '' : ` · ${props.catalog.find((i) => i.name === operation.integration)?.displayName} · ${operation.displayName}`}</p>
      {problems.length > 0 ? <ul className="wa-problems" aria-label="What is missing">{problems.map((p, i) => <li key={String(i)}>{p.field === undefined ? '' : <b>{p.field}: </b>}{p.message}</li>)}</ul> : null}
      {isTrigger ? <button type="button" className="wa-btn" onClick={props.onChangeTrigger}>{step.type === FlowTriggerType.EMPTY ? 'Choose a trigger' : 'Change the trigger'}</button> : null}
      {operation?.integration === '@aiqadam/qadam-webhook' && isTrigger ? (
        <div className="wa-box" aria-label="Webhook address">
          <b>Webhook address</b>
          <code className="wa-code">{props.webhookUrl}</code>
          <span className="wa-hint">POST or GET here starts the published version while the workflow is active. Add <code>/test</code> to run the draft. It answers on this machine only unless you expose it (a tunnel or a reverse proxy).</span>
          <div className="wa-row"><button type="button" className="wa-btn" data-small="" onClick={() => { void navigator.clipboard?.writeText(props.webhookUrl) }}>Copy</button><button type="button" className="wa-btn" data-small="" onClick={props.onRotate}>New address</button></div>
        </div>
      ) : null}
      {operation?.strategy === 'POLLING' && isTrigger ? <p className="wa-hint">{props.schedule === undefined ? 'Runs on its schedule once published and active.' : `Next run ${when(props.schedule.next)} (${props.schedule.cronExpression}, ${props.schedule.timezone}).`}</p> : null}
      {operation !== undefined ? (
        <div className="wa-form">
          {operation.requiresConnection ? (
            <div className="wa-field">
              <label htmlFor="field-auth">Connection</label>
              <select id="field-auth" className="wa-input" value={/connections\['([^']+)'\]/u.exec(String(input.auth ?? ''))?.[1] ?? ''} onChange={(e) => { props.onUpdate({ input: { auth: e.target.value === '' ? '' : `{{connections['${e.target.value}']}}` } }) }}>
                <option value="">Choose a connection...</option>
                {props.connections.filter((c) => c.integration === operation.integration).map((c) => <option key={c.id} value={c.name}>{c.name} ({c.masked})</option>)}
              </select>
              <span className="wa-hint">Add one under Connections; its secret never shows here.</span>
            </div>
          ) : null}
          {operation.properties.map((property) => (
            <Field key={property.name} property={property} value={input[property.name]} input={input} context={{ integration: operation.integration, kind: isTrigger ? 'trigger' : 'action', operation: operation.name }} onChange={(value) => { props.onUpdate({ input: { [property.name]: value } }) }} />
          ))}
        </div>
      ) : null}
      {step.type === FlowActionType.LOOP_ON_ITEMS ? <LoopSettings step={step} onUpdate={props.onUpdate} /> : null}
      {step.type === FlowActionType.ROUTER ? <RouterSettings step={step} onUpdate={props.onUpdate} onOperate={props.onOperate} /> : null}
      {!isTrigger && step.type === FlowActionType.PIECE ? (
        <div className="wa-toggles" role="group" aria-label="When it fails">
          <label><input type="checkbox" checked={settings?.errorHandlingOptions?.retryOnFailure?.value === true} onChange={(e) => { props.onUpdate({ retryOnFailure: e.target.checked }) }} /> Retry up to 3 times on failure</label>
          <label><input type="checkbox" checked={settings?.errorHandlingOptions?.continueOnFailure?.value === true} onChange={(e) => { props.onUpdate({ continueOnFailure: e.target.checked }) }} /> Continue the workflow if it fails</label>
        </div>
      ) : null}
      {!isTrigger ? <label className="wa-toggles"><input type="checkbox" checked={(step as FlowAction).skip === true} onChange={(e) => { props.onUpdate({ skip: e.target.checked }) }} /> Skip this step</label> : null}
      <DataPicker workflow={workflow} run={props.run} before={step.name} />
      {record === undefined ? null : <RunSteps records={[record]} title="Last test of this step" />}
      {!isTrigger ? (removing
        ? <div className="wa-confirm" role="alertdialog" aria-label="Remove the step"><span>Remove {step.displayName}{step.type === FlowActionType.ROUTER || step.type === FlowActionType.LOOP_ON_ITEMS ? ' and the steps inside it' : ''}?</span><button type="button" className="wa-btn" data-danger="" onClick={props.onRemove}>Remove</button><button type="button" className="wa-btn" onClick={() => { setRemoving(false) }}>Cancel</button></div>
        : <button type="button" className="wa-btn" data-danger="" onClick={() => { setRemoving(true) }}>Remove step</button>) : null}
    </section>
  )
}

function LoopSettings({ step, onUpdate }: { step: FlowAction, onUpdate: (change: Record<string, unknown>) => void }) {
  const items = (step.settings as { items?: string }).items ?? ''
  return <Field property={{ name: 'items', type: 'SHORT_TEXT', displayName: 'Items to loop on', required: true, description: 'A list from an earlier step, e.g. {{trigger.body.orders}}. Inside the loop, {{' + step.name + '.item}} is the current item.' }} value={items} input={{}} context={{ integration: '', kind: 'action', operation: '' }} onChange={(value) => { onUpdate({ items: String(value ?? '') }) }} />
}

const OPERATORS: ReadonlyArray<readonly [BranchOperator, string, boolean]> = [
  [BranchOperator.TEXT_EXACTLY_MATCHES, 'text is', true], [BranchOperator.TEXT_DOES_NOT_EXACTLY_MATCH, 'text is not', true], [BranchOperator.TEXT_CONTAINS, 'text contains', true],
  [BranchOperator.TEXT_DOES_NOT_CONTAIN, 'text does not contain', true], [BranchOperator.TEXT_STARTS_WITH, 'text starts with', true], [BranchOperator.TEXT_ENDS_WITH, 'text ends with', true],
  [BranchOperator.NUMBER_IS_GREATER_THAN, 'number >', true], [BranchOperator.NUMBER_IS_LESS_THAN, 'number <', true], [BranchOperator.NUMBER_IS_EQUAL_TO, 'number =', true],
  [BranchOperator.BOOLEAN_IS_TRUE, 'is true', false], [BranchOperator.BOOLEAN_IS_FALSE, 'is false', false], [BranchOperator.EXISTS, 'exists', false], [BranchOperator.DOES_NOT_EXIST, 'does not exist', false],
  [BranchOperator.LIST_IS_EMPTY, 'list is empty', false], [BranchOperator.LIST_IS_NOT_EMPTY, 'list is not empty', false], [BranchOperator.DATE_IS_AFTER, 'date is after', true], [BranchOperator.DATE_IS_BEFORE, 'date is before', true],
]

function RouterSettings({ step, onUpdate, onOperate }: { step: FlowAction, onUpdate: (change: Record<string, unknown>) => void, onOperate: (operation: unknown) => void }) {
  const settings = step.settings as { executionType: string, branches: Array<{ branchType: string, branchName: string, conditions?: BranchCondition[][] }> }
  const save = (branches: typeof settings.branches, executionType = settings.executionType): void => { onUpdate({ input: { branches, executionType } }) }
  return (
    <div className="wa-form" aria-label="Branches">
      <label className="wa-toggles"><input type="checkbox" checked={settings.executionType === 'EXECUTE_ALL_MATCH'} onChange={(e) => { save(settings.branches, e.target.checked ? 'EXECUTE_ALL_MATCH' : 'EXECUTE_FIRST_MATCH') }} /> Run every branch that matches (not only the first)</label>
      {settings.branches.map((branch, index) => branch.branchType === 'FALLBACK' ? <p key={String(index)} className="wa-hint"><b>{branch.branchName}</b>: runs when no branch matches.</p> : (
        <div key={String(index)} className="wa-box">
          <input className="wa-input" aria-label={`Branch ${index + 1} name`} defaultValue={branch.branchName} onBlur={(e) => { if (e.target.value !== branch.branchName) save(settings.branches.map((b, i) => (i === index ? { ...b, branchName: e.target.value } : b))) }} />
          {(branch.conditions?.[0] ?? []).map((condition, c) => {
            const raw = condition as BranchCondition & { firstValue?: string, secondValue?: string }
            const update = (next: Partial<typeof raw>): void => { save(settings.branches.map((b, i) => (i === index ? { ...b, conditions: [(b.conditions?.[0] ?? []).map((x, j) => (j === c ? { ...x, ...next } as BranchCondition : x))] } : b))) }
            const twoValues = OPERATORS.find(([op]) => op === raw.operator)?.[2] ?? true
            return (
              <div key={String(c)} className="wa-condition" role="group" aria-label={`Condition ${c + 1} of branch ${index + 1}`}>
                <input className="wa-input" aria-label="First value" placeholder="{{step_1.status}}" defaultValue={raw.firstValue ?? ''} onBlur={(e) => { update({ firstValue: e.target.value }) }} />
                <select className="wa-input" aria-label="Operator" value={String(raw.operator ?? '')} onChange={(e) => { update({ operator: e.target.value as BranchOperator }) }}>{OPERATORS.map(([op, label]) => <option key={op} value={op}>{label}</option>)}</select>
                {twoValues ? <input className="wa-input" aria-label="Second value" placeholder="value" defaultValue={raw.secondValue ?? ''} onBlur={(e) => { update({ secondValue: e.target.value }) }} /> : null}
              </div>
            )
          })}
          <div className="wa-row">
            <button type="button" className="wa-btn" data-small="" onClick={() => { save(settings.branches.map((b, i) => (i === index ? { ...b, conditions: [[...(b.conditions?.[0] ?? []), { operator: BranchOperator.TEXT_EXACTLY_MATCHES, firstValue: '', secondValue: '', caseSensitive: false } as BranchCondition]] } : b))) }}>+ Condition (and)</button>
            {settings.branches.filter((b) => b.branchType === 'CONDITION').length > 1 ? <button type="button" className="wa-btn" data-small="" onClick={() => { onOperate({ type: FlowOperationType.DELETE_BRANCH, request: { stepName: step.name, branchIndex: index } }) }}>Remove branch</button> : null}
          </div>
        </div>
      ))}
      <button type="button" className="wa-btn" data-small="" onClick={() => { onOperate({ type: FlowOperationType.ADD_BRANCH, request: { stepName: step.name, branchIndex: settings.branches.length - 1, branchName: `Branch ${settings.branches.length}`, conditions: [[{ operator: BranchOperator.TEXT_EXACTLY_MATCHES, firstValue: '', secondValue: '', caseSensitive: false }]] } }) }}>+ Branch</button>
    </div>
  )
}

/** References to what earlier steps gave in the last test, to insert into the focused field. */
function DataPicker({ workflow, run, before }: { workflow: WorkflowView, run: RunView | undefined, before: string }) {
  const order = flowStructureUtil.getAllSteps(workflow.draft.trigger).map((s) => s.name)
  const earlier = order.slice(0, Math.max(0, order.indexOf(before)))
  if (earlier.length === 0) return null
  const outputs = new Map(Object.values(run?.steps ?? {}).map((r) => [r.name, r.output]))
  const paths = (name: string, value: unknown, depth = 0, prefix = name): string[] => {
    if (depth > 2 || value === null || typeof value !== 'object') return [prefix]
    const keys = Array.isArray(value) ? (value.length > 0 ? ['0'] : []) : Object.keys(value).slice(0, 12)
    return [prefix, ...keys.flatMap((k) => paths(name, (value as Record<string, unknown>)[k], depth + 1, Array.isArray(value) ? `${prefix}[${k}]` : /^[A-Za-z_$][\w$]*$/u.test(k) ? `${prefix}.${k}` : `${prefix}['${k}']`))]
  }
  return (
    <details className="wa-box">
      <summary>Data from earlier steps</summary>
      <span className="wa-hint">Click a field above, then a value here to insert it. {run === undefined ? 'Test the workflow to see what each step gives.' : ''}</span>
      <div className="wa-paths">
        {earlier.flatMap((name) => (outputs.has(name) ? paths(name, outputs.get(name)) : [name])).map((path) => (
          <button type="button" key={path} className="wa-path" onMouseDown={(e) => { e.preventDefault(); focusedField.current?.insert(`{{${path}}}`) }}>{`{{${path}}}`}</button>
        ))}
      </div>
    </details>
  )
}

function TestPanel({ workflow, run, onRun, onCancel, busy }: { workflow: WorkflowView, run: RunView | undefined, onRun: (payload: unknown) => Promise<void>, onCancel: () => void, busy: boolean }) {
  const [payload, setPayload] = useState('{\n  \n}')
  const [problem, setProblem] = useState<string | undefined>(undefined)
  const triggerName = (workflow.draft.trigger.settings as { qadamName?: string } | undefined)?.qadamName ?? ''
  return (
    <section className="wa-panel" aria-label="Test the workflow">
      <h3>Test the draft</h3>
      <p className="wa-hint">Runs the draft now, with this as the trigger's data{triggerName.includes('webhook') ? ' (the webhook body)' : ''}. Steps really run: an HTTP request is really sent.</p>
      <label className="wa-field" htmlFor="test-payload">Trigger data (JSON)</label>
      <textarea id="test-payload" className="wa-input" rows={5} spellCheck={false} value={payload} onChange={(e) => { setPayload(e.target.value) }} />
      {problem === undefined ? null : <span className="wa-hint" data-warn="">{problem}</span>}
      <div className="wa-row">
        <button type="button" className="wa-btn" data-primary="" disabled={busy || workflow.validation.problems.length > 0} onClick={() => {
          let data: unknown = {}
          try { data = payload.trim() === '' ? {} : JSON.parse(payload); setProblem(undefined) } catch { setProblem('The trigger data is not valid JSON'); return }
          const body = triggerName.includes('webhook') ? { body: data, headers: { 'content-type': 'application/json' }, queryParams: {}, method: 'POST' } : data
          void onRun(body)
        }}>{busy ? 'Running...' : 'Run test'}</button>
        {run?.status === 'running' || run?.status === 'waiting' ? <button type="button" className="wa-btn" onClick={onCancel}>Stop</button> : null}
      </div>
      {workflow.validation.problems.length > 0 ? <p className="wa-hint" data-warn="">Fix the problems first.</p> : null}
      {run === undefined ? null : (
        <>
          <p className="wa-meta"><StatusBadge status={run.status} /> {run.trigger === 'test' ? 'Test' : run.trigger} · {when(run.startedAt)}{run.waiting === undefined ? '' : ` · resumes ${when(run.waiting.resumeAt)}`}</p>
          {run.error === undefined ? null : <p className="wa-note" data-error="">{run.error.step}: {run.error.message}</p>}
          <RunSteps records={Object.values(run.steps)} />
        </>
      )}
    </section>
  )
}

function download(name: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name.replaceAll(/[\\/:*?"<>|]/gu, '-')
  link.click()
  setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
}
