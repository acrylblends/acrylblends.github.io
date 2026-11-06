/**
 * The runtime desk a person sees on the first start: four hosts, eighteen managed processes across Node.js, JVM, .NET and Wasmtime (edge-01 as in the
 * mockup), three compatibility rules plus one blocked, three past rollouts and the lifecycle log, timed relative to now.
 */
import type { CompatibilityRule, Host, ManagedProcess, RunState } from './domain.ts'

const HOSTS: Host[] = [
  { id: 'edge-01', city: 'Vienna', kind: 'process', cpuPercent: 31, memoryGb: 6.2, availability: 99.96 },
  { id: 'edge-02', city: 'Prague', kind: 'process', cpuPercent: 24, memoryGb: 4.9, availability: 99.98 },
  { id: 'worker-01', city: 'Frankfurt', kind: 'process', cpuPercent: 58, memoryGb: 9.4, availability: 99.82 },
  { id: 'wasm-01', city: 'EU edge', kind: 'module', cpuPercent: 19, memoryGb: 2.1, availability: 99.9 },
]

const proc = (id: string, name: string, hostId: string, family: string, version: string, status: ManagedProcess['status'] = 'running'): ManagedProcess => ({ id, name, hostId, family, version, status, restarts: 0 })

const PROCESSES: ManagedProcess[] = [
  proc('api-gateway', 'api-gateway', 'edge-01', 'Node.js', '22.11.0'),
  proc('billing-worker', 'billing-worker', 'edge-01', 'JVM', '21.0.5'),
  proc('render-engine', 'render-engine', 'edge-01', 'Wasmtime', '28.0.1', 'degraded'),
  proc('sync-agent', 'sync-agent', 'edge-01', '.NET', '9.0.0'),
  proc('auth-proxy', 'auth-proxy', 'edge-01', 'Node.js', '22.11.0'),
  proc('metrics-exporter', 'metrics-exporter', 'edge-01', 'Node.js', '22.11.0'),
  proc('edge-cache', 'edge-cache', 'edge-02', 'Node.js', '22.11.0'),
  proc('image-resizer', 'image-resizer', 'edge-02', 'Node.js', '22.10.0'),
  proc('geo-lookup', 'geo-lookup', 'edge-02', 'JVM', '21.0.5'),
  proc('tls-terminator', 'tls-terminator', 'edge-02', '.NET', '9.0.0'),
  proc('order-worker', 'order-worker', 'worker-01', 'JVM', '21.0.5', 'degraded'),
  proc('invoice-worker', 'invoice-worker', 'worker-01', 'JVM', '21.0.4'),
  proc('mail-dispatcher', 'mail-dispatcher', 'worker-01', 'Node.js', '22.11.0'),
  proc('report-builder', 'report-builder', 'worker-01', '.NET', '9.0.0'),
  proc('queue-consumer', 'queue-consumer', 'worker-01', 'Node.js', '20.18.0'),
  proc('export-worker', 'export-worker', 'worker-01', 'Node.js', '22.11.0'),
  proc('audit-writer', 'audit-writer', 'worker-01', 'JVM', '17.0.12'),
  proc('cron-runner', 'cron-runner', 'worker-01', 'Node.js', '22.11.0'),
]

const rule = (id: string, workload: string, family: string, current: string, target: string, toMajor: number, verdict: CompatibilityRule['verdict'], note: string): CompatibilityRule => ({ id, workload, family, current, target, toMajor, verdict, note })

export function seed(now: Date): RunState {
  const day = (daysAgo: number, h: number, m: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, h, m).toISOString()
  return {
    version: 1,
    hosts: HOSTS,
    processes: [
      ...PROCESSES,
      proc('wasm-render', 'wasm-render', 'wasm-01', 'Wasmtime', '28.0.1'),
      proc('wasm-thumbs', 'wasm-thumbs', 'wasm-01', 'Wasmtime', '28.0.1'),
      proc('wasm-filter', 'wasm-filter', 'wasm-01', 'Wasmtime', '28.0.0'),
    ],
    rules: [
      rule('r1', 'API gateway', 'Node.js', 'Node 20', 'Node 22', 22, 'verified', 'Test suite passes on 22 LTS.'),
      rule('r2', 'Billing worker', 'JVM', 'JVM 17', 'JVM 21', 21, 'verified', 'Virtual threads are not used.'),
      rule('r3', 'Render engine', 'Wasmtime', 'WASM 1.0', 'WASM 2.0', 29, 'review', 'Wasmtime 29 enables WASM 2.0 reference types, which change the host ABI; re-check the imports.'),
      rule('r4', 'Sync agent', '.NET', '.NET 8', '.NET 10', 10, 'blocked', 'A native dependency has no .NET 10 build yet.'),
    ],
    rollouts: [
      { id: 'ro-1', processId: 'api-gateway', hostId: 'edge-01', family: 'Node.js', version: '22.11.0', from: '22.10.0', at: day(0, 9, 20), state: 'succeeded' },
      { id: 'ro-2', processId: 'billing-worker', hostId: 'worker-01', family: 'JVM', version: '21.0.5', from: '21.0.4', at: day(1, 15, 5), state: 'succeeded' },
      { id: 'ro-3', processId: 'render-engine', hostId: 'wasm-01', family: 'Wasmtime', version: '28.0.1', from: '28.0.0', at: day(3, 11, 40), state: 'rolled-back' },
    ],
    events: [
      { id: 'ev-1', at: day(3, 12, 10), text: 'render-engine rolled back to 28.0.0', processId: 'render-engine' },
      { id: 'ev-2', at: day(0, 9, 20), text: 'api-gateway rolled out to 22.11.0', processId: 'api-gateway' },
    ],
  }
}
