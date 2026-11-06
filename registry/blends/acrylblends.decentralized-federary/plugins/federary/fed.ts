/**
 * The network (`ctx.fed`): the saved instances, reports, rules and the decision history, and every change to them. A change checks its input and the trust
 * rules, builds the next state, saves it through the store and only then makes it current, so a failed save leaves the network as it was. What is open on
 * the map is the page's `?instance=`, not saved.
 */
import {
  type Decision,
  type FedEvent,
  type FedState,
  type Instance,
  type Relation,
  type RelationAction,
  type Report,
  type TrustRule,
  FedError,
  MAX_DECISIONS,
  MAX_EVENTS,
  ME,
  RELATION_LABEL,
  TRANSITIONS,
  approvalBlock,
} from './domain.ts'
import { seed } from './seed.ts'
import type { FedStore } from './store.ts'

export interface FedAdapters {
  readonly store: FedStore
  readonly clock: () => Date
  readonly newId: (kind: 'decision' | 'event') => string
}

export class Fed {
  #state: FedState
  readonly #adapters: FedAdapters

  private constructor(state: FedState, adapters: FedAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: FedAdapters): Promise<Fed> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Fed(saved, adapters)
    const state = seed(adapters.clock())
    await adapters.store.save(state)
    return new Fed(state, adapters)
  }

  get state(): FedState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  get primary(): Instance {
    const p = this.#state.instances.find((i) => i.primary === true)
    if (p === undefined) throw new FedError('not-found', 'The network has no primary instance.')
    return p
  }

  instance(id: string | undefined | null): Instance {
    const i = this.#state.instances.find((x) => x.id === id)
    if (i === undefined) throw new FedError('not-found', 'There is no such instance.')
    return i
  }

  report(id: string): Report {
    const r = this.#state.reports.find((x) => x.id === id)
    if (r === undefined) throw new FedError('not-found', 'There is no such report.')
    return r
  }

  /** The history of one instance (events), newest first. */
  history(instance?: string): FedEvent[] {
    return this.#state.events.filter((e) => instance === undefined || e.instance === instance).reverse().sort((a, b) => b.at.localeCompare(a.at))
  }

  async #commit(next: FedState, events: readonly Omit<FedEvent, 'id' | 'at'>[] = []): Promise<void> {
    const at = this.now().toISOString()
    const added = events.map((e) => ({ ...e, id: this.#adapters.newId('event'), at }))
    const state = { ...next, events: [...next.events, ...added].slice(-MAX_EVENTS), decisions: next.decisions.slice(-MAX_DECISIONS) }
    await this.#adapters.store.save(state)
    this.#state = state
  }

  #setInstance(i: Instance): FedState {
    return { ...this.#state, instances: this.#state.instances.map((x) => (x.id === i.id ? i : x)) }
  }

  #decision(kind: Decision['kind'], target: string, action: string, note: string, before: Decision['before'], after: Decision['after']): Decision {
    return { id: this.#adapters.newId('decision'), at: this.now().toISOString(), actor: ME, kind, target, action, note, before, after, undone: false }
  }

  /** Change the primary's relation with an instance. A reversible demo action: it is recorded and can be undone. */
  async act(id: string, rawAction: string | undefined, note = ''): Promise<Decision> {
    const inst = this.instance(id)
    const action = (Object.keys(TRANSITIONS) as RelationAction[]).find((a) => a === rawAction)
    if (action === undefined) throw new FedError('invalid', 'Pick approve, quarantine, block, unblock, withdraw or request.')
    if (inst.primary === true) throw new FedError('conflict', 'The primary instance cannot be changed here.')
    const t = TRANSITIONS[action]
    if (!t.from.includes(inst.relation)) throw new FedError('conflict', `${inst.id} is ${RELATION_LABEL[inst.relation].toLowerCase()}; it cannot be set to ${RELATION_LABEL[t.to].toLowerCase()} with “${t.label}”.`)
    if (action === 'approve') {
      const blocked = approvalBlock(this.#state, inst)
      if (blocked !== undefined) throw new FedError('conflict', blocked)
    }
    const d = this.#decision('relation', inst.id, action, note.trim(), { relation: inst.relation }, { relation: t.to })
    await this.#commit({ ...this.#setInstance({ ...inst, relation: t.to }), decisions: [...this.#state.decisions, d] }, [{ instance: inst.id, kind: action === 'request' || action === 'withdraw' ? 'request' : 'decision', text: `${t.label}: ${RELATION_LABEL[inst.relation]} → ${RELATION_LABEL[t.to]}.` }])
    return d
  }

  /** Decide a content report: dismiss it, limit the instance (quarantine it) or block the instance. */
  async decideReport(id: string, rawAction: string | undefined): Promise<Decision> {
    const r = this.report(id)
    if (r.state !== 'open') throw new FedError('conflict', 'That report has already been decided.')
    const action = rawAction === 'dismiss' || rawAction === 'limit' || rawAction === 'block' ? rawAction : undefined
    if (action === undefined) throw new FedError('invalid', 'Pick dismiss, limit or block.')
    const inst = this.instance(r.instance)
    const to: Relation | undefined = action === 'limit' ? 'quarantined' : action === 'block' ? 'blocked' : undefined
    if (to !== undefined && inst.relation === to) throw new FedError('conflict', `${inst.id} is already ${RELATION_LABEL[to].toLowerCase()}.`)
    const next: FedState = { ...this.#state, reports: this.#state.reports.map((x) => (x.id === id ? { ...x, state: action === 'dismiss' ? ('dismissed' as const) : ('actioned' as const) } : x)) }
    const d = this.#decision('report', r.id, action, '', { report: 'open', ...(to === undefined ? {} : { relation: inst.relation }) }, { report: action === 'dismiss' ? 'dismissed' : 'actioned', ...(to === undefined ? {} : { relation: to }) })
    const withInstance = to === undefined ? next : { ...next, instances: next.instances.map((x) => (x.id === inst.id ? { ...x, relation: to } : x)) }
    await this.#commit({ ...withInstance, decisions: [...this.#state.decisions, d] }, [{ instance: inst.id, kind: 'report', text: `Report on ${r.subject} (${r.reason}): ${action === 'dismiss' ? 'dismissed' : action === 'limit' ? 'instance limited (quarantined)' : 'instance blocked'}.` }])
    return d
  }

  /** Undo a decision while its result still stands: the relation and the report go back to what they were. */
  async undo(id: string): Promise<Decision> {
    const d = this.#state.decisions.find((x) => x.id === id)
    if (d === undefined) throw new FedError('not-found', 'There is no such decision.')
    if (d.undone) throw new FedError('conflict', 'That decision was already undone.')
    const instId = d.kind === 'relation' ? d.target : this.report(d.target).instance
    const inst = this.instance(instId)
    if (d.after.relation !== undefined && inst.relation !== d.after.relation) throw new FedError('conflict', `${inst.id} has changed since this decision (${RELATION_LABEL[inst.relation].toLowerCase()}); undo the later decision first.`)
    let state = this.#state
    if (d.before.relation !== undefined) state = { ...state, instances: state.instances.map((x) => (x.id === instId ? { ...x, relation: d.before.relation as Relation } : x)) }
    if (d.before.report !== undefined) state = { ...state, reports: state.reports.map((x) => (x.id === d.target ? { ...x, state: d.before.report as Report['state'] } : x)) }
    const undone = { ...d, undone: true }
    await this.#commit({ ...state, decisions: state.decisions.map((x) => (x.id === id ? undone : x)) }, [{ instance: instId, kind: 'decision', text: `Undid “${d.action}”: restored ${d.before.relation === undefined ? 'the report to open' : RELATION_LABEL[d.before.relation].toLowerCase()}.` }])
    return undone
  }

  /** Run an identity handshake with an instance. An expired assertion fails; a valid one refreshes the handshake time and clears a "review" health. */
  async handshake(id: string): Promise<Instance> {
    const inst = this.instance(id)
    if (inst.primary === true) throw new FedError('conflict', 'The primary instance does not handshake with itself.')
    if (inst.relation === 'blocked') throw new FedError('conflict', `${inst.id} is blocked; unblock it before a handshake.`)
    if (inst.assertion === 'expired') {
      await this.#commit(this.#state, [{ instance: inst.id, kind: 'handshake', text: 'Identity handshake failed: the assertion has expired.' }])
      throw new FedError('conflict', `The handshake with ${inst.id} failed: its identity assertion has expired.`)
    }
    const next: Instance = { ...inst, handshakeAt: this.now().toISOString(), health: inst.health === 'review' && inst.assertion === 'valid' ? 'healthy' : inst.health }
    await this.#commit(this.#setInstance(next), [{ instance: inst.id, kind: 'handshake', text: inst.assertion === 'unsigned' ? 'Handshake completed, but the identity is unsigned.' : 'Identity handshake completed.' }])
    return next
  }

  async toggleRule(id: string): Promise<TrustRule> {
    const rule = this.#state.rules.find((r) => r.id === id)
    if (rule === undefined) throw new FedError('not-found', 'There is no such trust rule.')
    const next = { ...rule, enabled: !rule.enabled }
    await this.#commit({ ...this.#state, rules: this.#state.rules.map((r) => (r.id === id ? next : r)) }, [{ instance: this.primary.id, kind: 'rule', text: `Trust rule “${rule.text}” ${next.enabled ? 'enabled' : 'disabled'}.` }])
    return next
  }

  /** The topology as exported: instances with their relation, and the links drawn on the map. */
  topology(): { network: string; instances: { id: string; relation: Relation; health: string; policy: string }[]; links: { a: string; b: string }[] } {
    const s = this.#state
    const primary = this.primary
    return {
      network: s.network,
      instances: s.instances.map((i) => ({ id: i.id, relation: i.relation, health: i.health, policy: i.policy })),
      links: [...s.instances.filter((i) => i.primary !== true && (i.relation === 'peered' || i.relation === 'quarantined')).map((i) => ({ a: primary.id, b: i.id })), ...s.links.filter((l) => !s.instances.some((i) => i.relation === 'blocked' && (i.id === l.a || i.id === l.b)))],
    }
  }
}
