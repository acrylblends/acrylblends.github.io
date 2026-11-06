/**
 * The desk (`ctx.desk`): the saved state and every change to it. A change checks its input and the compatibility rules, builds the next state, saves
 * it through the store and only then makes it current, so a failed save leaves the desk as it was.
 */
import {
  type Host,
  type LifecycleEvent,
  type ManagedProcess,
  type RunState,
  RunError,
  type Rollout,
  rolloutCheck,
  isVersion,
} from './domain.ts'
import { seed } from './seed.ts'
import type { RunStore } from './store.ts'

export interface DeskAdapters {
  readonly store: RunStore
  readonly clock: () => Date
  readonly newId: (kind: 'event' | 'rollout') => string
}

export class Desk {
  #state: RunState
  readonly #adapters: DeskAdapters

  private constructor(state: RunState, adapters: DeskAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: DeskAdapters): Promise<Desk> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Desk(saved, adapters)
    const state = seed(adapters.clock())
    await adapters.store.save(state)
    return new Desk(state, adapters)
  }

  get state(): RunState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  host(id: string): Host {
    const host = this.#state.hosts.find((h) => h.id === id)
    if (host === undefined) throw new RunError('not-found', 'There is no such host.')
    return host
  }

  process(id: string): ManagedProcess {
    const process = this.#state.processes.find((p) => p.id === id)
    if (process === undefined) throw new RunError('not-found', 'There is no such process.')
    return process
  }

  processes(hostId: string): readonly ManagedProcess[] {
    return this.#state.processes.filter((p) => p.hostId === hostId)
  }

  /** Newest first. */
  rollouts(): readonly Rollout[] {
    return [...this.#state.rollouts].sort((a, b) => b.at.localeCompare(a.at))
  }

  events(limit = 10): readonly LifecycleEvent[] {
    return [...this.#state.events].reverse().sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
  }

  async #commit(next: RunState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  #event(text: string, processId?: string): LifecycleEvent {
    return { id: this.#adapters.newId('event'), at: this.now().toISOString(), text, ...(processId === undefined ? {} : { processId }) }
  }

  #replace(process: ManagedProcess): readonly ManagedProcess[] {
    return this.#state.processes.map((p) => (p.id === process.id ? process : p))
  }

  /** Request a simulated restart: the process goes `restarting`; `finishRestart` brings it back running. */
  async restart(id: string): Promise<ManagedProcess> {
    const process = this.process(id)
    if (process.status === 'restarting') throw new RunError('conflict', `${process.name} is already restarting.`)
    if (process.status === 'stopped') throw new RunError('conflict', `${process.name} is stopped; start it first.`)
    const next: ManagedProcess = { ...process, status: 'restarting', restarts: process.restarts + 1 }
    await this.#commit({ ...this.#state, processes: this.#replace(next), events: [...this.#state.events, this.#event(`Restart requested for ${process.name}`, id)] })
    return next
  }

  /** Complete a restart: the process comes back running (a degraded one comes back healthy). */
  async finishRestart(id: string): Promise<ManagedProcess> {
    const process = this.process(id)
    if (process.status !== 'restarting') throw new RunError('conflict', `${process.name} is ${process.status}, not restarting.`)
    const next: ManagedProcess = { ...process, status: 'running' }
    await this.#commit({ ...this.#state, processes: this.#replace(next), events: [...this.#state.events, this.#event(`${process.name} restarted and healthy`, id)] })
    return next
  }

  /** Prepare a rollout draft of a process to a runtime version, checked against the compatibility rules. */
  async prepareRollout(processId: string, version: string | undefined): Promise<Rollout> {
    const process = this.process(processId)
    const v = (version ?? '').trim()
    if (v === '' || !isVersion(v)) throw new RunError('invalid', 'A version is numbers and dots, like 22.12.0.')
    const check = rolloutCheck(this.#state.rules, process, v)
    if (!check.ok) throw new RunError('conflict', check.message)
    if (this.#state.rollouts.some((r) => r.processId === processId && r.state === 'draft')) throw new RunError('conflict', `${process.name} already has a rollout draft; run or discard it first.`)
    const rollout: Rollout = { id: this.#adapters.newId('rollout'), processId, hostId: process.hostId, family: process.family, version: v, from: process.version, at: this.now().toISOString(), state: 'draft' }
    await this.#commit({ ...this.#state, rollouts: [...this.#state.rollouts, rollout], events: [...this.#state.events, this.#event(`Rollout draft: ${process.name} ${process.version} to ${v}`, processId)] })
    return rollout
  }

  /** Run a draft: the process takes the new version (a `review` verdict leaves it degraded until it is restarted). */
  async runRollout(id: string): Promise<Rollout> {
    const rollout = this.#rollout(id)
    if (rollout.state !== 'draft') throw new RunError('conflict', `That rollout is ${rollout.state}.`)
    const process = this.process(rollout.processId)
    const review = rolloutCheck(this.#state.rules, process, rollout.version).rule?.verdict === 'review'
    const done: Rollout = { ...rollout, state: 'succeeded', at: this.now().toISOString() }
    const next: ManagedProcess = { ...process, version: rollout.version, status: review ? 'degraded' : process.status }
    await this.#commit({
      ...this.#state,
      processes: this.#replace(next),
      rollouts: this.#state.rollouts.map((r) => (r.id === id ? done : r)),
      events: [...this.#state.events, this.#event(`${process.name} rolled out to ${rollout.version}`, process.id)],
    })
    return done
  }

  /** Put a succeeded rollout back: the process returns to its previous version. */
  async rollBack(id: string): Promise<Rollout> {
    const rollout = this.#rollout(id)
    if (rollout.state !== 'succeeded') throw new RunError('conflict', `Only a succeeded rollout can be rolled back; this one is ${rollout.state}.`)
    const process = this.process(rollout.processId)
    if (process.version !== rollout.version) throw new RunError('conflict', `${process.name} runs ${process.version} now, not ${rollout.version}; roll back the newer rollout first.`)
    const done: Rollout = { ...rollout, state: 'rolled-back' }
    await this.#commit({
      ...this.#state,
      processes: this.#replace({ ...process, version: rollout.from }),
      rollouts: this.#state.rollouts.map((r) => (r.id === id ? done : r)),
      events: [...this.#state.events, this.#event(`${process.name} rolled back to ${rollout.from}`, process.id)],
    })
    return done
  }

  async discardRollout(id: string): Promise<void> {
    const rollout = this.#rollout(id)
    if (rollout.state !== 'draft') throw new RunError('conflict', `That rollout is ${rollout.state}; only a draft can be discarded.`)
    await this.#commit({ ...this.#state, rollouts: this.#state.rollouts.filter((r) => r.id !== id) })
  }

  #rollout(id: string): Rollout {
    const rollout = this.#state.rollouts.find((r) => r.id === id)
    if (rollout === undefined) throw new RunError('not-found', 'There is no such rollout.')
    return rollout
  }
}
