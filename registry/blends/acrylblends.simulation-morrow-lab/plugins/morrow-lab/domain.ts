/**
 * Morrow Lab's domain: models, parameter sets, the deterministic thermal model, runs and snapshots. Pure functions and plain data; the
 * {@link Lab} in lab.ts applies them to the saved state, and the pages only read what it returns.
 *
 * The thermal model is illustrative seed logic, not a validated engineering or safety model.
 */

/** One model in the library: a chamber the lab can run. */
export interface Model {
  readonly id: string
  readonly name: string
  /** "Thermal enclosure · 2D". */
  readonly kind: string
}

/** The four boundary conditions of a run, as the setup sliders send them. */
export interface ParameterSet {
  /** Ambient temperature in °C, 5 to 35. */
  readonly ambient: number
  /** Heater output in %, 0 to 100. */
  readonly heater: number
  /** Airflow in %, 0 to 100. */
  readonly airflow: number
  /** Insulation factor in hundredths, 20 to 100 (0.20 to 1.00). */
  readonly insulation: number
}

/** One point of a probe trace: minutes since the start and the probe temperature. */
export interface TracePoint {
  readonly t: number
  readonly temp: number
}

/** What a run computed. */
export interface RunSummary {
  /** Peak temperature at probe A (centre), °C. */
  readonly peak: number
  /** Minutes until probe A stays within 2% of its final value. */
  readonly settle: number
  /** Energy input over the horizon, kWh (illustrative). */
  readonly energy: number
  /** Probes at the end of the horizon: A centre, B intake, C exhaust, °C. */
  readonly probes: { readonly a: number; readonly b: number; readonly c: number }
  /** How long the solver ran, seconds (deterministic in this demo). */
  readonly runtime: number
}

/** A completed run: its inputs, its summary and its probe A trace. */
export interface SimulationRun {
  readonly id: string
  readonly modelId: string
  /** The experiment's number in this lab: 16, 17, 18, ... */
  readonly number: number
  readonly name: string
  readonly createdAt: string
  readonly params: ParameterSet
  readonly summary: RunSummary
  readonly trace: readonly TracePoint[]
}

/** A named parameter set saved for later. */
export interface Snapshot {
  readonly id: string
  readonly modelId: string
  readonly name: string
  readonly createdAt: string
  readonly params: ParameterSet
}

/** A note beside the experiment (the inspector's Experiment notes). */
export interface Note {
  readonly title: string
  readonly text: string
}

export interface LabState {
  readonly version: 1
  readonly models: readonly Model[]
  readonly activeModelId: string
  /** The setup's current parameters; `dirty` until a run uses them. */
  readonly draft: ParameterSet
  readonly dirty: boolean
  readonly runs: readonly SimulationRun[]
  readonly snapshots: readonly Snapshot[]
  readonly notes: readonly Note[]
}

/** The horizon, the time step and the grid the demo solver uses. */
export const HORIZON_MIN = 20
export const STEP_MIN = 0.5
export const GRID = { cols: 24, rows: 12 } as const

export const BASELINE: ParameterSet = { ambient: 21, heater: 68, airflow: 42, insulation: 74 }

/** Each parameter's range, as the sliders and the checks use it. */
export const LIMITS: Readonly<Record<keyof ParameterSet, { readonly min: number; readonly max: number; readonly label: string }>> = {
  ambient: { min: 5, max: 35, label: 'Ambient temperature' },
  heater: { min: 0, max: 100, label: 'Heater output' },
  airflow: { min: 0, max: 100, label: 'Airflow' },
  insulation: { min: 20, max: 100, label: 'Insulation factor' },
}

/** A refusal the pages show to the person: `invalid` input or a `not-found` id. */
export class LabError extends Error {
  override readonly name = 'LabError'
  readonly code: 'invalid' | 'not-found'
  constructor(code: 'invalid' | 'not-found', message: string) {
    super(message)
    this.code = code
  }
}

const round = (value: number, digits: number): number => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** Parse and check a parameter set from form fields (strings). Every field is required and must be a whole number in range. */
export function parseParams(fields: Readonly<Record<string, string | undefined>>): ParameterSet {
  const out: Record<string, number> = {}
  for (const key of Object.keys(LIMITS) as (keyof ParameterSet)[]) {
    const { min, max, label } = LIMITS[key]
    const raw = fields[key]
    const value = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw)
    if (!Number.isInteger(value) || value < min || value > max)
      throw new LabError('invalid', `${label} must be a whole number from ${String(min)} to ${String(max)}.`)
    out[key] = value
  }
  return out as unknown as ParameterSet
}

/** The temperature rise the heater can hold at the centre, before airflow carries heat away. */
function rise(p: ParameterSet): number {
  return (p.heater / 100) * 97.9 * (p.insulation / 100) - (p.airflow / 100) * 13
}

/**
 * The demo model: probe A follows a first-order response towards `ambient + rise`, with a time constant that falls as airflow rises and grows with
 * insulation. Same inputs, same outputs, always.
 */
export function simulate(p: ParameterSet): { readonly summary: RunSummary; readonly trace: readonly TracePoint[] } {
  const target = p.ambient + Math.max(0, rise(p))
  const tau = Math.max(0.8, (18 - p.airflow / 9 + p.heater / 30) / 4.92)
  const trace: TracePoint[] = []
  for (let step = 0; step <= HORIZON_MIN / STEP_MIN; step += 1) {
    const t = step * STEP_MIN
    trace.push({ t, temp: round(p.ambient + (target - p.ambient) * (1 - Math.exp(-t / tau)), 2) })
  }
  const settleRaw = -tau * Math.log(0.02)
  const delta = target - p.ambient
  return {
    trace,
    summary: {
      peak: round(target, 1),
      settle: round(Math.min(HORIZON_MIN, settleRaw), 1),
      energy: round(p.heater / 50, 2),
      probes: { a: round(target, 1), b: round(p.ambient + delta * 0.17, 1), c: round(p.ambient + delta * 0.485, 1) },
      runtime: round(0.7 + (p.heater + p.airflow) / 100, 1),
    },
  }
}

/**
 * The thermal field at the end of the horizon on the {@link GRID}: the heater sits at the bottom centre, airflow pushes heat to the right and the
 * walls hold the ambient. Rows top to bottom, columns left to right, °C.
 */
export function thermalField(p: ParameterSet): number[][] {
  const { summary } = simulate(p)
  const delta = summary.peak - p.ambient
  const shift = (p.airflow / 100) * 0.35
  const spread = 0.25 + (p.insulation / 100) * 0.35
  const rows: number[][] = []
  for (let r = 0; r < GRID.rows; r += 1) {
    const row: number[] = []
    for (let c = 0; c < GRID.cols; c += 1) {
      const x = (c + 0.5) / GRID.cols - (0.5 + shift * 0.5)
      const y = (r + 0.5) / GRID.rows - 0.82
      const heat = Math.exp(-((x * x) / (spread * spread) + (y * y) / (spread * spread * 1.6)))
      row.push(round(p.ambient + delta * heat, 1))
    }
    rows.push(row)
  }
  return rows
}

/** The probe A traces as CSV, one column per run, rows by minute. */
export function tracesCsv(runs: readonly SimulationRun[]): string {
  const quote = (text: string): string => (/[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text)
  const header = ['minute', ...runs.map((run) => quote(`${run.name} · ${String(run.number)}`))].join(',')
  const length = Math.max(0, ...runs.map((run) => run.trace.length))
  const lines = [header]
  for (let i = 0; i < length; i += 1) {
    const t = runs.find((run) => run.trace[i] !== undefined)?.trace[i]?.t ?? i * STEP_MIN
    lines.push([String(t), ...runs.map((run) => (run.trace[i] === undefined ? '' : String(run.trace[i]?.temp)))].join(','))
  }
  return `${lines.join('\n')}\n`
}

/** Whether two parameter sets are the same. */
export const sameParams = (a: ParameterSet, b: ParameterSet): boolean =>
  a.ambient === b.ambient && a.heater === b.heater && a.airflow === b.airflow && a.insulation === b.insulation

/** A name the person typed: trimmed, 1 to 60 characters. */
export function checkName(raw: string | undefined, what: string): string {
  const name = (raw ?? '').trim()
  if (name === '') throw new LabError('invalid', `Give the ${what} a name.`)
  if (name.length > 60) throw new LabError('invalid', `A ${what} name is at most 60 characters.`)
  return name
}
