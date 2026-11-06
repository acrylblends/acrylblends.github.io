/**
 * The workspace (`ctx.grc`): the saved controls, risks, actions and audit trail, and every change to them. A change checks its input, builds the next
 * state, saves it through the store and only then makes it current, so a failed save leaves the workspace as it was. Filters and the open control or
 * risk are the page's query, not saved.
 */
import {
  type AuditAction,
  type AuditEvent,
  type Control,
  type EvidenceItem,
  type GrcState,
  type Risk,
  type Treatment,
  type TreatmentAction,
  GrcError,
  MAX_EVENTS,
  MAX_RISKS,
  ME,
  TREATMENTS,
  inherentOf,
  latestEvidence,
  parseLevel,
  residualOf,
  HIGH,
} from './domain.ts'
import { seed } from './seed.ts'
import type { GrcStore } from './store.ts'

export interface GrcAdapters {
  readonly store: GrcStore
  readonly clock: () => Date
  readonly newId: (kind: 'risk' | 'evidence' | 'action' | 'event') => string
}

export interface TreatmentInput {
  readonly action?: string | undefined
  readonly note?: string | undefined
  readonly likelihood?: string | undefined
  readonly impact?: string | undefined
}

const DAY = 86_400_000

export class Grc {
  #state: GrcState
  readonly #adapters: GrcAdapters

  private constructor(state: GrcState, adapters: GrcAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: GrcAdapters): Promise<Grc> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Grc(saved, adapters)
    const state = seed()
    await adapters.store.save(state)
    return new Grc(state, adapters)
  }

  get state(): GrcState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  control(id: string | undefined | null): Control {
    const c = this.#state.controls.find((x) => x.id === id)
    if (c === undefined) throw new GrcError('not-found', 'There is no such control.')
    return c
  }

  risk(id: string | undefined | null): Risk {
    const r = this.#state.risks.find((x) => x.id === id)
    if (r === undefined) throw new GrcError('not-found', 'There is no such risk.')
    return r
  }

  /** The audit trail of one control (or of everything), newest first. */
  history(subject?: string): AuditEvent[] {
    return this.#state.events.filter((e) => subject === undefined || e.subject === subject).sort((a, b) => b.at.localeCompare(a.at))
  }

  async #commit(next: GrcState, events: readonly Omit<AuditEvent, 'id' | 'at' | 'actor'>[] = []): Promise<void> {
    const at = this.now().toISOString()
    const added = events.map((e) => ({ ...e, id: this.#adapters.newId('event'), at, actor: ME }))
    const state = { ...next, events: [...next.events, ...added].slice(-MAX_EVENTS) }
    await this.#adapters.store.save(state)
    this.#state = state
  }

  #withControl(c: Control, extra: Partial<GrcState> = {}): GrcState {
    return { ...this.#state, ...extra, controls: this.#state.controls.map((x) => (x.id === c.id ? c : x)) }
  }

  #due(days: number): string {
    return new Date(this.now().getTime() + days * DAY).toISOString()
  }

  /** The evidence item the review buttons act on: the control's newest one. */
  #target(c: Control): EvidenceItem {
    const e = latestEvidence(c)
    if (e === undefined) throw new GrcError('conflict', `${c.id} has no evidence to review yet.`)
    return e
  }

  async acceptEvidence(controlId: string): Promise<EvidenceItem> {
    const c = this.control(controlId)
    const e = this.#target(c)
    if (e.state === 'accepted') throw new GrcError('conflict', `“${e.title}” is already accepted.`)
    if (e.state === 'refresh-requested') throw new GrcError('conflict', `A refresh was requested for “${e.title}”; accept the refreshed evidence once it arrives.`)
    const next: EvidenceItem = { ...e, state: 'accepted', reviewedAt: this.now().toISOString(), reviewer: ME }
    await this.#commit(this.#withControl({ ...c, evidence: c.evidence.map((x) => (x.id === e.id ? next : x)) }), [{ kind: 'evidence', subject: c.id, text: `Accepted evidence “${e.title}”.` }])
    return next
  }

  /** Ask the control owner for fresh evidence: the item waits for a refresh and an audit action is opened (due in a week). */
  async requestRefresh(controlId: string): Promise<AuditAction> {
    const c = this.control(controlId)
    const e = this.#target(c)
    if (e.state === 'refresh-requested') throw new GrcError('conflict', `A refresh was already requested for “${e.title}”.`)
    const action: AuditAction = { id: this.#adapters.newId('action'), text: `Collect refreshed evidence for ${c.id} ${c.title}`, due: this.#due(7), controlId: c.id, refresh: { controlId: c.id, evidenceId: e.id }, done: false }
    await this.#commit(
      this.#withControl({ ...c, evidence: c.evidence.map((x) => (x.id === e.id ? { ...x, state: 'refresh-requested' as const } : x)) }, { actions: [...this.#state.actions, action] }),
      [{ kind: 'evidence', subject: c.id, text: `Requested a refresh of “${e.title}”; action due in 7 days.` }],
    )
    return action
  }

  async markException(controlId: string, rawReason: string | undefined): Promise<Control> {
    const c = this.control(controlId)
    const reason = (rawReason ?? '').trim()
    if (c.exception !== undefined) throw new GrcError('conflict', `${c.id} is already an exception.`)
    if (reason.length < 10) throw new GrcError('invalid', 'Give a reason of at least 10 characters for the exception.')
    if (reason.length > 200) throw new GrcError('invalid', 'An exception reason is at most 200 characters.')
    const next: Control = { ...c, exception: { reason, at: this.now().toISOString(), by: ME } }
    const action: AuditAction = { id: this.#adapters.newId('action'), text: `Review the ${c.id} exception with ${c.owner}`, due: this.#due(14), controlId: c.id, done: false }
    await this.#commit(this.#withControl(next, { actions: [...this.#state.actions, action] }), [{ kind: 'exception', subject: c.id, text: `Marked an exception: ${reason}` }])
    return next
  }

  async clearException(controlId: string): Promise<Control> {
    const c = this.control(controlId)
    if (c.exception === undefined) throw new GrcError('conflict', `${c.id} is not an exception.`)
    const { exception: _drop, ...rest } = c
    await this.#commit(this.#withControl(rest), [{ kind: 'exception', subject: c.id, text: 'Cleared the exception.' }])
    return rest
  }

  /**
   * Update a risk's treatment and residual score. Residual likelihood and impact cannot exceed the inherent ones; a High residual risk cannot be
   * accepted (mitigate or transfer it first); accepting makes the risk "accepted" and avoiding closes it, so neither counts as open any more.
   */
  async setTreatment(riskId: string, input: TreatmentInput): Promise<Risk> {
    const r = this.risk(riskId)
    const action = (Object.keys(TREATMENTS) as TreatmentAction[]).find((a) => a === input.action)
    if (action === undefined) throw new GrcError('invalid', 'Pick a treatment: mitigate, accept, transfer or avoid.')
    const likelihood = parseLevel(input.likelihood, 'Residual likelihood')
    const impact = parseLevel(input.impact, 'Residual impact')
    const note = (input.note ?? '').trim()
    if (note.length > 200) throw new GrcError('invalid', 'A treatment note is at most 200 characters.')
    if (action !== 'avoid' && note === '') throw new GrcError('invalid', 'Describe the treatment in a note.')
    if (likelihood > r.likelihood || impact > r.impact) throw new GrcError('invalid', 'The residual likelihood and impact cannot be higher than the inherent ones.')
    const treatment: Treatment = { action, note, likelihood, impact }
    const probe: Risk = { ...r, treatment }
    if (action === 'accept' && residualOf(probe) >= HIGH) throw new GrcError('conflict', `A High residual risk (${String(residualOf(probe))}) cannot be accepted; mitigate or transfer it first.`)
    const status = action === 'accept' ? 'accepted' : action === 'avoid' ? 'closed' : 'open'
    const next: Risk = { ...r, treatment, status }
    await this.#commit({ ...this.#state, risks: this.#state.risks.map((x) => (x.id === r.id ? next : x)) }, [{ kind: 'risk', subject: r.id, text: `${r.title}: ${TREATMENTS[action].toLowerCase()}, residual ${String(residualOf(next))} (inherent ${String(inherentOf(next))}).` }])
    return next
  }

  async addRisk(input: { title?: string | undefined; area?: string | undefined; owner?: string | undefined; likelihood?: string | undefined; impact?: string | undefined }): Promise<Risk> {
    const title = (input.title ?? '').trim()
    const area = (input.area ?? '').trim()
    const owner = (input.owner ?? '').trim()
    if (title === '') throw new GrcError('invalid', 'Give the risk a title.')
    if (title.length > 40) throw new GrcError('invalid', 'A risk title is at most 40 characters.')
    if (area === '' || area.length > 40) throw new GrcError('invalid', 'Name the risk’s area, up to 40 characters.')
    if (owner === '') throw new GrcError('invalid', 'Pick a risk owner.')
    const likelihood = parseLevel(input.likelihood, 'Likelihood')
    const impact = parseLevel(input.impact, 'Impact')
    if (this.#state.risks.length >= MAX_RISKS) throw new GrcError('conflict', `At most ${String(MAX_RISKS)} risks are kept.`)
    if (this.#state.risks.some((x) => x.title.toLowerCase() === title.toLowerCase())) throw new GrcError('conflict', `There is already a risk called ${title}.`)
    const risk: Risk = { id: this.#adapters.newId('risk'), title, area, owner, likelihood, impact, treatment: { action: 'mitigate', note: 'Treatment not planned yet.', likelihood, impact }, status: 'open' }
    await this.#commit({ ...this.#state, risks: [...this.#state.risks, risk] }, [{ kind: 'risk', subject: risk.id, text: `Opened risk “${title}” with inherent score ${String(inherentOf(risk))}.` }])
    return risk
  }

  /** Complete an audit action. A refresh action brings the refreshed evidence in as a new item waiting for review. */
  async completeAction(id: string): Promise<AuditAction> {
    const a = this.#state.actions.find((x) => x.id === id)
    if (a === undefined) throw new GrcError('not-found', 'There is no such action.')
    if (a.done) throw new GrcError('conflict', 'That action is already done.')
    const done: AuditAction = { ...a, done: true }
    const actions = this.#state.actions.map((x) => (x.id === id ? done : x))
    if (a.refresh === undefined) {
      await this.#commit({ ...this.#state, actions }, [{ kind: 'action', subject: a.controlId ?? 'general', text: `Completed action: ${a.text}.` }])
      return done
    }
    const c = this.control(a.refresh.controlId)
    const old = c.evidence.find((e) => e.id === a.refresh?.evidenceId)
    if (old === undefined) throw new GrcError('not-found', 'The evidence this refresh was for no longer exists.')
    const fresh: EvidenceItem = { id: this.#adapters.newId('evidence'), title: `${old.title} (refreshed)`, provenance: `Refreshed by ${c.owner}`, collectedAt: this.now().toISOString(), retention: old.retention, description: `Refreshed evidence for ${c.id}; review provenance, date and scope before attesting (synthetic).`, state: 'pending' }
    await this.#commit(this.#withControl({ ...c, evidence: [...c.evidence, fresh] }, { actions }), [{ kind: 'action', subject: c.id, text: `Completed action: ${a.text}. Refreshed evidence is waiting for review.` }])
    return done
  }

}
