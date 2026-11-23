/** A router branch's name on its line (Branch 1, Otherwise, Success, Failure); a click opens the router. Replaces Qadam's label menu. */
import type { StepLocationRelativeToParent } from '@aiqadam/shared'
import { useCanvasActions } from '../actions'

export function BranchLabel(props: { label: string, targetNodeName: string, sourceNodeName: string, stepLocationRelativeToParent: StepLocationRelativeToParent, branchIndex?: number }) {
  const actions = useCanvasActions()
  return (
    <button type="button" className="wa-branch" title={props.label} onClick={(event) => { event.stopPropagation(); actions.select(props.sourceNodeName) }}>{props.label}</button>
  )
}
