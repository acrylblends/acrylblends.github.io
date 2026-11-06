/**
 * Hyperplane's domain: hosts, virtual machines, the lifecycle state machine, capacity arithmetic, filters, snapshots and the activity log. Pure
 * functions and plain data; the {@link Fleet} in fleet.ts applies them to the saved state and the pages only read what it returns.
 *
 * Every host and machine is a fictional local fixture: nothing here talks to a hypervisor, a cloud or a host API.
 */

export type VmState = 'running' | 'paused' | 'stopped' | 'provisioning'
export type Health = 'healthy' | 'warning'

export interface Host {
  readonly id: string
  readonly name: string
  readonly health: Health
  readonly cores: number
  readonly memoryGb: number
  readonly ssdGb: number
  /** Network utilisation in %, a fixture reading. */
  readonly networkPercent: number
  /** The /24 its machines get addresses from: `10.20.1`. */
  readonly subnet: string
}

export interface VirtualMachine {
  readonly id: string
  /** `VM-104`. */
  readonly code: string
  readonly name: string
  readonly os: string
  readonly hostId: string
  readonly state: VmState
  readonly vcpu: number
  readonly memoryGb: number
  readonly diskGb: number
  /** Empty until the machine first starts. */
  readonly ip: string
}

export interface Snapshot {
  readonly id: string
  readonly vmId: string
  readonly name: string
  readonly createdAt: string
  readonly sizeGb: number
}

export interface LifecycleEvent {
  readonly id: string
  readonly at: string
  readonly text: string
  /** The machine it concerns, when it concerns one. */
  readonly vmId?: string
}

export interface FleetState {
  readonly version: 1
  readonly cluster: string
  readonly hosts: readonly Host[]
  readonly vms: readonly VirtualMachine[]
  readonly images: readonly string[]
  readonly snapshots: readonly Snapshot[]
  readonly events: readonly LifecycleEvent[]
}

export class FleetError extends Error {
  override readonly name = 'FleetError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

// ---- the lifecycle state machine ------------------------------------------------------------------------------------------------------------

export type Action = 'start' | 'pause' | 'stop'

/** Which states each action may leave, and where it goes. */
export const TRANSITIONS: Readonly<Record<Action, Readonly<Partial<Record<VmState, VmState>>>>> = {
  start: { stopped: 'running', paused: 'running', provisioning: 'running' },
  pause: { running: 'paused' },
  stop: { running: 'stopped', paused: 'stopped' },
}

/** The actions a machine in this state offers. */
export const actionsFor = (state: VmState): Action[] => (Object.keys(TRANSITIONS) as Action[]).filter((a) => TRANSITIONS[a][state] !== undefined)

/** The label a button carries: a paused machine "Resume"s. */
export const actionLabel = (action: Action, state: VmState): string =>
  action === 'start' ? (state === 'paused' ? 'Resume' : 'Start') : action === 'pause' ? 'Pause' : 'Stop'

export const STATE_LABEL: Readonly<Record<VmState, string>> = { running: 'Running', paused: 'Paused', stopped: 'Stopped', provisioning: 'Provisioning' }

/** Machines that hold their CPU and memory on the host: everything that is not stopped. */
export const holdsCapacity = (vm: VirtualMachine): boolean => vm.state !== 'stopped'

// ---- capacity -------------------------------------------------------------------------------------------------------------------------------

export interface Usage {
  readonly vcpu: number
  readonly memoryGb: number
  readonly diskGb: number
  readonly vms: number
  readonly running: number
}

export function usageOf(vms: readonly VirtualMachine[]): Usage {
  return {
    vcpu: vms.filter(holdsCapacity).reduce((n, vm) => n + vm.vcpu, 0),
    memoryGb: vms.filter(holdsCapacity).reduce((n, vm) => n + vm.memoryGb, 0),
    diskGb: vms.reduce((n, vm) => n + vm.diskGb, 0),
    vms: vms.length,
    running: vms.filter((vm) => vm.state === 'running').length,
  }
}

export interface Capacity {
  readonly cores: number
  readonly memoryGb: number
  readonly ssdGb: number
}

export const capacityOf = (hosts: readonly Host[]): Capacity => ({
  cores: hosts.reduce((n, h) => n + h.cores, 0),
  memoryGb: hosts.reduce((n, h) => n + h.memoryGb, 0),
  ssdGb: hosts.reduce((n, h) => n + h.ssdGb, 0),
})

export const percent = (used: number, total: number): number => (total <= 0 ? 0 : Math.round((used / total) * 100))

/** Whether the host can hold this machine as running (or provisioned): the reason when it cannot. */
export function fitProblem(host: Host, others: readonly VirtualMachine[], vm: { vcpu: number; memoryGb: number; diskGb?: number; name: string }, counted: boolean): string | undefined {
  const used = usageOf(others.filter((o) => o.hostId === host.id))
  if (counted && used.vcpu + vm.vcpu > host.cores)
    return `${host.name} has ${String(host.cores - used.vcpu)} vCPU free; ${vm.name} needs ${String(vm.vcpu)}.`
  if (counted && used.memoryGb + vm.memoryGb > host.memoryGb)
    return `${host.name} has ${String(host.memoryGb - used.memoryGb)} GB of memory free; ${vm.name} needs ${String(vm.memoryGb)} GB.`
  if (vm.diskGb !== undefined && used.diskGb + vm.diskGb > host.ssdGb)
    return `${host.name} has ${String(host.ssdGb - used.diskGb)} GB of SSD free; ${vm.name} needs ${String(vm.diskGb)} GB.`
  return undefined
}

// ---- inventory filters ----------------------------------------------------------------------------------------------------------------------

export interface Filter {
  readonly hostId?: string
  readonly q?: string
  readonly state?: VmState
  readonly os?: string
}

/** Machines matching the host, the state, the OS and the search text (name, code, OS, host, IP; every word must match). */
export function filterVms(vms: readonly VirtualMachine[], hosts: readonly Host[], filter: Filter): VirtualMachine[] {
  const words = (filter.q ?? '').toLowerCase().split(/\s+/).filter((w) => w !== '')
  return vms.filter((vm) => {
    if (filter.hostId !== undefined && filter.hostId !== '' && vm.hostId !== filter.hostId) return false
    if (filter.state !== undefined && vm.state !== filter.state) return false
    if (filter.os !== undefined && filter.os !== '' && vm.os !== filter.os) return false
    const hay = `${vm.name} ${vm.code} ${vm.os} ${hosts.find((h) => h.id === vm.hostId)?.name ?? ''} ${vm.ip} ${STATE_LABEL[vm.state]}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

// ---- input checks ---------------------------------------------------------------------------------------------------------------------------

export interface ProvisionInput {
  readonly name: string
  readonly hostId: string
  readonly os: string
  readonly vcpu: number
  readonly memoryGb: number
  readonly diskGb: number
}

const intIn = (raw: string | undefined, label: string, min: number, max: number): number => {
  const value = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) throw new FleetError('invalid', `${label} must be a whole number from ${String(min)} to ${String(max)}.`)
  return value
}

export function parseProvision(fields: Readonly<Record<string, string | undefined>>, images: readonly string[]): ProvisionInput {
  const name = (fields.name ?? '').trim().toLowerCase()
  if (name === '') throw new FleetError('invalid', 'Give the machine a name.')
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(name)) throw new FleetError('invalid', 'A machine name is lowercase letters, digits and dashes, up to 40 characters.')
  const os = fields.os ?? ''
  if (!images.includes(os)) throw new FleetError('invalid', 'Pick an image from the list.')
  return {
    name,
    hostId: fields.hostId ?? '',
    os,
    vcpu: intIn(fields.vcpu, 'vCPU', 1, 32),
    memoryGb: intIn(fields.memoryGb, 'Memory', 1, 256),
    diskGb: intIn(fields.diskGb, 'Disk', 8, 2000),
  }
}

export const MAX_SNAPSHOTS = 5

/** A snapshot's size: a fixed share of the machine's disk, so the same machine always snapshots to the same size. */
export const snapshotSize = (vm: VirtualMachine): number => Math.round(vm.diskGb * 0.084 * 10) / 10

/** The next free address on the host's subnet. */
export function nextIp(host: Host, vms: readonly VirtualMachine[]): string {
  const taken = new Set(vms.map((vm) => vm.ip))
  for (let last = 10; last < 250; last += 1) {
    const ip = `${host.subnet}.${String(last)}`
    if (!taken.has(ip)) return ip
  }
  throw new FleetError('conflict', `${host.name} has no free address left.`)
}
