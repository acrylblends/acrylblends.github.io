import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cleanCategory,
  cleanDate,
  cleanOdometer,
  cleanParts,
  cleanPositive,
  cleanServiceType,
  costsOf,
  dateLabel,
  Garage,
  GarageError,
  monthlyCosts,
  money,
  money2,
  type GarageState,
} from '../plugins/garage/index.ts'
import { seed, SEED_FACTS } from '../plugins/garage/seed.ts'
import { memoryStore } from '../plugins/garage/store.ts'
import { NOW } from './support.ts'

const ids = (): ((kind: string) => string) => {
  let next = 0
  return (kind) => `${kind}-${String(++next)}`
}

async function open(): Promise<Garage> {
  return Garage.open({ store: memoryStore<GarageState>(), clock: () => NOW, newId: ids() })
}

test('the seed is the mockup garage: the Volvo, four services, ten fuel entries, three expenses and three reminders', () => {
  const state = seed(NOW, ids())
  assert.equal(state.vehicle.make, 'Volvo')
  assert.equal(state.vehicle.model, 'XC60 T5')
  assert.equal(state.vehicle.odometerKm, 86_420)
  assert.equal(state.services.length, SEED_FACTS.services)
  assert.equal(state.fuel.length, SEED_FACTS.fuel)
  assert.equal(state.expenses.length, SEED_FACTS.expenses)
  assert.equal(state.reminders.length, SEED_FACTS.reminders)
  const costs = costsOf(state, 2026)
  assert.equal(costs.costThisYear, 2_184)
  assert.equal(costs.costPerKm.toFixed(2), '0.31')
  assert.equal(costs.nextServiceKm, 1_580)
  assert.equal(monthlyCosts(state, 2026).reduce((sum, value) => sum + value, 0), 2_184)
  assert.equal(dateLabel('2026-09-18'), '18 SEP 2026')
  assert.equal(money(2_184), '€2,184')
  assert.equal(money2(0.31), '€0.31')
})

test('input validation names the date, odometer, amount, type and parts', () => {
  assert.equal(cleanDate('2026-11-06'), '2026-11-06')
  assert.throws(() => cleanDate('tomorrow'), /YYYY-MM-DD/)
  assert.equal(cleanOdometer('86420'), 86_420)
  assert.throws(() => cleanOdometer(-1), /odometer/)
  assert.throws(() => cleanPositive(0, 'Cost'), /Cost/)
  assert.equal(cleanServiceType('tyres'), 'tyres')
  assert.equal(cleanServiceType('nope'), 'service')
  assert.equal(cleanCategory('tax'), 'tax')
  assert.deepEqual(cleanParts(' oil, filter , '), ['oil', 'filter'])
})

test('fuel, service and expense entries persist and move the odometer forward only', async () => {
  const store = memoryStore<GarageState>()
  const garage = await Garage.open({ store, clock: () => NOW, newId: ids() })
  const before = garage.costs().costThisYear
  await garage.addFuel({ date: '2026-11-05', odometerKm: 86_900, litres: 50, totalCost: 90 })
  assert.equal(garage.vehicle().odometerKm, 86_900)
  assert.equal(garage.costs().costThisYear, before + 90)
  await assert.rejects(garage.addFuel({ date: 'x', odometerKm: 1, litres: 1, totalCost: 1 }), /YYYY-MM-DD/)
  const service = await garage.addService({ date: '2026-11-04', odometerKm: 86_800, type: 'service', provider: 'Autohaus West', description: 'Oil change', cost: 120, parts: 'oil, filter' })
  assert.deepEqual(service.parts, ['oil', 'filter'])
  assert.equal(store.saved >= 2, true)
  await assert.rejects(garage.updateOdometer(86_000), /backwards/)
  const vehicle = await garage.updateOdometer(87_000)
  assert.equal(vehicle.odometerKm, 87_000)
  await assert.rejects(garage.addService({ date: '2026-11-04', odometerKm: 10, type: 'service', provider: 'x', description: 'x', cost: 1 }), /far below/)
})

test('a reminder completes once and a failed save is a storage error', async () => {
  const garage = await open()
  const reminder = garage.reminders()[0]
  assert.ok(reminder !== undefined)
  const done = await garage.completeReminder(reminder.id)
  assert.equal(done.status, 'done')
  await assert.rejects(garage.completeReminder(reminder.id), /already complete/)
  const broken = await Garage.open({
    store: {
      load: async () => undefined,
      save: async () => {
        throw new Error('disk full')
      },
    },
    clock: () => NOW,
    newId: ids(),
  })
  await assert.rejects(broken.addExpense({ date: '2026-11-06', category: 'other', amount: 10, note: 'x' }), (error: unknown) => error instanceof GarageError && error.code === 'storage')
  assert.equal(broken.expenses().length, 3)
})
