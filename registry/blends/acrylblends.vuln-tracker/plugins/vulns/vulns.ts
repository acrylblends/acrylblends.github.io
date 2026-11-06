/** The console: assets, findings and the remediation audit trail, and the operations the pages run on them. */
import {
  cleanEvidence,
  dayOf,
  type Asset,
  type Finding,
  type FindingFilter,
  type FindingStatus,
  filterFindings,
  isOpen,
  type RemediationEvent,
  type VulnState,
  VulnsError,
  ownersOf,
  stampOf,
  statsOf,
  type VulnStats,
} from './domain.ts'
import { seed } from './seed.ts'
import type { Store } from './store.ts'

export interface VulnsAdapters {
  readonly store: Store<VulnState>
  readonly clock: () => Date
  readonly newId: (kind: string) => string
}

export class Vulns {
  private state: VulnState
  private readonly adapters: VulnsAdapters

  private constructor(state: VulnState, adapters: VulnsAdapters) {
    this.state = state
    this.adapters = adapters
  }

  static async open(adapters: VulnsAdapters): Promise<Vulns> {
    const saved = await adapters.store.load()
    return new Vulns(saved ?? seed(adapters.clock(), adapters.newId), adapters)
  }

  get now(): Date {
    return this.adapters.clock()
  }

  assets(): readonly Asset[] {
    return this.state.assets
  }

  asset(id: string): Asset | undefined {
    return this.state.assets.find((asset) => asset.id === id)
  }

  findings(filter?: FindingFilter): readonly Finding[] {
    return filterFindings(this.state, filter)
  }

  finding(id: string): Finding | undefined {
    return this.state.findings.find((finding) => finding.id === id)
  }

  allEvents(): readonly RemediationEvent[] {
    return [...this.state.events].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }

  eventsOf(findingId: string): readonly RemediationEvent[] {
    return this.state.events.filter((event) => event.findingId === findingId).sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }

  owners(): readonly string[] {
    return ownersOf(this.state)
  }

  stats(): VulnStats {
    return statsOf(this.state, dayOf(this.adapters.clock()).slice(0, 7), this.adapters.clock())
  }

  /** Assign a finding to an owner; a closed finding cannot be assigned again. */
  async assign(id: string, owner: string): Promise<Finding> {
    const finding = this.require(id)
    if (!isOpen(finding.status)) throw new VulnsError('conflict', 'That finding is closed; reopen the process with a new finding.')
    if (!this.owners().includes(owner)) throw new VulnsError('invalid', `Unknown owner “${owner}”.`)
    const next: Finding = { ...finding, status: finding.status === 'open' ? 'assigned' : finding.status, ownerId: owner }
    this.replace(next)
    this.event(next.id, 'assigned', `Assigned to ${owner}.`)
    await this.save()
    return next
  }

  async start(id: string): Promise<Finding> {
    const finding = this.require(id)
    if (!isOpen(finding.status)) throw new VulnsError('conflict', 'That finding is closed.')
    const next = { ...finding, status: 'in_progress' as FindingStatus, checklist: finding.checklist.map((item, index) => (index === 0 ? { ...item, done: true } : item)) }
    this.replace(next)
    this.event(next.id, 'in_progress', 'Remediation started.')
    await this.save()
    return next
  }

  /** Mark remediated only with evidence: a patch, a test or a scan reference. */
  async remediate(id: string, evidence: string): Promise<Finding> {
    const finding = this.require(id)
    if (!isOpen(finding.status)) throw new VulnsError('conflict', 'That finding is already closed.')
    const clean = cleanEvidence(evidence)
    const next: Finding = { ...finding, status: 'remediated', evidence: clean, checklist: finding.checklist.map((item) => ({ ...item, done: true })) }
    this.replace(next)
    this.event(next.id, 'remediated', clean)
    await this.save()
    return next
  }

  async accept(id: string, note: string): Promise<Finding> {
    const finding = this.require(id)
    if (!isOpen(finding.status)) throw new VulnsError('conflict', 'That finding is already closed.')
    const clean = note.trim()
    if (clean.length < 3) throw new VulnsError('invalid', 'Record why the risk is accepted.')
    const next: Finding = { ...finding, status: 'accepted', remediationNotes: clean }
    this.replace(next)
    this.event(next.id, 'accepted', clean)
    await this.save()
    return next
  }

  private require(id: string): Finding {
    const finding = this.finding(id)
    if (finding === undefined) throw new VulnsError('not-found', 'That finding no longer exists.')
    return finding
  }

  private replace(next: Finding): void {
    this.state.findings = this.state.findings.map((finding) => (finding.id === next.id ? next : finding))
  }

  private event(findingId: string, action: string, note: string): void {
    this.state.events = [...this.state.events, { id: this.adapters.newId('event'), findingId, actor: 'Alex M.', action, timestamp: stampOf(this.adapters.clock()), note }]
  }

  private async save(): Promise<void> {
    this.state = { ...this.state, assets: [...this.state.assets], findings: [...this.state.findings], events: [...this.state.events] }
    await this.adapters.store.save(this.state)
  }
}
