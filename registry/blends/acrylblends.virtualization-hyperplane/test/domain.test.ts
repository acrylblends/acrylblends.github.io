import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  Fleet,
  FleetError,
  actionsFor,
  capacityOf,
  filterVms,
  fitProblem,
  memoryStore,
  nextIp,
  parseProvision,
  percent,
  seed,
  usageOf,
} from '../plugins/hyperplane/index.ts'
import { NOW } from './support.ts'

const open = async () => {
  let ids = 0
  const store = memoryStore()
  const fleet = await Fleet.open({ store, clock: () => NOW, newId: (kind) => `${kind}-n${++ids}` })
  return { fleet, store }
}

test('the seed reads as the mockup: 17 machines, 14 running, 42% CPU, 186 of 224 GB', () => {
  const state = seed(NOW)
  const usage = usageOf(state.vms)
  const capacity = capacityOf(state.hosts)
  assert.equal(usage.vms, 17)
  assert.equal(usage.running, 14)
  assert.equal(percent(usage.vcpu, capacity.cores), 42)
  assert.equal(usage.memoryGb, 186)
  assert.equal(capacity.memoryGb, 224)
  assert.equal(percent(usage.memoryGb, capacity.memoryGb), 83)
  // The host rail's counts: 8, 6 and 3 machines.
  assert.deepEqual(state.hosts.map((h) => state.vms.filter((v) => v.hostId === h.id).length), [8, 6, 3])
})

test('the lifecycle state machine: which actions each state offers', () => {
  assert.deepEqual(actionsFor('running'), ['pause', 'stop'])
  assert.deepEqual(actionsFor('paused'), ['start', 'stop'])
  assert.deepEqual(actionsFor('stopped'), ['start'])
  assert.deepEqual(actionsFor('provisioning'), ['start'])
})

test('search matches every word against name, code, OS, host, address and state; host and state narrow it', () => {
  const { hosts, vms } = seed(NOW)
  const names = (q: string, extra = {}) => filterVms(vms, hosts, { q, ...extra }).map((v) => v.name)
  assert.deepEqual(names('api-prod'), ['api-prod-01'])
  assert.deepEqual(names('vm-109'), ['db-replica-02'])
  assert.deepEqual(names('10.20.9.8'), ['staging-web-01'])
  assert.deepEqual(names('almalinux stopped'), ['staging-web-01'])
  assert.equal(names('debian', { hostId: 'hv-edge-01' }).length, 2)
  assert.deepEqual(names('', { state: 'paused' }), ['ci-runner-02'])
  assert.deepEqual(names('nothing-matches'), [])
})

test('capacity guards name what is missing', () => {
  const { hosts, vms } = seed(NOW)
  const edge = hosts.find((h) => h.id === 'hv-edge-01')
  assert.ok(edge)
  assert.equal(fitProblem(edge, vms, { name: 'x', vcpu: 2, memoryGb: 8 }, true), undefined)
  assert.match(fitProblem(edge, vms, { name: 'x', vcpu: 2, memoryGb: 9 }, true) ?? '', /hv-edge-01 has 8 GB of memory free; x needs 9 GB/)
  assert.match(fitProblem(edge, vms, { name: 'x', vcpu: 11, memoryGb: 1 }, true) ?? '', /10 vCPU free/)
  assert.match(fitProblem(edge, vms, { name: 'x', vcpu: 1, memoryGb: 1, diskGb: 900 }, true) ?? '', /SSD free/)
})

test('provisioning input is checked', () => {
  const images = ['Ubuntu 24.04']
  const ok = { name: ' New-Box ', hostId: 'hv-north-01', os: 'Ubuntu 24.04', vcpu: '2', memoryGb: '4', diskGb: '40' }
  assert.equal(parseProvision(ok, images).name, 'new-box')
  assert.throws(() => parseProvision({ ...ok, name: '' }, images), /Give the machine a name/)
  assert.throws(() => parseProvision({ ...ok, name: 'bad name!' }, images), /lowercase letters/)
  assert.throws(() => parseProvision({ ...ok, os: 'Windows' }, images), /Pick an image/)
  assert.throws(() => parseProvision({ ...ok, vcpu: '0' }, images), /vCPU must be a whole number from 1 to 32/)
  assert.throws(() => parseProvision({ ...ok, diskGb: '4' }, images), FleetError)
})

test('act moves a machine through its states, gives a first address, logs an event and refuses what the state forbids', async () => {
  const { fleet } = await open()
  const paused = await fleet.act('vm-104', 'pause')
  assert.equal(paused.state, 'paused')
  await assert.rejects(fleet.act('vm-104', 'pause'), /api-prod-01 is paused; it cannot be paused now/)
  assert.equal((await fleet.act('vm-104', 'start')).state, 'running')
  assert.equal(fleet.events(1)[0]?.text, 'api-prod-01 resumed')
  assert.equal((await fleet.act('vm-104', 'stop')).state, 'stopped')
  // A machine that never ran gets the next free address on its subnet when it first starts.
  const created = await fleet.provision({ name: 'fresh-01', hostId: 'hv-north-01', os: 'Debian 12', vcpu: '2', memoryGb: '4', diskGb: '40' })
  assert.equal(created.state, 'provisioning')
  assert.equal(created.ip, '')
  const started = await fleet.act(created.id, 'start')
  assert.equal(started.ip, '10.20.1.10')
})

test('starting a stopped machine needs room on its host', async () => {
  const { fleet, store } = await open()
  // hv-north-01 holds 56 of 64 GB; api-canary-01 needs 8, so it fits exactly; one more GB does not.
  const saves = store.saved
  await fleet.provision({ name: 'big-01', hostId: 'hv-north-01', os: 'Debian 12', vcpu: '1', memoryGb: '8', diskGb: '8' })
  await assert.rejects(fleet.act('vm-111', 'start'), /hv-north-01 has 0 GB of memory free; api-canary-01 needs 8 GB/)
  assert.equal(fleet.vm('vm-111').state, 'stopped')
  assert.equal(store.saved, saves + 1)
})

test('provisioning is refused for a duplicate name or a full host, and numbers continue from the highest code', async () => {
  const { fleet } = await open()
  const fields = { name: 'api-prod-01', hostId: 'hv-north-01', os: 'Debian 12', vcpu: '1', memoryGb: '1', diskGb: '8' }
  await assert.rejects(fleet.provision(fields), /already a machine called api-prod-01/)
  await assert.rejects(fleet.provision({ ...fields, name: 'huge', memoryGb: '64' }), /hv-north-01 has 8 GB of memory free/)
  const vm = await fleet.provision({ ...fields, name: 'new-workload-01', memoryGb: '4' })
  assert.equal(vm.code, 'VM-124')
  assert.equal(fleet.state.vms[0]?.id, vm.id)
})

test('snapshots: a size from the disk, a limit of five, none while provisioning, delete, and removal takes them along', async () => {
  const { fleet } = await open()
  const s = await fleet.snapshot('vm-123', ' before upgrade ')
  assert.equal(s.name, 'staging-web-01 · before upgrade')
  assert.equal(s.sizeGb, 6.7)
  for (let i = 0; i < 4; i += 1) await fleet.snapshot('vm-123')
  await assert.rejects(fleet.snapshot('vm-123'), /already has 5 snapshots/)
  const created = await fleet.provision({ name: 'fresh-01', hostId: 'hv-north-02', os: 'Debian 12', vcpu: '1', memoryGb: '1', diskGb: '8' })
  await assert.rejects(fleet.snapshot(created.id), /still provisioning/)
  await assert.rejects(fleet.snapshot('vm-123', 'x'.repeat(41)), /at most 40 characters/)
  await fleet.deleteSnapshot(s.id)
  assert.equal(fleet.snapshots('vm-123').length, 4)
  await assert.rejects(fleet.deleteSnapshot('nope'), /no such snapshot/)
  await assert.rejects(fleet.remove('vm-104'), /stop it before removing/)
  await fleet.remove('vm-123')
  assert.equal(fleet.snapshots('vm-123').length, 0)
  assert.equal(fleet.state.vms.length, 17)
})

test('nextIp skips taken addresses', () => {
  const { hosts, vms } = seed(NOW)
  const host = hosts[0]
  assert.ok(host)
  assert.equal(nextIp(host, vms), '10.20.1.10')
  assert.equal(nextIp(host, [...vms, { ...vms[0]!, ip: '10.20.1.10' }]), '10.20.1.11')
})
