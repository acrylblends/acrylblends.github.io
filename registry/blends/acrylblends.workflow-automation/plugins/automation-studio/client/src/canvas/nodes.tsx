/**
 * The canvas's nodes: a step (trigger or action, with its integration's glyph, its name and number, a problem flag and its last run's status), the big
 * + of an empty branch or loop, and the two invisible nodes the layout uses to measure loops and to end the graph. Sizes and handles as in Qadam Flow's
 * nodes (MIT, packages/web/src/app/builder/flow-canvas/nodes @ 51bb340b); the look is this app's.
 */
import { FlowActionType, FlowTriggerType, type FlowAction, type FlowTrigger } from '@aiqadam/shared'
import { Handle, type NodeProps, Position } from '@xyflow/react'
import { useCanvasActions } from './actions'
import { flowCanvasConsts } from './consts'
import type { ApButtonData } from './types'

const handle = flowCanvasConsts.HANDLE_STYLING

/** A short mark for a step, from its integration or its kind. */
export function glyphOf(step: FlowAction | FlowTrigger): string {
  if (step.type === FlowTriggerType.EMPTY) return '?'
  if (step.type === FlowActionType.ROUTER) return '⑂'
  if (step.type === FlowActionType.LOOP_ON_ITEMS) return '↻'
  if (step.type === FlowActionType.CODE) return '{}'
  const name = (step.settings as { qadamName?: string }).qadamName ?? ''
  const short = name.replace(/^@aiqadam\/qadam-/u, '')
  const known: Record<string, string> = { http: '⇄', webhook: '⚓', schedule: '⏱', 'manual-trigger': '▶', 'data-mapper': '⇢', json: '{ }', 'math-helper': '∑', 'date-helper': '📅', delay: '⏳' }
  return known[short] ?? short.slice(0, 2).toUpperCase()
}

export function StepNode({ data }: NodeProps & { data: { step: FlowAction | FlowTrigger } }) {
  const actions = useCanvasActions()
  const step = data.step
  const status = actions.status(step.name)
  const isTrigger = step.type === FlowTriggerType.EMPTY || step.type === FlowTriggerType.PIECE
  const empty = step.type === FlowTriggerType.EMPTY
  const label = `${isTrigger ? 'Trigger' : 'Step'} ${step.name}: ${step.displayName}${step.valid ? '' : ', needs attention'}${status === undefined ? '' : `, ${status}`}`
  return (
    <div
      className="wa-node"
      data-selected={actions.selected === step.name ? '' : undefined}
      data-status={status}
      data-empty={empty ? '' : undefined}
      data-skipped={(step as FlowAction).skip === true ? '' : undefined}
      style={{ width: flowCanvasConsts.AP_NODE_SIZE.STEP.width, height: flowCanvasConsts.AP_NODE_SIZE.STEP.height }}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => { actions.select(step.name) }}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); actions.select(step.name) } }}
    >
      <span className="wa-glyph" aria-hidden="true">{glyphOf(step)}</span>
      <span className="wa-node-text">
        <b>{step.displayName}</b>
        <small>{isTrigger ? 'Trigger' : step.name.replace('step_', 'Step ')}{(step as FlowAction).skip === true ? ' · skipped' : ''}</small>
      </span>
      {!step.valid && !empty ? <span className="wa-flag" title="Needs attention: open it to see what is missing">!</span> : null}
      {status === undefined ? null : <span className="wa-dot" data-status={status} title={status} />}
      <Handle type="source" style={handle} position={Position.Bottom} />
      <Handle type="target" style={handle} position={Position.Top} />
    </div>
  )
}

export function BigAddButtonNode({ data }: NodeProps & { data: ApButtonData }) {
  const actions = useCanvasActions()
  return (
    <div className="wa-bigadd-wrap" style={{ width: flowCanvasConsts.AP_NODE_SIZE.STEP.width, height: flowCanvasConsts.AP_NODE_SIZE.STEP.height }}>
      {actions.readonly ? <span className="wa-bigadd-empty">Empty</span> : (
        <button type="button" className="wa-bigadd" aria-label={`Add a step inside ${data.parentStepName}`} onClick={(event) => { event.stopPropagation(); actions.add(data) }}>+</button>
      )}
      <Handle type="source" style={handle} position={Position.Bottom} />
      <Handle type="target" style={handle} position={Position.Top} />
    </div>
  )
}

export function LoopReturnNode() {
  return (
    <div style={{ height: '1px', width: flowCanvasConsts.AP_NODE_SIZE.LOOP_RETURN_NODE.width }}>
      <Handle type="source" style={handle} position={Position.Bottom} />
      <Handle type="target" style={handle} position={Position.Top} />
    </div>
  )
}

export function GraphEndNode() {
  return (
    <div style={{ height: '1px', width: '1px' }}>
      <Handle type="source" style={handle} position={Position.Bottom} />
      <Handle type="target" style={handle} position={Position.Top} />
    </div>
  )
}
