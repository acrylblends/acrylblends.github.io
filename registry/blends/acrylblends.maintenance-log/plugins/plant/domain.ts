/** Maintenance Log's types and pure rules: machines, work orders, service history and the control-room counts. */
export type MachineStatus = 'running' | 'service_due' | 'fault'
export type WorkStatus = 'open' | 'planned' | 'in_progress' | 'done'
export type Priority = 'high' | 'medium' | 'low'

export interface ChecklistItem {
  readonly label: string
  readonly done: boolean
}

export interface Machine {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly type: string
  readonly line: string
  readonly location: string
  readonly manufacturer: string
  readonly installedAt: string
  readonly operatingHours: number
  readonly status: MachineStatus
  readonly health: number
  readonly nextService: string
  readonly lastDowntimeMinutes: number
}

export interface WorkOrder {
  readonly id: string
  readonly code: string
  readonly machineId: string
  readonly kind: 'pm' | 'repair'
  readonly priority: Priority
  readonly description: string
  readonly assignedTo?: string
  readonly scheduledAt: string
  readonly status: WorkStatus
  readonly downtimeMinutes: number
  readonly parts: readonly string[]
  readonly checklist: readonly ChecklistItem[]
  readonly closedNote?: string
  readonly closedAt?: string
}

export interface MaintenanceEvent {
  readonly id: string
  readonly machineId: string
  readonly workOrderId?: string
  readonly occurredAt: string
  readonly summary: string
  readonly cost: number
  readonly parts: readonly string[]
}

export interface PlantState {
  readonly version: 1
  machines: Machine[]
  workOrders: WorkOrder[]
  events: MaintenanceEvent[]
  /** The seeded fleet availability before any extra downtime is closed out. */
  readonly availabilityBase: number
}

export type PlantErrorCode = 'invalid' | 'not-found' | 'conflict'
export class PlantError extends Error {
  readonly code: PlantErrorCode
  constructor(code: PlantErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'PlantError'
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')
export const dayOf = (date: Date): string => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
export const stampOf = (date: Date): string => date.toISOString()

export function whenText(stamp: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(stamp).getTime()) / 86_400_000)
  if (days < 0) return `in ${String(-days)}d`
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Date(stamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** `05 NOV 2026` from `2026-11-05`. */
export function longDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase()
}

/** `05 NOV` from `2026-11-05`. */
export function shortDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).toUpperCase()
}

export const isOpen = (status: WorkStatus): boolean => status !== 'done'
export function statusLabel(status: MachineStatus): string {
  return status === 'running' ? 'RUNNING' : status === 'service_due' ? 'SERVICE DUE' : 'FAULT'
}
export function workLabel(status: WorkStatus): string {
  return status === 'open' ? 'OPEN' : status === 'planned' ? 'PLANNED' : status === 'in_progress' ? 'IN PROGRESS' : 'DONE'
}
export function priorityLabel(priority: Priority): string {
  return priority.toUpperCase()
}

export interface PlantStats {
  readonly open: number
  readonly awaitingParts: number
  readonly overdue: number
  readonly downtimeMinutes: number
  readonly availability: number
  readonly online: number
  readonly linesOverdue: number
}

export function statsOf(state: PlantState, today: string): PlantStats {
  const open = state.workOrders.filter((order) => isOpen(order.status))
  const overdue = open.filter((order) => order.scheduledAt < today)
  const month = today.slice(0, 7)
  const downtime = state.workOrders
    .filter((order) => order.status === 'done' && order.closedAt !== undefined && order.closedAt.startsWith(month))
    .reduce((sum, order) => sum + order.downtimeMinutes, 0)
  const lines = new Set(overdue.map((order) => state.machines.find((machine) => machine.id === order.machineId)?.line ?? ''))
  return {
    open: open.length,
    awaitingParts: open.filter((order) => order.parts.length > 0).length,
    overdue: overdue.length,
    downtimeMinutes: downtime,
    availability: Math.max(0, state.availabilityBase - Math.max(0, downtime - 384) / 120),
    online: state.machines.filter((machine) => machine.status !== 'fault').length,
    linesOverdue: [...lines].filter((line) => line !== '').length,
  }
}

export function cleanText(value: unknown, field: string, max = 300): string {
  if (typeof value !== 'string' || value.trim() === '') throw new PlantError('invalid', `${field} is required.`)
  return value.trim().slice(0, max)
}

export function cleanDate(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00Z`).getTime()))
    throw new PlantError('invalid', 'Enter a scheduled date as YYYY-MM-DD.')
  return text
}

export function cleanTechnician(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text === '') throw new PlantError('invalid', 'A technician is required.')
  return text.slice(0, 80)
}

export function cleanParts(value: unknown): string[] {
  if (typeof value !== 'string') return []
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .slice(0, 6)
}

export function cleanDowntime(value: unknown): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 10_080) throw new PlantError('invalid', 'The downtime must be between 0 and 10,080 minutes.')
  return Math.round(number)
}

export function cleanHealth(value: unknown): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 100) throw new PlantError('invalid', 'The health index is 0 to 100.')
  return Math.round(number)
}

export function priorityOf(value: unknown): Priority {
  return value === 'high' || value === 'low' ? value : 'medium'
}
