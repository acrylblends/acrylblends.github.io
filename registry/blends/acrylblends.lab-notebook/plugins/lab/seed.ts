/**
 * The notebook a new install opens: three notebooks (8, 4 and 11 experiments), the active Polymer tensile test record with its objective, method,
 * series averages and five specimens per formulation, two observations, three attachments and the audit trail. Values are illustrative.
 */
import type { Attachment, AuditEvent, Experiment, Instrument, LabState, Measurement, Notebook, Observation } from './domain.ts'
import { stampOf } from './domain.ts'

const INSTRUMENTS: readonly Instrument[] = [
  { id: '', name: 'Instron 5967', location: 'Materials Lab · Bench 03' },
  { id: '', name: 'Hach DR3900', location: 'Water Lab · Bench 01' },
  { id: '', name: 'Fluke 754', location: 'Calibration Bay' },
]

const NOTEBOOKS: readonly { code: string; title: string; project: string; count: number }[] = [
  { code: 'M-042', title: 'Materials Research', project: 'Materials / Batch 04', count: 8 },
  { code: 'W-018', title: 'Water Quality Study', project: 'Water / Catchment 02', count: 4 },
  { code: 'S-006', title: 'Sensor Calibration', project: 'Sensors / Bay 01', count: 11 },
]

const MATERIALS_TITLES = [
  'Polymer tensile test',
  'Thermal cycling',
  'UV exposure',
  'Flexural strength',
  'Impact resistance',
  'Moisture uptake',
  'Fibre dispersion',
  'Creep recovery',
]

const WATER_TITLES = ['Turbidity survey', 'Nitrate series', 'Conductivity drift', 'Sediment metals']
const SENSOR_TITLES = [
  'Thermocouple calibration',
  'Load cell linearity',
  'Pressure drift',
  'Humidity response',
  'Strain gauge zero',
  'Thermal offset',
  'Bridge balance',
  'Response time',
  'Hysteresis check',
  'Long-term stability',
  'Zero return',
]

const OBJECTIVE =
  'Compare tensile strength across three PLA composite formulations with different short-fibre ratios. Maintain consistent specimen geometry and test speed to isolate the influence of fibre loading.'
const METHOD =
  'Specimens were conditioned at 23 °C for 24 hours. Testing performed with a 5 kN load cell at 5 mm/min. Five specimens per formulation; values below represent the current series average.'

export function seed(now: Date, newId: (kind: string) => string): LabState {
  const instruments: Instrument[] = INSTRUMENTS.map((instrument) => ({ ...instrument, id: newId('instrument') }))
  const notebooks: Notebook[] = NOTEBOOKS.map((entry) => ({
    id: newId('notebook'),
    code: entry.code,
    title: entry.title,
    project: entry.project,
    ownerId: 'maya-chen',
  }))
  const experiments: Experiment[] = []
  NOTEBOOKS.forEach((entry, notebookIndex) => {
    const notebook = notebooks[notebookIndex] as Notebook
    const titles = notebookIndex === 0 ? MATERIALS_TITLES : notebookIndex === 1 ? WATER_TITLES : SENSOR_TITLES
    const instrument = instruments[notebookIndex] as Instrument
    for (let number = 1; number <= entry.count; number += 1) {
      const started = new Date(Date.UTC(2026, 10, 2) - (number - 1) * 86_400_000)
      experiments.push({
        id: newId('experiment'),
        notebookId: notebook.id,
        code: `${entry.code.replace(/^[A-Z]-/, 'EXP-')}-${String(number).padStart(2, '0')}`,
        number,
        title: (titles[number - 1] ?? `Experiment ${String(number)}`) as string,
        question: number === 1 && notebookIndex === 0 ? 'Effect of fibre ratio on tensile strength' : `Study ${String(number)}: ${(titles[number - 1] ?? 'measured behaviour') as string}`,
        objective: number === 1 && notebookIndex === 0 ? OBJECTIVE : 'Record the measured behaviour of the current sample series under the protocol conditions.',
        method: number === 1 && notebookIndex === 0 ? METHOD : 'Samples were conditioned before the run and measured with the notebook instrument under the protocol conditions.',
        protocolVersion: number === 1 && notebookIndex === 0 ? 'v1.3' : 'v1.0',
        startedAt: stampOf(started),
        status: number === 1 ? 'in-progress' : number === 2 ? 'in-progress' : number === 3 ? 'complete' : 'planned',
        instrumentId: instrument.id,
        location: instrument.location,
        sampleSeries: number === 1 && notebookIndex === 0 ? 'Mechanical properties of PLA composite · Sample series A' : `${notebook.code} series ${String(number).padStart(2, '0')}`,
      })
    }
  })

  const active = experiments[0] as Experiment
  const measuredAt = (day: number, hour: number, minute = 0): string => stampOf(new Date(Date.UTC(2026, 10, day, hour, minute)))
  const measurements: Measurement[] = []
  const averages: readonly [string, number][] = [
    ['A', 42.6],
    ['B', 51.8],
    ['C', 58.3972],
  ]
  for (const [formulation, value] of averages) {
    measurements.push({
      id: newId('measurement'),
      experimentId: active.id,
      kind: 'average',
      sampleId: `SERIES ${formulation}`,
      formulation,
      parameter: 'Tensile strength',
      value,
      unit: 'MPa',
      measuredAt: measuredAt(3, 15),
    })
  }
  const samples: Record<string, readonly number[]> = {
    A: [42.4, 42.8, 42.5, 42.7, 42.6],
    B: [51.6, 52.0, 51.9, 51.7, 51.8],
    C: [58.2, 58.3, 58.4, 58.5, 58.6],
  }
  for (const [formulation, values] of Object.entries(samples)) {
    values.forEach((value, index) => {
      measurements.push({
        id: newId('measurement'),
        experimentId: active.id,
        kind: 'sample',
        sampleId: `${formulation}-${String(index + 1).padStart(2, '0')}`,
        formulation,
        parameter: 'Tensile strength',
        value,
        unit: 'MPa',
        measuredAt: measuredAt(2 + (index % 2), 10 + index),
      })
    })
  }

  const observations: Observation[] = [
    {
      id: newId('observation'),
      experimentId: active.id,
      authorId: 'maya-chen',
      author: 'M. Chen',
      body: 'Formulation C shows the highest mean tensile strength. One specimen showed a visible fibre pull-out pattern; retain for microscopy review.',
      createdAt: measuredAt(4, 13, 42),
    },
    {
      id: newId('observation'),
      experimentId: active.id,
      authorId: 'maya-chen',
      author: 'M. Chen',
      body: 'Grip alignment checked before series B. No slippage observed during the final three runs.',
      createdAt: measuredAt(3, 16, 18),
    },
  ]

  const attachments: Attachment[] = [
    {
      id: newId('attachment'),
      experimentId: active.id,
      filename: 'tensile-series-a.csv',
      mimeType: 'text/csv',
      sizeBytes: 482_000,
      kind: 'csv',
      addedAt: measuredAt(3, 9),
    },
    {
      id: newId('attachment'),
      experimentId: active.id,
      filename: 'specimen-c-fracture.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1_200_000,
      kind: 'image',
      addedAt: measuredAt(4, 14),
    },
    {
      id: newId('attachment'),
      experimentId: active.id,
      filename: 'grip-alignment.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 860_000,
      kind: 'image',
      addedAt: measuredAt(3, 15),
    },
  ]

  const audit: AuditEvent[] = [
    { id: newId('audit'), experimentId: active.id, actor: 'M. Chen', action: 'Experiment created from protocol v1.3', at: measuredAt(2, 9) },
    { id: newId('audit'), experimentId: active.id, actor: 'M. Chen', action: 'Series measurements appended (15 specimens)', at: measuredAt(3, 15) },
    { id: newId('audit'), experimentId: active.id, actor: 'M. Chen', action: 'Observation appended', at: measuredAt(4, 13) },
    { id: newId('audit'), experimentId: active.id, actor: 'M. Chen', action: 'Attachment added: specimen-c-fracture.jpg', at: measuredAt(4, 14) },
  ]

  return { version: 1, notebooks, experiments, measurements, observations, attachments, instruments, audit }
}

export const SEED_FACTS = { notebooks: 3, experiments: 23, measurements: 18, observations: 2, attachments: 3 } as const
