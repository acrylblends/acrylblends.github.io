/** What the canvas asks of the editor around it: add a step where a + was pressed, open a step, a branch's name. One context, no store. */
import { createContext, useContext } from 'react'
import type { ApButtonData } from './types'

export interface CanvasActions {
  readonly readonly: boolean
  /** The + on an edge or the big + of an empty branch or loop. */
  add(where: ApButtonData): void
  select(stepName: string): void
  selected: string | undefined
  /** Each step's status in the run being shown (by step name), for its colour. */
  status(stepName: string): string | undefined
}

export const CanvasActionsContext = createContext<CanvasActions>({ readonly: true, add: () => {}, select: () => {}, selected: undefined, status: () => undefined })
export const useCanvasActions = (): CanvasActions => useContext(CanvasActionsContext)
