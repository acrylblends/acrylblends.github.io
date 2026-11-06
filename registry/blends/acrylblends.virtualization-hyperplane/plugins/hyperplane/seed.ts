/**
 * The fleet a person sees on the first start: Cluster North with three hosts and 17 machines (14 running, one paused, two stopped), two snapshots
 * and a short activity log, timed relative to now. The numbers are chosen so the cluster reads as the mockup does: 42% CPU, 186 of 224 GB memory.
 */
import type { FleetState, Host, VirtualMachine, VmState } from './domain.ts'

const at = (now: Date, daysAgo: number, hours: number, minutes: number): string =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hours, minutes).toISOString()

const HOSTS: Host[] = [
  { id: 'hv-north-01', name: 'hv-north-01', health: 'healthy', cores: 32, memoryGb: 64, ssdGb: 2000, networkPercent: 30, subnet: '10.20.1' },
  { id: 'hv-north-02', name: 'hv-north-02', health: 'healthy', cores: 64, memoryGb: 128, ssdGb: 4000, networkPercent: 26, subnet: '10.20.2' },
  { id: 'hv-edge-01', name: 'hv-edge-01', health: 'warning', cores: 16, memoryGb: 32, ssdGb: 1000, networkPercent: 28, subnet: '10.20.9' },
]

type Row = [code: number, name: string, os: string, host: string, state: VmState, vcpu: number, memoryGb: number, diskGb: number, ip: string]

const ROWS: Row[] = [
  [104, 'api-prod-01', 'Ubuntu 24.04', 'hv-north-01', 'running', 4, 16, 200, '10.20.1.14'],
  [109, 'db-replica-02', 'Debian 12', 'hv-north-01', 'running', 8, 32, 600, '10.20.1.22'],
  [105, 'auth-prod-01', 'Ubuntu 24.04', 'hv-north-01', 'running', 1, 2, 60, '10.20.1.15'],
  [106, 'mail-relay-01', 'Debian 12', 'hv-north-01', 'running', 1, 2, 40, '10.20.1.16'],
  [107, 'dns-01', 'AlmaLinux 9', 'hv-north-01', 'running', 1, 2, 20, '10.20.1.17'],
  [108, 'vpn-gateway-01', 'Debian 12', 'hv-north-01', 'running', 1, 1, 20, '10.20.1.18'],
  [110, 'ntp-01', 'AlmaLinux 9', 'hv-north-01', 'running', 1, 1, 20, '10.20.1.19'],
  [111, 'api-canary-01', 'Ubuntu 24.04', 'hv-north-01', 'stopped', 1, 8, 80, '10.20.1.20'],
  [118, 'worker-batch-03', 'Ubuntu 22.04', 'hv-north-02', 'running', 12, 64, 800, '10.20.2.31'],
  [112, 'cache-01', 'Ubuntu 24.04', 'hv-north-02', 'running', 4, 16, 120, '10.20.2.11'],
  [113, 'queue-02', 'Debian 12', 'hv-north-02', 'running', 2, 8, 160, '10.20.2.12'],
  [114, 'ci-runner-01', 'Ubuntu 22.04', 'hv-north-02', 'running', 2, 4, 200, '10.20.2.13'],
  [115, 'metrics-01', 'Ubuntu 24.04', 'hv-north-02', 'running', 2, 4, 300, '10.20.2.14'],
  [116, 'ci-runner-02', 'Ubuntu 22.04', 'hv-north-02', 'paused', 2, 10, 200, '10.20.2.15'],
  [123, 'staging-web-01', 'AlmaLinux 9', 'hv-edge-01', 'stopped', 2, 8, 80, '10.20.9.8'],
  [120, 'edge-proxy-01', 'Debian 12', 'hv-edge-01', 'running', 4, 16, 60, '10.20.9.10'],
  [121, 'edge-cache-01', 'Debian 12', 'hv-edge-01', 'running', 2, 8, 200, '10.20.9.11'],
]

export function seed(now: Date): FleetState {
  const vms: VirtualMachine[] = ROWS.map(([code, name, os, hostId, state, vcpu, memoryGb, diskGb, ip]) => ({
    id: `vm-${String(code)}`,
    code: `VM-${String(code)}`,
    name,
    os,
    hostId,
    state,
    vcpu,
    memoryGb,
    diskGb,
    ip,
  }))
  return {
    version: 1,
    cluster: 'Cluster North',
    hosts: HOSTS,
    vms,
    images: ['Ubuntu 24.04', 'Ubuntu 22.04', 'Debian 12', 'AlmaLinux 9'],
    snapshots: [
      { id: 'snap-1', vmId: 'vm-104', name: 'api-prod-01 · before patch', createdAt: at(now, 0, 9, 42), sizeGb: 4.2 },
      { id: 'snap-2', vmId: 'vm-109', name: 'db-replica-02 · nightly', createdAt: at(now, 0, 2, 0), sizeGb: 8.7 },
    ],
    events: [
      { id: 'event-1', at: at(now, 1, 18, 5), text: 'Host scan' },
      { id: 'event-2', at: at(now, 0, 8, 16), text: 'VM restarted', vmId: 'vm-105' },
      { id: 'event-3', at: at(now, 0, 9, 42), text: 'Snapshot created', vmId: 'vm-104' },
    ],
  }
}
