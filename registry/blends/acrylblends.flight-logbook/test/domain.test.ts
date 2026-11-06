import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cleanAerodrome,
  cleanDate,
  cleanDuration,
  cleanLandings,
  cleanTime,
  dateLabel,
  hoursText,
  Logbook,
  LogbookError,
  statsOf,
  type LogbookState,
} from '../plugins/logbook/index.ts'
import { seed } from '../plugins/logbook/seed.ts'
import { memoryStore } from '../plugins/logbook/store.ts'
import { NOW } from './support.ts'

const ids = (): ((kind: string) => string) => {
  let next = 0
  return (kind) => `${kind}-${String(++next)}`
}

async function open(): Promise<Logbook> {
  return Logbook.open({ store: memoryStore<LogbookState>(), clock: () => NOW, newId: ids() })
}

test('the seed is the mockup logbook: 486:35 total, 72:20 this year across 43 flights, 318:10 PIC, 12:45 last 90 days', () => {
  const state = seed(NOW, ids())
  assert.equal(state.aircraft.length, 4)
  assert.equal(state.flights.filter((flight) => flight.status === 'logged').length, 84 - 1)
  assert.equal(state.flights.filter((flight) => flight.date.startsWith('2026') && flight.status === 'logged').length, 43)
  const stats = statsOf(state, NOW)
  assert.equal(hoursText(stats.totalMinutes), '486:35')
  assert.equal(hoursText(stats.yearMinutes), '72:20')
  assert.equal(stats.yearFlights, 43)
  assert.equal(hoursText(stats.picMinutes), '318:10')
  assert.equal(hoursText(stats.last90Minutes), '12:45')
  assert.equal(stats.nextCheck, '2026-11-21')
  const first = state.flights[0]
  assert.equal(first?.departure, 'LOWW')
  assert.equal(first?.arrival, 'LOWL')
  assert.equal(first?.durationMinutes, 72)
  assert.equal(dateLabel('2026-11-02'), '02 NOV 2026')
  assert.equal(hoursText(29_195), '486:35')
})

test('flight input validates dates, aerodromes, times, durations and landings', () => {
  assert.equal(cleanDate('2026-11-06'), '2026-11-06')
  assert.throws(() => cleanDate('06.11.2026'), /YYYY-MM-DD/)
  assert.equal(cleanAerodrome('loww', 'Departure'), 'LOWW')
  assert.throws(() => cleanAerodrome('L', 'Departure'), /aerodrome/)
  assert.equal(cleanTime('09:14', 'Takeoff'), '09:14')
  assert.throws(() => cleanTime('9:14', 'Takeoff'), /09:14/)
  assert.equal(cleanDuration('1:12'), 72)
  assert.throws(() => cleanDuration('1:72'), /1:12/)
  assert.equal(cleanLandings('2'), 2)
  assert.throws(() => cleanLandings('2.5'), /whole number/)
})

test('a new flight and a draft edit persist and move the totals', async () => {
  const store = memoryStore<LogbookState>()
  const logbook = await Logbook.open({ store, clock: () => NOW, newId: ids() })
  const before = logbook.stats().yearMinutes
  const aircraft = logbook.aircraft()[0]
  assert.ok(aircraft !== undefined)
  const flight = await logbook.addFlight({ date: '2026-11-06', departure: 'loww', arrival: 'lowl', aircraftId: aircraft.id, role: 'PIC', takeoffTime: '09:00', landingTime: '10:10', duration: '1:10', dayNight: 'Day', landings: '1', remarks: 'Check flight' })
  assert.equal(flight.departure, 'LOWW')
  assert.equal(logbook.stats().yearMinutes, before + 70)
  await assert.rejects(logbook.addFlight({ date: '2026-11-06', departure: 'LOWW', arrival: 'LOWL', aircraftId: 'missing', role: 'PIC', takeoffTime: '09:00', landingTime: '10:00', duration: '1:00', dayNight: 'Day', landings: '1', remarks: '' }), /aircraft/)
  const draft = logbook.flights().find((item) => item.status === 'draft')
  assert.ok(draft !== undefined)
  const logged = await logbook.updateDraft(draft.id, { date: '2026-11-05', departure: 'LOWW', arrival: 'LOWL', aircraftId: aircraft.id, role: 'PIC', takeoffTime: '09:00', landingTime: '10:00', duration: '1:00', dayNight: 'Day', landings: '1', remarks: 'Completed' })
  assert.equal(logged.status, 'logged')
  await assert.rejects(logbook.updateDraft(logged.id, { date: '2026-11-05', departure: 'LOWW', arrival: 'LOWL', aircraftId: aircraft.id, role: 'PIC', takeoffTime: '09:00', landingTime: '10:00', duration: '1:00', dayNight: 'Day', landings: '1', remarks: '' }), /Only a draft/)
  assert.equal(store.saved, 2)
})

test('the experience summary groups by class, role and day/night', async () => {
  const logbook = await open()
  const experience = logbook.experience()
  assert.equal(experience.classes.length, 2)
  assert.ok(experience.classes.some((row) => row.label === 'SEP' && row.minutes > 0))
  assert.equal(experience.roles.length, 3)
  assert.equal(experience.dayNight.length, 2)
})

test('a failed save is a storage error', async () => {
  const broken = await Logbook.open({ store: { load: async () => undefined, save: async () => { throw new Error('disk full') } }, clock: () => NOW, newId: ids() })
  const aircraft = broken.aircraft()[0]
  assert.ok(aircraft !== undefined)
  await assert.rejects(broken.addFlight({ date: '2026-11-06', departure: 'LOWW', arrival: 'LOWL', aircraftId: aircraft.id, role: 'PIC', takeoffTime: '09:00', landingTime: '10:00', duration: '1:00', dayNight: 'Day', landings: '1', remarks: '' }), (error: unknown) => error instanceof LogbookError && error.code === 'storage')
})
