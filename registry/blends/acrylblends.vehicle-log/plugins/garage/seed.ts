/** The garage a new install starts with: the mockup's Volvo, four services, fuel entries, expenses and three reminders. */
import type { Expense, FuelEntry, GarageState, Reminder, ServiceRecord, Vehicle } from './domain.ts'

export function seed(_now: Date, newId: (kind: string) => string): GarageState {
  const vehicle: Vehicle = {
    id: newId('vehicle'),
    make: 'Volvo',
    model: 'XC60 T5',
    year: 2019,
    registration: 'W-482LX',
    vinMasked: 'YV1UZK••••••7281',
    fuelType: 'Petrol',
    transmission: 'Automatic',
    odometerKm: 86_420,
    averageConsumption: 8.1,
    currency: '€',
    fuelUnit: 'L',
    openingCost: 24_100,
  }
  const service = (date: string, odometerKm: number, type: ServiceRecord['type'], provider: string, description: string, cost: number, parts: string[] = []): ServiceRecord => ({ id: newId('service'), vehicleId: vehicle.id, date, odometerKm, type, provider, description, cost, parts })
  const services: ServiceRecord[] = [
    service('2026-09-18', 84_612, 'service', 'Autohaus West', 'Annual service · Oil, filters, brake inspection', 486, ['oil filter', 'air filter', 'oil']),
    service('2026-06-04', 81_210, 'repair', 'Autohaus West', 'Front brake pads · Replacement', 318, ['brake pads']),
    service('2026-03-11', 77_440, 'tyres', 'Reifen Bauer', 'Tyre change · summer set · Balancing and storage', 142),
    service('2025-11-22', 72_810, 'repair', 'Autohaus West', 'Battery replaced · 12V AGM', 229, ['battery']),
  ]
  const fuel = (date: string, odometerKm: number, litres: number, totalCost: number): FuelEntry => ({ id: newId('fuel'), vehicleId: vehicle.id, date, odometerKm, litres, totalCost })
  const fuelEntries: FuelEntry[] = [
    fuel('2026-10-18', 86_102, 51.2, 91.7),
    fuel('2026-09-06', 85_240, 50.4, 90.2),
    fuel('2026-08-22', 84_940, 49.8, 88.4),
    fuel('2026-07-09', 83_800, 52.4, 92.1),
    fuel('2026-06-15', 82_950, 51.0, 89.9),
    fuel('2026-05-17', 82_210, 48.9, 86.3),
    fuel('2026-04-02', 80_450, 50.1, 89.0),
    fuel('2026-03-08', 79_500, 51.5, 90.4),
    fuel('2026-02-14', 78_600, 53.0, 94.2),
    fuel('2026-01-19', 77_700, 49.5, 87.8),
  ]
  const expense = (date: string, category: Expense['category'], amount: number, note: string): Expense => ({ id: newId('expense'), vehicleId: vehicle.id, date, category, amount, note })
  const expenses: Expense[] = [
    expense('2026-01-10', 'insurance', 338, 'Annual comprehensive cover'),
    expense('2025-06-02', 'tax', 210, 'Annual motor tax'),
    expense('2025-05-20', 'inspection', 65, 'Periodic inspection'),
  ]
  const reminders: Reminder[] = [
    { id: newId('reminder'), vehicleId: vehicle.id, title: 'Oil & filter service', dueOdometerKm: 88_000, status: 'open' },
    { id: newId('reminder'), vehicleId: vehicle.id, title: 'Inspection §57a', dueDate: '2027-05-01', status: 'open' },
    { id: newId('reminder'), vehicleId: vehicle.id, title: 'Insurance renewal', dueDate: '2027-01-15', status: 'open' },
  ]
  return { version: 1, vehicle, services, fuel: fuelEntries, expenses, reminders }
}

export const SEED_FACTS = { services: 4, fuel: 10, expenses: 3, reminders: 3, costThisYear: 2_184, costPerKm: 0.31 } as const
