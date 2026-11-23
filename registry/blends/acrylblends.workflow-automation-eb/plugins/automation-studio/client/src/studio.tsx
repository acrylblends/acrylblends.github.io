/**
 * Workflow Automation's screen: the sidebar (Workflows, Runs, Connections, Integrations) and the page for the address, with real paths
 * (`/workflows/<id>`, `/runs/<id>`) so a link, a reload and an agent's `act navigate` land on the same page. The server answers each of these paths
 * with this page.
 */
import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './studio.css'
import { api, type ApprovalView, base, type ConnectionView, events, type IntegrationView, type WorkflowView } from './api'
import { Editor } from './editor'
import { RunPage, RunsPage, StatusBadge, when } from './runs'

type Route = { page: 'workflows' } | { page: 'editor', id: string } | { page: 'runs' } | { page: 'run', id: string } | { page: 'connections' } | { page: 'integrations' }

function routeOf(pathname: string): Route {
  const path = pathname.slice(base().length) || '/'
  const editor = /^\/workflows\/([\w-]+)$/u.exec(path)
  if (editor !== null) return { page: 'editor', id: editor[1]! }
  const run = /^\/runs\/([\w-]+)$/u.exec(path)
  if (run !== null) return { page: 'run', id: run[1]! }
  if (path === '/runs') return { page: 'runs' }
  if (path === '/connections') return { page: 'connections' }
  if (path === '/integrations') return { page: 'integrations' }
  return { page: 'workflows' }
}

function Studio() {
  const [route, setRoute] = useState<Route>(() => routeOf(location.pathname))
  const [catalog, setCatalog] = useState<IntegrationView[]>([])
  const navigate = useCallback((path: string) => {
    history.pushState(null, '', `${base()}${path}`)
    setRoute(routeOf(location.pathname))
  }, [])
  useEffect(() => {
    const back = (): void => { setRoute(routeOf(location.pathname)) }
    addEventListener('popstate', back)
    void api.catalog().then((c) => { setCatalog(c.integrations) }, () => undefined)
    return () => { removeEventListener('popstate', back) }
  }, [])
  const nav = (page: Route['page'], path: string, label: string, glyph: string) => (
    <a href={`${base()}${path}`} className="wa-nav" aria-current={route.page === page || (page === 'workflows' && route.page === 'editor') || (page === 'runs' && route.page === 'run') ? 'page' : undefined} onClick={(e) => { e.preventDefault(); navigate(path) }}>
      <span aria-hidden="true">{glyph}</span>{label}
    </a>
  )
  return (
    <div className="wa-app" data-page={route.page}>
      <nav className="wa-sidebar" aria-label="Workflow Automation">
        <div className="wa-brand"><span className="wa-logo" aria-hidden="true">⚙</span><b>Workflow Automation</b></div>
        {nav('workflows', '/workflows', 'Workflows', '⇉')}
        {nav('runs', '/runs', 'Runs', '▤')}
        {nav('connections', '/connections', 'Connections', '🔑')}
        {nav('integrations', '/integrations', 'Integrations', '⧉')}
        <p className="wa-sidebar-foot">Ask the agent on the right: "make a workflow that ..." - it builds it here, in front of you.</p>
      </nav>
      <main className="wa-main">
        <Approvals navigate={navigate} />
        {route.page === 'editor' ? <Editor key={route.id} id={route.id} catalog={catalog} navigate={navigate} />
          : route.page === 'runs' ? <RunsPage navigate={navigate} />
            : route.page === 'run' ? <RunPage key={route.id} id={route.id} navigate={navigate} />
              : route.page === 'connections' ? <ConnectionsPage catalog={catalog} />
                : route.page === 'integrations' ? <IntegrationsPage catalog={catalog} />
                  : <WorkflowsPage navigate={navigate} />}
      </main>
    </div>
  )
}

/** What the agent asks the person to allow (publish, activate, a test that reaches outside the app): shown on every page until answered. */
function Approvals({ navigate }: { navigate: (path: string) => void }) {
  const [approvals, setApprovals] = useState<ApprovalView[]>([])
  const load = useCallback(() => { void api.approvals().then((a) => { setApprovals(a.approvals.filter((x) => x.status === 'pending')) }, () => undefined) }, [])
  useEffect(() => { load(); return events(() => undefined, () => undefined, load) }, [load])
  if (approvals.length === 0) return null
  const verb = { publish: 'publish', activate: 'activate', test: 'run a test of' } as const
  return (
    <div className="wa-approvals">
      {approvals.map((a) => (
        <section key={a.id} className="wa-confirm wa-approval" role="alertdialog" aria-label={`The agent asks to ${verb[a.action]} ${a.workflowName}`}>
          <div>
            <b>The agent asks to {verb[a.action]} <button type="button" className="wa-link" onClick={() => { navigate(`/workflows/${a.workflowId}`) }}>{a.workflowName}</button></b>
            <pre className="wa-pre">{a.summary}</pre>
          </div>
          <div className="wa-row">
            <button type="button" className="wa-btn" data-primary="" onClick={() => { void api.approve(a.id).then(load) }}>Approve</button>
            <button type="button" className="wa-btn" onClick={() => { void api.decline(a.id).then(load) }}>Decline</button>
          </div>
        </section>
      ))}
    </div>
  )
}

function WorkflowsPage({ navigate }: { navigate: (path: string) => void }) {
  const [workflows, setWorkflows] = useState<WorkflowView[] | undefined>(undefined)
  const [name, setName] = useState('')
  const [problem, setProblem] = useState<string | undefined>(undefined)
  const [deleting, setDeleting] = useState<string | undefined>(undefined)
  const load = useCallback(() => { void api.workflows().then((w) => { setWorkflows(w.workflows) }, (cause: unknown) => { setProblem(String(cause)) }) }, [])
  useEffect(() => { load(); return events(() => { load() }, () => undefined) }, [load])
  const create = async (): Promise<void> => {
    try { const workflow = await api.create(name.trim() === '' ? 'New workflow' : name); navigate(`/workflows/${workflow.id}`) } catch (cause) { setProblem(cause instanceof Error ? cause.message : String(cause)) }
  }
  return (
    <section className="wa-page" aria-label="Workflows">
      <header className="wa-page-head">
        <h1>Workflows</h1>
        <p className="wa-hint">Automations that run on a schedule, on a webhook or when you start them. Build one here, or ask the agent to build it.</p>
        <form className="wa-row" onSubmit={(e) => { e.preventDefault(); void create() }}>
          <input className="wa-input" aria-label="New workflow name" placeholder="Name of a new workflow" value={name} onChange={(e) => { setName(e.target.value) }} />
          <button type="submit" className="wa-btn" data-primary="">+ New workflow</button>
          <label className="wa-btn" data-ghost="">Import<input type="file" accept="application/json,.json" hidden onChange={(e) => {
            const file = e.target.files?.[0]
            if (file === undefined) return
            void file.text().then((text) => api.importFile(JSON.parse(text))).then((answer) => { navigate(`/workflows/${answer.workflow.id}`) }, (cause: unknown) => { setProblem(cause instanceof Error ? cause.message : String(cause)) })
          }} /></label>
        </form>
      </header>
      {problem === undefined ? null : <p className="wa-note" data-error="" role="alert">{problem}</p>}
      {workflows === undefined ? <p className="wa-hint">Loading...</p> : workflows.length === 0 ? (
        <div className="wa-empty">
          <p><b>No workflows yet.</b></p>
          <p>Name one above and press <b>+ New workflow</b>, or ask the agent, for example: "every morning at 8, fetch the weather for Vienna and save the summary".</p>
        </div>
      ) : (
        <table className="wa-table">
          <thead><tr><th>Name</th><th>Status</th><th>Trigger</th><th>Version</th><th>Changed</th><th /></tr></thead>
          <tbody>
            {workflows.map((w) => (
              <tr key={w.id}>
                <td><button type="button" className="wa-link" onClick={() => { navigate(`/workflows/${w.id}`) }}><b>{w.name}</b></button>{w.validation.valid ? null : <span className="wa-meta"> · {w.validation.problems.length} to fix</span>}</td>
                <td><StatusBadge status={w.status} /></td>
                <td>{w.draft.trigger.displayName}</td>
                <td>{w.versionNumber === 0 ? 'draft' : `v${w.versionNumber}${w.changedSincePublish ? ' + draft' : ''}`}</td>
                <td>{when(w.updatedAt)}</td>
                <td className="wa-actions">
                  <button type="button" className="wa-btn" data-small="" onClick={() => { navigate(`/workflows/${w.id}`) }}>Open</button>
                  <button type="button" className="wa-btn" data-small="" onClick={() => { void api.duplicate(w.id).then(load) }}>Duplicate</button>
                  {deleting === w.id
                    ? <><button type="button" className="wa-btn" data-small="" data-danger="" onClick={() => { void api.remove(w.id).then(load, (cause: unknown) => { setProblem(cause instanceof Error ? cause.message : String(cause)) }); setDeleting(undefined) }}>Delete {w.name}</button><button type="button" className="wa-btn" data-small="" onClick={() => { setDeleting(undefined) }}>Keep</button></>
                    : <button type="button" className="wa-btn" data-small="" onClick={() => { setDeleting(w.id) }}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function ConnectionsPage({ catalog }: { catalog: readonly IntegrationView[] }) {
  const [connections, setConnections] = useState<ConnectionView[]>([])
  const [form, setForm] = useState({ name: '', integration: '', value: '' })
  const [problem, setProblem] = useState<string | undefined>(undefined)
  const load = useCallback(() => { void api.connections().then((c) => { setConnections(c.connections) }, () => undefined) }, [])
  useEffect(load, [load])
  return (
    <section className="wa-page" aria-label="Connections">
      <header className="wa-page-head">
        <h1>Connections</h1>
        <p className="wa-hint">API keys and tokens your steps use, kept encrypted in this app's data folder. A step refers to a connection by name; its value is never shown again, sent to the agent, or exported.</p>
      </header>
      <form className="wa-box" aria-label="Add a connection" onSubmit={(e) => {
        e.preventDefault()
        let value: unknown = form.value
        try { if (form.value.trim().startsWith('{')) value = JSON.parse(form.value) } catch { /* kept as text */ }
        void api.saveConnection({ name: form.name, integration: form.integration, value }).then(() => { setForm({ name: '', integration: form.integration, value: '' }); setProblem(undefined); load() }, (cause: unknown) => { setProblem(cause instanceof Error ? cause.message : String(cause)) })
      }}>
        <div className="wa-grid">
          <label className="wa-field">Name<input className="wa-input" required value={form.name} placeholder="github" onChange={(e) => { setForm({ ...form, name: e.target.value }) }} /></label>
          <label className="wa-field">For<select className="wa-input" required value={form.integration} onChange={(e) => { setForm({ ...form, integration: e.target.value }) }}><option value="">Choose an integration...</option>{catalog.map((i) => <option key={i.name} value={i.name}>{i.displayName}</option>)}</select></label>
        </div>
        <label className="wa-field">Secret (a key or token; JSON for several values)<input className="wa-input" type="password" required autoComplete="off" value={form.value} onChange={(e) => { setForm({ ...form, value: e.target.value }) }} /></label>
        <button type="submit" className="wa-btn" data-primary="">Save connection</button>
        {problem === undefined ? null : <p className="wa-note" data-error="">{problem}</p>}
      </form>
      {connections.length === 0 ? <p className="wa-empty">No connections yet.</p> : (
        <table className="wa-table">
          <thead><tr><th>Name</th><th>For</th><th>Value</th><th>Added</th><th /></tr></thead>
          <tbody>{connections.map((c) => (
            <tr key={c.id}><td><b>{c.name}</b></td><td>{catalog.find((i) => i.name === c.integration)?.displayName ?? c.integration}</td><td><code>{c.masked}</code></td><td>{when(c.createdAt)}</td>
              <td><button type="button" className="wa-btn" data-small="" data-danger="" onClick={() => { void api.removeConnection(c.name).then(load) }}>Remove</button></td></tr>
          ))}</tbody>
        </table>
      )}
    </section>
  )
}

function IntegrationsPage({ catalog }: { catalog: readonly IntegrationView[] }) {
  return (
    <section className="wa-page" aria-label="Integrations">
      <header className="wa-page-head">
        <h1>Integrations</h1>
        <p className="wa-hint">What steps can do. Each is a Qadam Flow integration package (MIT) loaded as it is; more are added with <code>npm install @aiqadam/qadam-&lt;name&gt;</code> and one line in <code>plugins/automation/catalog.ts</code>.</p>
      </header>
      <div className="wa-cards">
        {catalog.map((i) => (
          <article key={i.name} className="wa-card" aria-label={i.displayName}>
            <h3>{i.displayName} <span className="wa-meta">{i.version}</span></h3>
            <p className="wa-hint">{i.description}</p>
            {i.triggers.length === 0 ? null : <p><span className="wa-label">Triggers</span> {i.triggers.map((t) => t.displayName).join(', ')}</p>}
            {i.actions.length === 0 ? null : <p><span className="wa-label">Actions</span> {i.actions.map((a) => a.displayName).join(', ')}</p>}
          </article>
        ))}
      </div>
    </section>
  )
}

const root = document.getElementById('automation-studio')
if (root !== null) createRoot(root).render(<Studio />)
