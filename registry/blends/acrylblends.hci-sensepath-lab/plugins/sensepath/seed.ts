/** The lab a person sees on the first start: every modality at the default calibration, and two earlier runs saved as observations (speech and gesture). */
import { type LabState, type ModalityId, type Observation, type Run, MODALITIES, defaultSettings, runEvents, runSummary, simulate } from './domain.ts'

export function seed(now: Date): LabState {
  const at = (days: number, hm: string): string => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)
    const [h = 0, m = 0] = hm.split(':').map(Number)
    d.setHours(h, m, 0, 0)
    return d.toISOString()
  }
  const settings = Object.fromEntries(MODALITIES.map((m) => [m.id, defaultSettings()])) as Record<ModalityId, ReturnType<typeof defaultSettings>>
  const runFor = (id: ModalityId, runId: string, when: string): Run => {
    const m = MODALITIES.find((x) => x.id === id)
    if (m === undefined) throw new Error(`no modality ${id}`)
    const r = simulate(m, settings[id])
    return { id: runId, modality: id, settings: settings[id], completion: r.completion, latency: r.latency, outcome: r.outcome, summary: m.observed, events: runEvents(r.latency, r.outcome), at: when }
  }
  const runs = [runFor('gesture', 'run-s2', at(1, '15:20')), runFor('speech', 'run-s1', at(0, '09:40'))]
  const observations: Observation[] = runs.map((r, i) => ({ id: `obs-s${String(i + 1)}`, modality: r.modality, runId: r.id, note: r.summary, settings: r.settings, completion: r.completion, latency: r.latency, at: r.at }))
  return { version: 1, settings, runs, observations }
}
