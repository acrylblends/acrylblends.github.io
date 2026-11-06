/** The network a person sees on the first start: northstar.social with five healthy-looking peers (one needing review), three inbound requests, one outbound, and a few reports and trust rules. */
import type { FedState, Instance, Report, TrustRule } from './domain.ts'

export function seed(now: Date): FedState {
  const ago = (sec: number): string => new Date(now.getTime() - sec * 1000).toISOString()
  const inst = (i: Omit<Instance, 'handshakeAt' | 'software'> & { ago: number; software?: string }): Instance => {
    const { ago: s, software = 'Federary', ...rest } = i
    return { software, handshakeAt: ago(s), ...rest }
  }
  const instances: Instance[] = [
    inst({ id: 'northstar.social', version: '4.2.1', health: 'healthy', policy: 'open', assertion: 'valid', relation: 'peered', primary: true, inbound: 18, outbound: 12, ago: 34, x: 50, y: 49 }),
    inst({ id: 'garden.pub', version: '4.2.0', health: 'healthy', policy: 'open', assertion: 'valid', relation: 'peered', inbound: 9, outbound: 6, ago: 90, x: 22, y: 23 }),
    inst({ id: 'weave.place', version: '3.9.4', health: 'healthy', policy: 'allowlist', assertion: 'valid', relation: 'peered', inbound: 7, outbound: 5, ago: 140, x: 73, y: 22 }),
    inst({ id: 'commons.zone', version: '4.1.2', health: 'healthy', policy: 'open', assertion: 'valid', relation: 'peered', inbound: 14, outbound: 11, ago: 60, x: 85, y: 68 }),
    inst({ id: 'openfield.net', version: '4.0.3', health: 'review', policy: 'restricted', assertion: 'valid', relation: 'peered', inbound: 5, outbound: 3, ago: 1900, x: 58, y: 84 }),
    inst({ id: 'quiet.space', version: '4.0.1', health: 'healthy', policy: 'allowlist', assertion: 'valid', relation: 'peered', inbound: 4, outbound: 4, ago: 210, x: 22, y: 73 }),
    inst({ id: 'meadow.community', version: '4.2.1', health: 'healthy', policy: 'open', assertion: 'valid', relation: 'pending-in', inbound: 3, outbound: 2, ago: 600, x: 10, y: 48 }),
    inst({ id: 'signal.social', version: '4.1.0', health: 'healthy', policy: 'open', assertion: 'unsigned', relation: 'pending-in', inbound: 6, outbound: 1, ago: 900, x: 90, y: 42 }),
    inst({ id: 'promo.spamfarm.example', version: '3.2.0', health: 'degraded', policy: 'open', assertion: 'unsigned', relation: 'pending-in', inbound: 0, outbound: 410, ago: 3000, x: 45, y: 9 }),
    inst({ id: 'reed.network', version: '4.1.5', health: 'healthy', policy: 'open', assertion: 'valid', relation: 'pending-out', inbound: 2, outbound: 2, ago: 7200, x: 38, y: 91 }),
    inst({ id: 'lantern.club', version: '4.2.0', health: 'healthy', policy: 'open', assertion: 'expired', relation: 'unpeered', inbound: 1, outbound: 1, ago: 86400 * 6, x: 30, y: 52 }),
    inst({ id: 'hollow.cafe', version: '3.8.0', health: 'degraded', policy: 'restricted', assertion: 'expired', relation: 'blocked', inbound: 0, outbound: 9, ago: 86400 * 20, x: 74, y: 45 }),
  ]
  const r = (id: string, instance: string, subject: string, reason: Report['reason'], excerpt: string, sec: number): Report => ({ id, instance, subject, reason, excerpt, state: 'open', at: ago(sec) })
  const reports: Report[] = [
    r('rep-1', 'openfield.net', '@pine@openfield.net', 'spam', 'Synthetic example: repeated link posts promoting a giveaway.', 1200),
    r('rep-2', 'openfield.net', '@dusk@openfield.net', 'harassment', 'Synthetic example: a thread of hostile replies to a new member.', 2400),
    r('rep-3', 'weave.place', '@loom@weave.place', 'unlabelled media', 'Synthetic example: an image post without a content label.', 5400),
    r('rep-4', 'promo.spamfarm.example', '@deals@promo.spamfarm.example', 'spam', 'Synthetic example: 410 outbound posts in ten minutes.', 800),
    r('rep-5', 'commons.zone', '@fen@commons.zone', 'misinformation', 'Synthetic example: a post with an unsourced claim.', 9000),
  ]
  const rules: TrustRule[] = [
    { id: 'rule-signed', kind: 'require-signed', text: 'Require signed identity assertions', enabled: true },
    { id: 'rule-deny', kind: 'deny', pattern: '*.spamfarm.example', text: 'Deny instances on spam-farm domains', enabled: true },
    { id: 'rule-limit', kind: 'limit', pattern: 'openfield.net', text: 'Do not cache media from openfield.net', enabled: true },
  ]
  return {
    version: 1,
    network: 'Federary demo network',
    instances,
    links: [{ a: 'garden.pub', b: 'quiet.space' }, { a: 'weave.place', b: 'openfield.net' }, { a: 'garden.pub', b: 'commons.zone' }, { a: 'weave.place', b: 'commons.zone' }],
    reports,
    rules,
    decisions: [],
    events: [
      { id: 'ev-1', at: ago(34), instance: 'northstar.social', kind: 'handshake', text: 'Identity handshake with garden.pub completed.' },
      { id: 'ev-2', at: ago(600), instance: 'meadow.community', kind: 'request', text: 'Inbound federation request received.' },
    ],
  }
}
