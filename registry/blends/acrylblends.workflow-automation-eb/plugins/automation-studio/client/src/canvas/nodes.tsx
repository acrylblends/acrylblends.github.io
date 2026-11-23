/**
 * The canvas's nodes: a step (trigger or action, with its integration's glyph, its name and number, a problem flag and its last run's status), the big
 * + of an empty branch or loop, and the two invisible nodes the layout uses to measure loops and to end the graph. Sizes and handles as in Qadam Flow's
 * nodes (MIT, packages/web/src/app/builder/flow-canvas/nodes @ 51bb340b); the look is this app's.
 */
import { FlowActionType, FlowTriggerType, type FlowAction, type FlowTrigger } from '@aiqadam/shared'
import { Handle, type NodeProps, Position } from '@xyflow/react'
import type { ReactNode } from 'react'
import { useCanvasActions } from './actions'
import { flowCanvasConsts } from './consts'
import type { ApButtonData } from './types'

const handle = flowCanvasConsts.HANDLE_STYLING

/** What a step is, for its tile: a glyph, the integration's colour and its name (the look of n8n-style nodes: one coloured tile per service). */
interface Kind { readonly glyph: ReactNode, readonly color: string, readonly label: string }

const icon = (paths: ReactNode) => <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>
const ROUTER_ICON = icon(<><path d="M7 3v18" /><path d="M7 8c0 5 10 3 10 9v4" /><path d="M14 18l3 3 3-3" /></>)
const DATE_ICON = icon(<><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>)

const KINDS: Readonly<Record<string, Kind>> = {
  http: { glyph: '⇄', color: '#2f80ed', label: 'HTTP' },
  webhook: { glyph: '⚓', color: '#ea4b71', label: 'Webhook' },
  schedule: { glyph: '⏱', color: '#f2994a', label: 'Schedule' },
  'manual-trigger': { glyph: '▶', color: '#7b61ff', label: 'Manual' },
  'data-mapper': { glyph: '⇢', color: '#00a37a', label: 'Data Mapper' },
  json: { glyph: '{ }', color: '#6c7a89', label: 'JSON' },
  'math-helper': { glyph: '∑', color: '#0f9fb5', label: 'Math' },
  'date-helper': { glyph: DATE_ICON, color: '#d45d9b', label: 'Date' },
  delay: { glyph: '⏳', color: '#b8860b', label: 'Delay' },
}

export function kindOf(step: FlowAction | FlowTrigger): Kind {
  if (step.type === FlowTriggerType.EMPTY) return { glyph: '+', color: '#8a929c', label: 'Choose a trigger' }
  if (step.type === FlowActionType.ROUTER) return { glyph: ROUTER_ICON, color: '#e8a317', label: 'Router' }
  if (step.type === FlowActionType.LOOP_ON_ITEMS) return { glyph: '↻', color: '#9b51e0', label: 'Loop' }
  if (step.type === FlowActionType.CODE) return { glyph: '{}', color: '#6c7a89', label: 'Code' }
  const short = ((step.settings as { qadamName?: string }).qadamName ?? '').replace(/^@aiqadam\/qadam-/u, '')
  return KINDS[short] ?? { glyph: short.slice(0, 2).toUpperCase(), color: '#6c7a89', label: short }
}

/** A short mark for a step, from its integration or its kind. */
export const glyphOf = (step: FlowAction | FlowTrigger): ReactNode => kindOf(step).glyph

const STATUS_MARK: Readonly<Record<string, string>> = { succeeded: '✓', failed: '✕', running: '…', waiting: '⏸', skipped: '–' }

export function StepNode({ data }: NodeProps & { data: { step: FlowAction | FlowTrigger } }) {
  const actions = useCanvasActions()
  const step = data.step
  const status = actions.status(step.name)
  const isTrigger = step.type === FlowTriggerType.EMPTY || step.type === FlowTriggerType.PIECE
  const empty = step.type === FlowTriggerType.EMPTY
  const kind = kindOf(step)
  const label = `${isTrigger ? 'Trigger' : 'Step'} ${step.name}: ${step.displayName}${step.valid ? '' : ', needs attention'}${status === undefined ? '' : `, ${status}`}`
  return (
    <div
      className="wa-node"
      data-selected={actions.selected === step.name ? '' : undefined}
      data-status={status}
      data-empty={empty ? '' : undefined}
      data-trigger={isTrigger ? '' : undefined}
      data-skipped={(step as FlowAction).skip === true ? '' : undefined}
      style={{ width: flowCanvasConsts.AP_NODE_SIZE.STEP.width, height: flowCanvasConsts.AP_NODE_SIZE.STEP.height, ['--wa-kind' as string]: kind.color }}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => { actions.select(step.name) }}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); actions.select(step.name) } }}
    >
      {isTrigger && !empty ? <span className="wa-bolt" title="Starts the workflow" aria-hidden="true">⚡</span> : null}
      <span className="wa-tile" aria-hidden="true">{kind.glyph}</span>
      <span className="wa-node-text">
        <b>{step.displayName}</b>
        <small>{kind.label}{isTrigger ? '' : ` · ${step.name.replace('step_', 'step ')}`}{(step as FlowAction).skip === true ? ' · skipped' : ''}</small>
      </span>
      {!step.valid && !empty ? <span className="wa-flag" title="Needs attention: open it to see what is missing">!</span> : null}
      {status === undefined ? null : <span className="wa-mark" data-status={status} title={status}>{STATUS_MARK[status] ?? ''}</span>}
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
