/**
 * The lab a person sees on the first start: three models, three completed runs of Chamber 04 (16, 17, 18) and one snapshot, timed relative to
 * now so "Today" and "Yesterday" stay true.
 */
import { BASELINE, type LabState, type ParameterSet, type SimulationRun, simulate } from './domain.ts'

const at = (now: Date, daysAgo: number, hours: number, minutes: number): string => {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hours, minutes)
  return day.toISOString()
}

function run(id: string, number: number, name: string, createdAt: string, params: ParameterSet): SimulationRun {
  return { id, modelId: 'model-chamber-04', number, name, createdAt, params, ...simulate(params) }
}

export function seed(now: Date): LabState {
  return {
    version: 1,
    models: [
      { id: 'model-chamber-04', name: 'Chamber 04', kind: 'Thermal enclosure · 2D' },
      { id: 'model-battery-bay', name: 'Battery bay', kind: 'Thermal enclosure · 2D' },
      { id: 'model-drying-tunnel', name: 'Drying tunnel', kind: 'Airflow chamber · 2D' },
    ],
    activeModelId: 'model-chamber-04',
    draft: BASELINE,
    dirty: false,
    runs: [
      run('run-16', 16, 'Low ambient', at(now, 3, 15, 10), { ...BASELINE, ambient: 18 }),
      run('run-17', 17, 'High airflow', at(now, 1, 16, 5), { ...BASELINE, airflow: 90 }),
      run('run-18', 18, 'Baseline', at(now, 0, 10, 42), BASELINE),
    ],
    snapshots: [
      {
        id: 'snapshot-tight-insulation',
        modelId: 'model-chamber-04',
        name: 'Tight insulation',
        createdAt: at(now, 2, 11, 20),
        params: { ...BASELINE, insulation: 92 },
      },
    ],
    notes: [
      { title: 'Baseline chamber response', text: 'Compare against high-airflow run before changing insulation.' },
      { title: 'Model provenance', text: 'Fixture model / illustrative coefficient set / v0.8' },
    ],
  }
}
