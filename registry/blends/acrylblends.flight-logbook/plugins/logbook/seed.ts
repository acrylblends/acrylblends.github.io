/** The pilot a new install starts with: Maya Chen, four aircraft, 43 flights this year and the historical hours behind 486:35. */
import type { Aircraft, Endorsement, Flight, LogbookState, Pilot, Role } from './domain.ts'

export function seed(_now: Date, newId: (kind: string) => string): LogbookState {
  const pilot: Pilot = { id: newId('pilot'), name: 'Maya Chen', licenceType: 'PPL(A)', openingPicMinutes: 0 }
  const aircraft: Aircraft[] = [
    { id: newId('aircraft'), type: 'DA40', registration: 'OE-KMC', class: 'SEP', operator: 'Flugschule West' },
    { id: newId('aircraft'), type: 'C172', registration: 'OE-ABC', class: 'SEP', operator: 'Flugschule West' },
    { id: newId('aircraft'), type: 'PA28', registration: 'OE-DLT', class: 'SEP', operator: 'Aero Club Vienna' },
    { id: newId('aircraft'), type: 'DA42', registration: 'OE-GTF', class: 'MEP', operator: 'Flugschule West' },
  ]
  const flights: Flight[] = []
  const make = (date: string, departure: string, arrival: string, aircraftIndex: number, role: Role, durationMinutes: number, takeoffTime: string, landingTime: string, dayNight: Flight['dayNight'], landings: number, remarks: string, status: Flight['status'] = 'logged'): Flight => ({
    id: newId('flight'),
    date,
    departure,
    arrival,
    aircraftId: (aircraft[aircraftIndex] as Aircraft).id,
    role,
    takeoffTime,
    landingTime,
    durationMinutes,
    dayNight,
    landings,
    remarks,
    status,
  })
  flights.push(
    make('2026-11-02', 'LOWW', 'LOWL', 0, 'PIC', 72, '09:14', '10:26', 'Day', 1, 'Currency flight along the Danube; light wind, good visibility.'),
    make('2026-10-27', 'LOWW', 'LOAV', 1, 'PIC', 48, '15:02', '15:50', 'Day', 1, 'Short field practice at LOAV.'),
    make('2026-10-19', 'LOAV', 'LOWW', 1, 'PIC', 51, '10:20', '11:11', 'Day', 1, 'Return leg; one touch and go.'),
    make('2026-10-11', 'LOWW', 'LOWG', 0, 'Dual', 65, '08:40', '09:45', 'Day', 1, 'Instrument refresher with instructor Weber.'),
    make('2026-10-04', 'LOWW', 'LOWW', 2, 'PIC', 55, '13:10', '14:05', 'Day', 3, 'Circuit training, three landings.'),
    make('2026-09-28', 'LOWW', 'LOWK', 0, 'PIC', 94, '07:55', '09:29', 'Day', 1, 'Cross country to LOOK; full stop.'),
  )
  const tailNumbers = ['LOWW LOWL', 'LOWW LOAV', 'LOAV LOWW', 'LOWW LOWG', 'LOWW LOWK', 'LOWG LOWW', 'LOWW LOWI', 'LOWI LOWW', 'LOWW LOWS', 'LOWS LOWW']
  const yearTarget = 72 * 60 + 20
  let generated = 0
  for (let index = 0; index < 36; index += 1) {
    const day = 26 - (index % 26)
    const month = 1 + (index % 7)
    const date = `2026-${String(month).padStart(2, '0')}-${String(Math.max(1, day)).padStart(2, '0')}`
    const route = tailNumbers[index % tailNumbers.length] as string
    const duration = 90 + ((index * 7) % 25)
    const takeoffHour = 8 + (index % 8)
    flights.push(make(date, route.split(' ')[0] as string, route.split(' ')[1] as string, index % 4, index % 5 === 0 ? 'Dual' : 'PIC', duration, `${String(takeoffHour).padStart(2, '0')}:05`, `${String(takeoffHour + 1).padStart(2, '0')}:${String(5 + (duration % 50)).padStart(2, '0')}`, index % 6 === 0 ? 'Night' : 'Day', 1, 'Routine training flight from the demo logbook.', 'logged'))
    generated += duration
  }
  // The 43rd logged flight closes the year to exactly 72:20 and keeps the last 90 days at 12:45.
  flights.push(make('2026-10-30', 'LOWW', 'LOWW', 0, 'PIC', 380, '16:10', '22:30', 'Night', 2, 'Night currency detail; two landings.', 'logged'))
  generated += 380
  const remainder = yearTarget - 385 - generated
  if (remainder !== 0) {
    const target = flights[6]
    if (target !== undefined) {
      const index = flights.indexOf(target)
      flights[index] = { ...target, durationMinutes: target.durationMinutes + remainder }
    }
  }
  // Historical flights: 40 records from 2024 and 2025 that bring the total to 486:35.
  const historicalTarget = 486 * 60 + 35 - yearTarget
  for (let index = 0; index < 40; index += 1) {
    const date = `202${index < 20 ? '4' : '5'}-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 26) + 1).padStart(2, '0')}`
    const route = tailNumbers[index % tailNumbers.length] as string
    flights.push(make(date, route.split(' ')[0] as string, route.split(' ')[1] as string, index % 4, index % 7 === 0 ? 'Dual' : 'PIC', Math.round(historicalTarget / 40), '10:00', '11:00', 'Day', 1, 'Historical demo logbook entry.'))
  }
  flights.push(make('2026-11-05', 'LOWW', 'LOWL', 0, 'PIC', 60, '09:00', '10:00', 'Day', 1, 'Draft record to finish after the flight.', 'draft'))
  // Bring the historical block to the exact 486:35 total.
  const currentTotal = flights.filter((flight) => flight.status === 'logged').reduce((sum, flight) => sum + flight.durationMinutes, 0)
  const shortfall = 486 * 60 + 35 - currentTotal
  if (shortfall !== 0) {
    const target = flights.find((flight) => flight.date.startsWith('2025'))
    if (target !== undefined) {
      const index = flights.indexOf(target)
      flights[index] = { ...target, durationMinutes: target.durationMinutes + shortfall }
    }
  }
  const endorsements: Endorsement[] = [
    { id: newId('endorsement'), class: 'SEP', issuedAt: '2025-05-14', expiresAt: '2026-11-21' },
    { id: newId('endorsement'), class: 'MEP', issuedAt: '2025-09-02', expiresAt: '2027-02-02' },
  ]
  // The opening PIC minutes fill the gap to the mockup's 318:10; if the flights alone exceed it, some historical flights become dual.
  const targetPic = 318 * 60 + 10
  let picInFlights = flights.filter((flight) => flight.role === 'PIC' && flight.status === 'logged').reduce((sum, flight) => sum + flight.durationMinutes, 0)
  for (const flight of [...flights]) {
    if (picInFlights <= targetPic) break
    if (flight.role !== 'PIC' || flight.status !== 'logged' || flight.date >= '2026-01-01') continue
    const index = flights.indexOf(flight)
    flights[index] = { ...flight, role: 'Dual' }
    picInFlights -= flight.durationMinutes
  }
  const preliminary = { version: 1 as const, pilot, aircraft, flights, endorsements }
  preliminary.pilot = { ...pilot, openingPicMinutes: Math.max(0, targetPic - picInFlights) }
  return preliminary
}

export const SEED_FACTS = { flights: 84, yearFlights: 43, totalMinutes: 29_195, yearMinutes: 4_340, picMinutes: 19_090, last90Minutes: 765 } as const
