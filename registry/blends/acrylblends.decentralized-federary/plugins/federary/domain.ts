/**
 * Federary's domain: a fictional federation of independently operated instances seen from its primary instance. Instances have a health, a published
 * policy and an identity assertion; the primary has a peering relation with each (pending in or out, peered, quarantined, blocked, unpeered); requests
 * and content reports are decided with reversible actions that are recorded; trust rules can stop a decision. Pure functions and plain data; the {@link Fed}
 * in fed.ts applies them to the saved state and the pages only read what they return.
 *
 * Nothing federates: no instance exists, no message leaves the app, and every name is fictional.
 */

export class FedError extends Error {
  override readonly name = 'FedError'
  readonly code: 'invalid' | 'not-found' | 'conflict'
  constructor(code: 'invalid' | 'not-found' | 'conflict', message: string) {
    super(message)
    this.code = code
  }
}

export type Relation = 'peered' | 'pending-in' | 'pending-out' | 'quarantined' | 'blocked' | 'unpeered'
export type Health = 'healthy' | 'review' | 'degraded'
export type PolicyId = 'open' | 'allowlist' | 'restricted'
export type Assertion = 'valid' | 'expired' | 'unsigned'
export type RelationAction = 'approve' | 'hold' | 'block' | 'unblock' | 'withdraw' | 'request'

export const POLICIES: Readonly<Record<PolicyId, { label: string; text: string }>> = {
  open: { label: 'Open federation', text: 'Peer policy permits public posts and signed identity assertions. Private profile data is not federated.' },
  allowlist: { label: 'Allowlist only', text: 'Only instances on the allowlist may federate; every request is reviewed by an operator.' },
  restricted: { label: 'Restricted', text: 'Public posts are federated with limits: media is not cached and replies are held for review.' },
}

export const RELATION_LABEL: Readonly<Record<Relation, string>> = {
  peered: 'Peered',
  'pending-in': 'Request pending',
  'pending-out': 'Awaiting reply',
  quarantined: 'Quarantined',
  blocked: 'Blocked',
  unpeered: 'Not peered',
}

export interface Instance {
  readonly id: string
  readonly software: string
  readonly version: string
  readonly health: Health
  readonly policy: PolicyId
  readonly assertion: Assertion
  readonly relation: Relation
  readonly primary?: boolean
  readonly inbound: number
  readonly outbound: number
  /** ISO time of the last identity handshake. */
  readonly handshakeAt: string
  /** Graph position, in percent of the map. */
  readonly x: number
  readonly y: number
}

export interface PeerLink {
  readonly a: string
  readonly b: string
}

export type ReportReason = 'spam' | 'harassment' | 'misinformation' | 'unlabelled media'
export type ReportState = 'open' | 'dismissed' | 'actioned'

export interface Report {
  readonly id: string
  readonly instance: string
  readonly subject: string
  readonly reason: ReportReason
  readonly excerpt: string
  readonly state: ReportState
  readonly at: string
}

export interface TrustRule {
  readonly id: string
  readonly kind: 'require-signed' | 'deny' | 'limit'
  /** For `deny` and `limit`: a domain pattern, where `*.` matches any subdomain. */
  readonly pattern?: string
  readonly text: string
  readonly enabled: boolean
}

export interface Decision {
  readonly id: string
  readonly at: string
  readonly actor: string
  readonly kind: 'relation' | 'report'
  readonly target: string
  readonly action: string
  readonly note: string
  /** The state before, so a decision can be undone while it still holds. */
  readonly before: { readonly relation?: Relation; readonly report?: ReportState }
  readonly after: { readonly relation?: Relation; readonly report?: ReportState }
  readonly undone: boolean
}

export interface FedEvent {
  readonly id: string
  readonly at: string
  readonly instance: string
  readonly kind: 'handshake' | 'request' | 'decision' | 'rule' | 'report'
  readonly text: string
}

export interface FedState {
  readonly version: 1
  readonly network: string
  readonly instances: readonly Instance[]
  readonly links: readonly PeerLink[]
  readonly reports: readonly Report[]
  readonly rules: readonly TrustRule[]
  readonly decisions: readonly Decision[]
  readonly events: readonly FedEvent[]
}

export const ME = 'operator'
export const MAX_EVENTS = 80
export const MAX_DECISIONS = 60

/** The transitions an action may make; anything else is refused. */
export const TRANSITIONS: Readonly<Record<RelationAction, { from: readonly Relation[]; to: Relation; label: string }>> = {
  approve: { from: ['pending-in', 'quarantined'], to: 'peered', label: 'Approve' },
  hold: { from: ['pending-in', 'peered'], to: 'quarantined', label: 'Quarantine' },
  block: { from: ['pending-in', 'peered', 'quarantined', 'unpeered'], to: 'blocked', label: 'Block' },
  unblock: { from: ['blocked'], to: 'unpeered', label: 'Unblock' },
  withdraw: { from: ['pending-out'], to: 'unpeered', label: 'Withdraw request' },
  request: { from: ['unpeered'], to: 'pending-out', label: 'Request peering' },
}

export function matches(pattern: string, domain: string): boolean {
  const p = pattern.toLowerCase()
  const d = domain.toLowerCase()
  return p.startsWith('*.') ? d.endsWith(p.slice(1)) : p === d
}

/** The rule that stops a peering approval, if any: a deny rule for the domain, a missing or expired identity assertion. */
export function approvalBlock(state: Pick<FedState, 'rules'>, inst: Instance): string | undefined {
  const deny = state.rules.find((r) => r.enabled && r.kind === 'deny' && r.pattern !== undefined && matches(r.pattern, inst.id))
  if (deny !== undefined) return `${inst.id} matches the deny rule “${deny.pattern ?? ''}”. Disable the rule to approve it.`
  if (inst.assertion === 'expired') return `${inst.id}’s identity assertion has expired; ask the operator to publish a new one.`
  if (inst.assertion === 'unsigned' && state.rules.some((r) => r.enabled && r.kind === 'require-signed')) return `${inst.id} has no signed identity assertion, and the rule “Require signed identity assertions” is on.`
  return undefined
}

export const healthLabel = (i: Instance): string => (i.primary === true ? 'Primary instance' : i.relation === 'blocked' ? 'Blocked' : i.relation === 'quarantined' ? 'Quarantined' : i.relation === 'pending-in' || i.relation === 'pending-out' ? RELATION_LABEL[i.relation] : i.relation === 'unpeered' ? 'Not peered' : i.health === 'healthy' ? `Healthy · v${i.version.split('.').slice(0, 2).join('.')}` : i.health === 'review' ? 'Review needed' : 'Degraded')

export interface Counts {
  readonly known: number
  readonly healthy: number
  readonly pendingIn: number
  readonly openReports: number
}

export function counts(s: FedState): Counts {
  return { known: s.instances.length, healthy: s.instances.filter((i) => (i.primary === true || i.relation === 'peered') && i.health === 'healthy').length, pendingIn: s.instances.filter((i) => i.relation === 'pending-in').length, openReports: s.reports.filter((r) => r.state === 'open').length }
}

/** The instances an instance is linked with: the primary's peers (peered or quarantined) and the stored peer links. */
export function peersOf(s: FedState, id: string): Instance[] {
  const me = s.instances.find((i) => i.id === id)
  const ids = new Set<string>()
  const primary = s.instances.find((i) => i.primary === true)
  for (const l of s.links) {
    if (l.a === id) ids.add(l.b)
    if (l.b === id) ids.add(l.a)
  }
  if (primary !== undefined) {
    if (me?.primary === true) {
      for (const i of s.instances) if (i.relation === 'peered' || i.relation === 'quarantined') ids.add(i.id)
    } else if (me !== undefined && (me.relation === 'peered' || me.relation === 'quarantined')) ids.add(primary.id)
  }
  return s.instances.filter((i) => ids.has(i.id) && i.id !== id)
}

export interface Edge {
  readonly a: Instance
  readonly b: Instance
  readonly style: 'solid' | 'dashed' | 'warn' | 'faint'
}

/** The lines of the map: the primary's own links by relation, and the stored peer-to-peer links between two non-blocked instances. */
export function edges(s: FedState): Edge[] {
  const primary = s.instances.find((i) => i.primary === true)
  const out: Edge[] = []
  const find = (id: string) => s.instances.find((i) => i.id === id)
  if (primary !== undefined)
    for (const i of s.instances) {
      if (i.primary === true || i.relation === 'blocked' || i.relation === 'unpeered') continue
      out.push({ a: primary, b: i, style: i.relation === 'peered' ? 'solid' : i.relation === 'quarantined' ? 'warn' : 'faint' })
    }
  for (const l of s.links) {
    const a = find(l.a)
    const b = find(l.b)
    if (a === undefined || b === undefined || a.relation === 'blocked' || b.relation === 'blocked') continue
    out.push({ a, b, style: 'dashed' })
  }
  return out
}

export function ago(iso: string, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${String(s)} sec ago`
  if (s < 3600) return `${String(Math.floor(s / 60))} min ago`
  if (s < 86400) return `${String(Math.floor(s / 3600))} hr ago`
  return `${String(Math.floor(s / 86400))} d ago`
}
