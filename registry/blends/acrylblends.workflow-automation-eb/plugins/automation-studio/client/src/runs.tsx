/** Runs: the list (live), one run's steps with their input, output and error, and the small pieces the editor shares (status badge, times). */
import { useEffect, useState } from 'react'
import { api, events, type RunSummary, type RunView, type StepRecord } from './api'

export function when(iso: string | undefined): string {
  if (iso === undefined) return '-'
  const date = new Date(iso)
  const today = new Date().toDateString() === date.toDateString()
  return today ? date.toLocaleTimeString() : date.toLocaleString()
}

export function StatusBadge({ status }: { status: string }) {
  return <span className="wa-badge" data-status={status}>{status}</span>
}

const json = (value: unknown): string => {
  const text = JSON.stringify(value, null, 2) ?? String(value)
  return text.length > 20_000 ? `${text.slice(0, 20_000)}\n... (${text.length} characters in all)` : text
}

export function RunSteps({ records, title }: { records: readonly StepRecord[], title?: string }) {
  return (
    <div className="wa-steps" aria-label={title ?? 'Steps of the run'}>
      {title === undefined ? null : <h4>{title}</h4>}
      {records.map((record) => (
        <details key={record.path} className="wa-step" data-status={record.status} open={record.status === 'failed'}>
          <summary>
            <span className="wa-dot" data-status={record.status} />
            <b>{record.displayName}</b>
            <span className="wa-meta">{record.path} · {record.status}{record.durationMs === undefined ? '' : ` · ${record.durationMs} ms`}{(record.attempts ?? 1) > 1 ? ` · ${record.attempts} attempts` : ''}</span>
          </summary>
          {record.error === undefined ? null : <p className="wa-note" data-error="">{record.error}</p>}
          {record.input === undefined ? null : <><span className="wa-label">Input</span><pre className="wa-pre">{json(record.input)}</pre></>}
          {record.output === undefined ? null : <><span className="wa-label">Output</span><pre className="wa-pre">{json(record.output)}</pre></>}
        </details>
      ))}
    </div>
  )
}

export function RunsPage({ navigate }: { navigate: (path: string) => void }) {
  const [runs, setRuns] = useState<RunSummary[] | undefined>(undefined)
  useEffect(() => {
    const load = (): void => { void api.runs().then((r) => { setRuns(r.runs) }, () => undefined) }
    load()
    return events(() => undefined, () => { load() })
  }, [])
  return (
    <section className="wa-page" aria-label="Runs">
      <header className="wa-page-head"><h1>Runs</h1><p className="wa-hint">Every run of every workflow: tests, manual starts, schedules and webhooks. The last 300 are kept.</p></header>
      {runs === undefined ? <p className="wa-hint">Loading...</p> : runs.length === 0 ? <p className="wa-empty">No runs yet. Open a workflow and press Test.</p> : (
        <table className="wa-table">
          <thead><tr><th>Workflow</th><th>Status</th><th>Started by</th><th>Started</th><th>Took</th><th /></tr></thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td><button type="button" className="wa-link" onClick={() => { navigate(`/workflows/${run.workflowId}`) }}>{run.workflowName}</button></td>
                <td><StatusBadge status={run.status} />{run.error === undefined ? null : <span className="wa-meta"> {run.error.step}</span>}</td>
                <td>{run.trigger}{run.version === 'draft' ? ' (draft)' : ''}</td>
                <td>{when(run.startedAt)}</td>
                <td>{run.finishedAt === undefined ? '-' : `${((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000).toFixed(1)} s`}</td>
                <td><button type="button" className="wa-btn" data-small="" onClick={() => { navigate(`/runs/${run.id}`) }}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export function RunPage({ id, navigate }: { id: string, navigate: (path: string) => void }) {
  const [run, setRun] = useState<RunView | undefined>(undefined)
  const [problem, setProblem] = useState<string | undefined>(undefined)
  useEffect(() => {
    const load = (): void => { void api.run(id).then(setRun, (cause: unknown) => { setProblem(cause instanceof Error ? cause.message : String(cause)) }) }
    load()
    return events(() => undefined, (summary) => { if (summary.id === id) load() })
  }, [id])
  if (run === undefined) return <section className="wa-page"><p className="wa-hint">{problem ?? 'Loading...'}</p></section>
  return (
    <section className="wa-page" aria-label={`Run ${run.id}`}>
      <header className="wa-page-head">
        <button type="button" className="wa-btn" data-ghost="" onClick={() => { navigate('/runs') }}>‹ Runs</button>
        <h1>{run.workflowName}</h1>
        <p className="wa-meta"><StatusBadge status={run.status} /> {run.trigger}{run.version === 'draft' ? ' (draft)' : ''} · started {when(run.startedAt)}{run.finishedAt === undefined ? '' : ` · ended ${when(run.finishedAt)}`}{run.waiting === undefined ? '' : ` · resumes ${when(run.waiting.resumeAt)}`}</p>
        <div className="wa-row">
          <button type="button" className="wa-btn" onClick={() => { navigate(`/workflows/${run.workflowId}`) }}>Open the workflow</button>
          <button type="button" className="wa-btn" onClick={() => { void api.retry(run.id).then((next) => { navigate(`/runs/${next.id}`) }, (cause: unknown) => { setProblem(String(cause)) }) }}>Run again with the same data</button>
          {run.status === 'running' || run.status === 'waiting' ? <button type="button" className="wa-btn" data-danger="" onClick={() => { void api.cancel(run.id).then(setRun) }}>Stop</button> : null}
        </div>
      </header>
      {problem === undefined ? null : <p className="wa-note" data-error="">{problem}</p>}
      {run.error === undefined ? null : <p className="wa-note" data-error="">Failed at {run.error.step}: {run.error.message}</p>}
      <RunSteps records={Object.values(run.steps)} />
    </section>
  )
}
