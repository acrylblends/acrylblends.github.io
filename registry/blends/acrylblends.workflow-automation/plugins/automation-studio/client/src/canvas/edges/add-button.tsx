/** The + on a line between steps: adds a step there. Replaces Qadam's drop-zone button (which needs its drag-and-drop and builder store). */
import { memo } from 'react'
import { useCanvasActions } from '../actions'
import type { ApButtonData } from '../types'

export const ApAddButton = memo((props: ApButtonData) => {
  const actions = useCanvasActions()
  if (actions.readonly) return null
  return (
    <button type="button" className="wa-add" aria-label={`Add a step after ${props.parentStepName}`} title="Add a step here" onClick={(event) => { event.stopPropagation(); actions.add(props) }}>+</button>
  )
})
