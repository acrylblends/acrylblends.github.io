/**
 * The plant a new install starts with: 18 machines, 12 open work orders (4 awaiting parts, 3 overdue) and six November
 * close-outs whose downtime sums to the mockup's 6.4 hours. All machine states are seeded operational records.
 */
import type { ChecklistItem, Machine, MaintenanceEvent, PlantState, WorkOrder } from './domain.ts'
import { stampOf } from './domain.ts'

const CHECKLIST: readonly ChecklistItem[] = [
  { label: 'Isolate and lock out the machine', done: false },
  { label: 'Complete the planned work', done: false },
  { label: 'Test and restore to service', done: false },
]

export function seed(now: Date, newId: (kind: string) => string): PlantState {
  const day = (month: number, date: number, hour = 9): string => stampOf(new Date(Date.UTC(2026, month - 1, date, hour)))
  const machines: Machine[] = [
    { id: newId('machine'), code: 'MC-003', name: 'CNC Mill 03', type: 'Machining', line: 'Line A', location: 'Bay 3', manufacturer: 'Haas VF-2', installedAt: '2022-03-14', operatingHours: 8_421, status: 'running', health: 74, nextService: '2026-11-05', lastDowntimeMinutes: 42 },
    { id: newId('machine'), code: 'HP-001', name: 'Hydraulic Press 01', type: 'Forming', line: 'Line B', location: 'Bay 1', manufacturer: 'Schuler 400T', installedAt: '2020-08-02', operatingHours: 12_904, status: 'service_due', health: 58, nextService: '2026-11-06', lastDowntimeMinutes: 190 },
    { id: newId('machine'), code: 'CV-007', name: 'Conveyor Belt 07', type: 'Assembly', line: 'Line C', location: 'Bay 7', manufacturer: 'FlexLink X85', installedAt: '2023-01-20', operatingHours: 5_110, status: 'running', health: 91, nextService: '2026-11-08', lastDowntimeMinutes: 0 },
    { id: newId('machine'), code: 'UT-002', name: 'Compressor 02', type: 'Utilities', line: '', location: 'Utility room', manufacturer: 'Atlas Copco GA30', installedAt: '2019-11-05', operatingHours: 18_330, status: 'fault', health: 31, nextService: '2026-11-11', lastDowntimeMinutes: 336 },
    { id: newId('machine'), code: 'LC-001', name: 'Laser Cutter 01', type: 'Fabrication', line: 'Line A', location: 'Bay 5', manufacturer: 'Trumpf TruLaser 3030', installedAt: '2021-05-10', operatingHours: 6_204, status: 'running', health: 88, nextService: '2026-11-13', lastDowntimeMinutes: 0 },
  ]
  const names = ['Injection Molder 02', 'Robot Arm 04', 'Packaging Line 01', 'Welding Cell 03', 'Paint Booth 01', 'Dryer 02', 'Chiller 01', 'Air Handler 03', 'Router 02', 'Edge Bander 01', 'Saw 04', 'Press Brake 02', 'Palletizer 01']
  const codes = ['IM-002', 'RB-004', 'PK-001', 'WC-003', 'PB-001', 'DR-002', 'CH-001', 'AH-003', 'RT-002', 'EB-001', 'SW-004', 'PB-002', 'PL-001']
  const types = ['Molding', 'Robotics', 'Packaging', 'Welding', 'Finishing', 'Drying', 'Utilities', 'HVAC', 'Machining', 'Finishing', 'Machining', 'Forming', 'Assembly']
  const lines = ['Line B', 'Line C', 'Line C', 'Line A', 'Line B', 'Line A', 'Utilities', 'Utilities', 'Line C', 'Line B', 'Line A', 'Line B', 'Line C']
  for (let index = 0; index < names.length; index += 1) {
    machines.push({
      id: newId('machine'),
      code: codes[index] as string,
      name: names[index] as string,
      type: types[index] as string,
      line: lines[index] as string,
      location: `Bay ${String(index + 6)}`,
      manufacturer: 'Demo Industrial',
      installedAt: `20${String(18 + (index % 6))}-0${String((index % 9) + 1)}-12`,
      operatingHours: 2_000 + index * 617,
      status: 'running',
      health: 70 + ((index * 7) % 29),
      nextService: `2026-11-${String(14 + (index % 10)).padStart(2, '0')}`,
      lastDowntimeMinutes: index % 4 === 0 ? 28 : 0,
    })
  }
  const machine = (code: string): Machine => machines.find((item) => item.code === code) as Machine

  const work = (code: string, machineCode: string, kind: 'pm' | 'repair', priority: 'high' | 'medium' | 'low', description: string, scheduledAt: string, status: 'open' | 'planned' | 'in_progress', technician: string | undefined, parts: string[]): WorkOrder => ({
    id: newId('work'),
    code,
    machineId: machine(machineCode).id,
    kind,
    priority,
    description,
    ...(technician === undefined ? {} : { assignedTo: technician }),
    scheduledAt,
    status,
    downtimeMinutes: 0,
    parts,
    checklist: CHECKLIST.map((item) => ({ ...item })),
  })

  const workOrders: WorkOrder[] = [
    work('WO-2401', 'MC-003', 'pm', 'medium', 'Lubrication & spindle inspection', '2026-11-06', 'planned', 'L. Weber', []),
    work('WO-2402', 'HP-001', 'pm', 'high', 'Hydraulic fluid replacement', '2026-11-06', 'open', 'M. Novak', []),
    work('WO-2403', 'CV-007', 'pm', 'low', 'Belt tension & alignment', '2026-11-08', 'planned', 'J. Fischer', []),
    work('WO-2404', 'UT-002', 'repair', 'high', 'Filter and pressure check', '2026-11-11', 'open', undefined, ['filter kit']),
    work('WO-2405', 'LC-001', 'pm', 'low', 'Laser optics calibration', '2026-11-13', 'planned', 'L. Weber', []),
    work('WO-2406', 'IM-002', 'repair', 'high', 'Hydraulic pump overheating', '2026-11-01', 'in_progress', 'A. Gruber', ['seal kit']),
    work('WO-2407', 'RB-004', 'repair', 'medium', 'Axis 3 encoder drift', '2026-11-03', 'open', 'S. Klein', ['encoder']),
    work('WO-2408', 'PK-001', 'pm', 'low', 'Film tension calibration', '2026-11-05', 'planned', undefined, ['film roll']),
    work('WO-2409', 'WC-003', 'pm', 'medium', 'Electrode replacement', '2026-11-16', 'planned', 'T. Berger', []),
    work('WO-2410', 'PB-001', 'pm', 'low', 'Filter media change', '2026-11-18', 'open', 'M. Novak', []),
    work('WO-2411', 'DR-002', 'repair', 'medium', 'Temperature sensor check', '2026-11-20', 'open', 'A. Gruber', []),
    work('WO-2412', 'MC-003', 'pm', 'medium', 'Spindle bearing inspection', '2026-11-15', 'planned', 'L. Weber', []),
  ]

  const closedAt = (date: number): string => day(11, date, 15)
  const done = (code: string, machineCode: string, description: string, date: number, downtime: number, note: string, technician: string): WorkOrder => ({
    id: newId('work'),
    code,
    machineId: machine(machineCode).id,
    kind: 'repair',
    priority: 'medium',
    description,
    assignedTo: technician,
    scheduledAt: `2026-11-${String(date).padStart(2, '0')}`,
    status: 'done',
    downtimeMinutes: downtime,
    parts: [],
    checklist: CHECKLIST.map((item) => ({ ...item, done: true })),
    closedNote: note,
    closedAt: closedAt(date),
  })
  workOrders.push(
    done('WO-2380', 'IM-002', 'Coolant system service', 1, 60, 'Filter replaced and coolant topped up.', 'L. Weber'),
    done('WO-2381', 'HP-001', 'Pressure valve adjustment', 2, 75, 'Valve adjusted and pressure tested.', 'M. Novak'),
    done('WO-2382', 'CV-007', 'Belt splice repair', 3, 48, 'Splice replaced; alignment checked.', 'J. Fischer'),
    done('WO-2383', 'UT-002', 'Drain valve replacement', 4, 81, 'Valve replaced; leak test clean.', 'A. Gruber'),
    done('WO-2384', 'LC-001', 'Lens cleaning', 5, 60, 'Optics cleaned and test cut verified.', 'L. Weber'),
    done('WO-2385', 'IM-002', 'Heater band replacement', 5, 60, 'Heater band replaced; temperature stable.', 'S. Klein'),
  )

  const event = (machineCode: string, date: string, summary: string, cost: number, parts: string[] = [], workOrderId?: string): MaintenanceEvent => ({
    id: newId('event'),
    machineId: machine(machineCode).id,
    ...(workOrderId === undefined ? {} : { workOrderId }),
    occurredAt: `${date}T14:00:00.000Z`,
    summary,
    cost,
    parts,
  })
  const events: MaintenanceEvent[] = [
    event('MC-003', '2026-10-28', 'Spindle vibration inspection · within tolerance · WO-2408', 320),
    event('MC-003', '2026-10-14', 'Coolant system service · filter replaced · WO-2381', 180, ['coolant filter']),
    event('MC-003', '2026-10-02', 'Unexpected downtime · sensor recalibrated · 42 minutes', 0),
    event('HP-001', '2026-10-20', 'Hydraulic hose inspection · no leak found', 90),
    event('UT-002', '2026-10-30', 'Pressure switch replaced · leak test clean', 240, ['pressure switch']),
    event('LC-001', '2026-10-18', 'Optics alignment · test cut within tolerance', 150),
  ]
  for (const order of workOrders.filter((item) => item.status === 'done')) {
    const asset = machines.find((item) => item.id === order.machineId) as Machine
    events.push(event(asset.code, order.closedAt?.slice(0, 10) ?? '2026-11-01', `${order.description} · ${order.closedNote ?? ''}`, 0, [], order.id))
  }

  return { version: 1, machines, workOrders, events, availabilityBase: 96.8 }
}

export const SEED_FACTS = { machines: 18, open: 12, awaitingParts: 4, overdue: 3, downtimeMinutes: 384, availability: 96.8 } as const
