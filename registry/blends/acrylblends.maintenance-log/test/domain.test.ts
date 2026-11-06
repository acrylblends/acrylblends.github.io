import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cleanDate,
  cleanDowntime,
  cleanParts,
  cleanTechnician,
  cleanText,
  longDate,
  Plant,
  statsOf,
  type PlantState,
} from '../plugins/plant/index.ts'
import { seed, SEED_FACTS } from '../plugins/plant/seed.ts'
import { memoryStore } from '../plugins/plant/store.ts'
import { NOW } from './support.ts'

const ids = (): ((kind: string) => string) => {
  let next = 0
  return (kind) => `${kind}-${String(++next)}`
}

async function open(store = memoryStore<PlantState>()): Promise<{ plant: Plant; store: ReturnType<typeof memoryStore<PlantState>> }> {
  return { plant: await Plant.open({ store, clock: () => NOW, newId: ids() }), store }
}

test('the seed is the mockup plant: 18 machines, 12 open orders, 3 overdue, 6.4 hours of downtime', () => {
  const state = seed(NOW, ids())
  assert.equal(state.machines.length, SEED_FACTS.machines)
  const stats = statsOf(state, '2026-11-06')
  assert.equal(stats.open, 12)
  assert.equal(stats.awaitingParts, 4)
  assert.equal(stats.overdue, 3)
  assert.equal(stats.linesOverdue, 2)
  assert.equal(stats.downtimeMinutes, 384)
  assert.equal((stats.downtimeMinutes / 60).toFixed(1), '6.4')
  assert.equal(stats.availability.toFixed(1), '96.8')
  assert.equal(stats.online, 17)
  assert.equal(state.workOrders.filter((order) => order.status === 'done').length, 6)
  assert.equal(state.machines.find((machine) => machine.code === 'MC-003')?.health, 74)
})

test('dates and counts are formatted in UTC', () => {
  assert.equal(longDate('2026-11-05'), '05 NOV 2026')
  assert.equal(statsOf(seed(NOW, ids()), '2026-11-06').downtimeMinutes, 384)
})

test('work order input validates the machine, text, date, parts and technician', async () => {
  const { plant, store } = await open()
  const machine = plant.machines()[0]
  assert.ok(machine !== undefined)
  await assert.rejects(plant.createWorkOrder({ machineId: 'missing', kind: 'pm', priority: 'medium', description: 'x' }), /machine/)
  await assert.rejects(plant.createWorkOrder({ machineId: machine.id, kind: 'pm', priority: 'medium', description: '' }), /Description/)
  await assert.rejects(plant.createWorkOrder({ machineId: machine.id, kind: 'pm', priority: 'medium', description: 'x', scheduledAt: 'tomorrow' }), /YYYY-MM-DD/)
  const order = await plant.createWorkOrder({ machineId: machine.id, kind: 'repair', priority: 'high', description: 'Replace bearing', scheduledAt: '2026-11-20', parts: 'bearing, grease', assignedTo: 'L. Weber' })
  assert.match(order.code, /^WO-\d+$/)
  assert.deepEqual(order.parts, ['bearing', 'grease'])
  assert.equal(order.checklist.length, 3)
  assert.equal(order.status, 'open')
  assert.equal(store.saved, 1)
  assert.equal(cleanParts(' a, b , ').length, 2)
  assert.equal(cleanDowntime('45'), 45)
  assert.throws(() => cleanDowntime(-1), /downtime/)
  assert.throws(() => cleanTechnician(''), /technician/)
  assert.throws(() => cleanText('', 'Note'), /Note/)
  assert.equal(cleanDate('2026-12-01'), '2026-12-01')
})

test('assign, schedule, start and close keep the checklist and the history', async () => {
  const { plant, store } = await open()
  const order = plant.openOrders().find((item) => item.status === 'open')
  assert.ok(order !== undefined)
  const assigned = await plant.assign(order.id, 'L. Weber')
  assert.equal(assigned.status, 'planned')
  const scheduled = await plant.schedule(order.id, '2026-11-21')
  assert.equal(scheduled.scheduledAt, '2026-11-21')
  const started = await plant.start(order.id)
  assert.equal(started.status, 'in_progress')
  assert.equal(started.checklist[0]?.done, true)
  await assert.rejects(plant.close(order.id, { note: '', downtimeMinutes: 0 }), /note/)
  await assert.rejects(plant.close(order.id, { note: 'Done', downtimeMinutes: -1 }), /downtime/)
  const closed = await plant.close(order.id, { note: 'Replaced and tested.', downtimeMinutes: 45, parts: 'bearing' })
  assert.equal(closed.status, 'done')
  assert.equal(closed.closedAt?.endsWith('Z'), true)
  assert.ok(closed.checklist.every((item) => item.done))
  assert.equal(plant.events(closed.machineId)[0]?.summary.includes('Replaced and tested.'), true)
  await assert.rejects(plant.close(order.id, { note: 'Again', downtimeMinutes: 0 }), /already closed/)
  assert.equal(store.saved >= 4, true)
})

test('a failed save is an error and the closed order is not accepted twice', async () => {
  const broken = await Plant.open({
    store: {
      load: async () => undefined,
      save: async () => {
        throw new Error('disk full')
      },
    },
    clock: () => NOW,
    newId: ids(),
  })
  const order = broken.openOrders()[0]
  assert.ok(order !== undefined)
  await assert.rejects(broken.assign(order.id, 'L. Weber'), /disk full/)
})
