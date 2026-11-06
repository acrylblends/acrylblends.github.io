/**
 * The fleet (`ctx.fleet`): the saved state and every change to it. A change checks its input and the guards, builds the next state, saves it
 * through the store and only then makes it current, so a failed save leaves the fleet as it was.
 */
import {
  type Action,
  FleetError,
  type FleetState,
  type Filter,
  type Host,
  type LifecycleEvent,
  MAX_SNAPSHOTS,
  type ProvisionInput,
  type Snapshot,
  TRANSITIONS,
  type VirtualMachine,
  actionLabel,
  filterVms,
  fitProblem,
  nextIp,
  parseProvision,
  snapshotSize,
} from './domain.ts'
import { seed } from './seed.ts'
import type { FleetStore } from './store.ts'

export interface FleetAdapters {
  readonly store: FleetStore
  readonly clock: () => Date
  readonly newId: (kind: 'snapshot' | 'event') => string
}

export class Fleet {
  #state: FleetState
  readonly #adapters: FleetAdapters

  private constructor(state: FleetState, adapters: FleetAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: FleetAdapters): Promise<Fleet> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Fleet(saved, adapters)
    const state = seed(adapters.clock())
    await adapters.store.save(state)
    return new Fleet(state, adapters)
  }

  get state(): FleetState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  hosts(): readonly Host[] {
    return this.#state.hosts
  }

  host(id: string): Host {
    const host = this.#state.hosts.find((h) => h.id === id)
    if (host === undefined) throw new FleetError('not-found', 'There is no such host.')
    return host
  }

  vms(filter: Filter = {}): VirtualMachine[] {
    return filterVms(this.#state.vms, this.#state.hosts, filter)
  }

  vm(id: string): VirtualMachine {
    const vm = this.#state.vms.find((v) => v.id === id)
    if (vm === undefined) throw new FleetError('not-found', 'There is no such machine.')
    return vm
  }

  snapshots(vmId?: string): readonly Snapshot[] {
    return [...this.#state.snapshots].filter((s) => vmId === undefined || s.vmId === vmId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /** Newest first. */
  events(limit = 20, vmId?: string): readonly LifecycleEvent[] {
    return [...this.#state.events].reverse().filter((e) => vmId === undefined || e.vmId === vmId).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
  }

  async #commit(next: FleetState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  #event(text: string, vmId?: string): LifecycleEvent {
    return { id: this.#adapters.newId('event'), at: this.now().toISOString(), text, ...(vmId === undefined ? {} : { vmId }) }
  }

  /** Start, pause or stop a machine, if its state allows it and (for a start) its host has room. */
  async act(id: string, action: Action): Promise<VirtualMachine> {
    const vm = this.vm(id)
    const to = TRANSITIONS[action][vm.state]
    if (to === undefined) throw new FleetError('conflict', `${vm.name} is ${vm.state}; it cannot be ${action === 'start' ? 'started' : action === 'pause' ? 'paused' : 'stopped'} now.`)
    const host = this.host(vm.hostId)
    if (action === 'start' && vm.state === 'stopped') {
      const problem = fitProblem(host, this.#state.vms.filter((o) => o.id !== vm.id), vm, true)
      if (problem !== undefined) throw new FleetError('conflict', problem)
    }
    const ip = vm.ip === '' && to === 'running' ? nextIp(host, this.#state.vms) : vm.ip
    const next: VirtualMachine = { ...vm, state: to, ip }
    const verb = action === 'start' ? (vm.state === 'paused' ? 'resumed' : 'started') : action === 'pause' ? 'paused' : 'stopped'
    await this.#commit({
      ...this.#state,
      vms: this.#state.vms.map((v) => (v.id === vm.id ? next : v)),
      events: [...this.#state.events, this.#event(`${vm.name} ${verb}`, vm.id)],
    })
    return next
  }

  /** Create a machine in `provisioning`, reserving its CPU and memory on the host. */
  async provision(fields: Readonly<Record<string, string | undefined>>): Promise<VirtualMachine> {
    const input: ProvisionInput = parseProvision(fields, this.#state.images)
    const host = this.host(input.hostId)
    if (this.#state.vms.some((v) => v.name === input.name)) throw new FleetError('conflict', `There is already a machine called ${input.name}.`)
    const problem = fitProblem(host, this.#state.vms, input, true)
    if (problem !== undefined) throw new FleetError('conflict', problem)
    const number = Math.max(0, ...this.#state.vms.map((v) => Number(v.code.slice(3)))) + 1
    const vm: VirtualMachine = {
      id: `vm-${String(number)}`,
      code: `VM-${String(number)}`,
      name: input.name,
      os: input.os,
      hostId: host.id,
      state: 'provisioning',
      vcpu: input.vcpu,
      memoryGb: input.memoryGb,
      diskGb: input.diskGb,
      ip: '',
    }
    await this.#commit({ ...this.#state, vms: [vm, ...this.#state.vms], events: [...this.#state.events, this.#event(`${vm.name} provisioned`, vm.id)] })
    return vm
  }

  /** Take a snapshot of a machine (at most {@link MAX_SNAPSHOTS} each; not while it is still provisioning). */
  async snapshot(vmId: string, rawLabel?: string): Promise<Snapshot> {
    const vm = this.vm(vmId)
    if (vm.state === 'provisioning') throw new FleetError('conflict', `${vm.name} is still provisioning; start it before taking a snapshot.`)
    const label = (rawLabel ?? '').trim() || 'manual'
    if (label.length > 40) throw new FleetError('invalid', 'A snapshot label is at most 40 characters.')
    if (this.snapshots(vm.id).length >= MAX_SNAPSHOTS) throw new FleetError('conflict', `${vm.name} already has ${String(MAX_SNAPSHOTS)} snapshots; delete one first.`)
    const snapshot: Snapshot = { id: this.#adapters.newId('snapshot'), vmId: vm.id, name: `${vm.name} · ${label}`, createdAt: this.now().toISOString(), sizeGb: snapshotSize(vm) }
    await this.#commit({ ...this.#state, snapshots: [...this.#state.snapshots, snapshot], events: [...this.#state.events, this.#event('Snapshot created', vm.id)] })
    return snapshot
  }

  async deleteSnapshot(id: string): Promise<void> {
    const snapshot = this.#state.snapshots.find((s) => s.id === id)
    if (snapshot === undefined) throw new FleetError('not-found', 'There is no such snapshot.')
    await this.#commit({ ...this.#state, snapshots: this.#state.snapshots.filter((s) => s.id !== id), events: [...this.#state.events, this.#event('Snapshot deleted', snapshot.vmId)] })
  }

  /** Remove a stopped machine, with its snapshots. */
  async remove(id: string): Promise<void> {
    const vm = this.vm(id)
    if (vm.state !== 'stopped' && vm.state !== 'provisioning') throw new FleetError('conflict', `${vm.name} is ${vm.state}; stop it before removing it.`)
    await this.#commit({
      ...this.#state,
      vms: this.#state.vms.filter((v) => v.id !== id),
      snapshots: this.#state.snapshots.filter((s) => s.vmId !== id),
      events: [...this.#state.events, this.#event(`${vm.name} removed`)],
    })
  }
}

export { actionLabel }
