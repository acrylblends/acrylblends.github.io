/**
 * The content machine's screen: the projects on the left, the open project in the middle (its steps, the player and the timeline), and the Brand,
 * Library and Settings pages. Everything comes from the content API and stays live through its event stream, so what the agent does shows here.
 */
import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, events, type Brand, type FeatureInfo, type Job, type Project, type Status } from './api.ts'
import { ProjectView } from './project.tsx'
import { BrandPage, LibraryPage, SettingsPage } from './pages.tsx'
import { Icon } from './ui.tsx'
import './studio.css'

type Route = { page: 'project'; id: string } | { page: 'home' } | { page: 'brand' } | { page: 'library' } | { page: 'settings' }

const readRoute = (): Route => {
  const hash = location.hash.replace(/^#\/?/, '')
  const [page, id] = hash.split('/')
  if (page === 'p' && id) return { page: 'project', id }
  if (page === 'brand' || page === 'library' || page === 'settings') return { page }
  return { page: 'home' }
}

export interface Shared {
  readonly features: FeatureInfo[]
  readonly status: Status | undefined
  readonly brand: Brand | undefined
  readonly jobs: Map<string, Job>
  refreshStatus(): void
}

function Studio() {
  const [route, setRoute] = useState<Route>(readRoute)
  const [projects, setProjects] = useState<Project[]>([])
  const [features, setFeatures] = useState<FeatureInfo[]>([])
  const [status, setStatus] = useState<Status>()
  const [brand, setBrand] = useState<Brand>()
  const [jobs, setJobs] = useState(() => new Map<string, Job>())
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const refreshStatus = useCallback(() => { api.status().then(setStatus).catch(() => {}) }, [])
  useEffect(() => {
    api.projects().then(setProjects).catch((e: Error) => setError(e.message))
    api.features().then(setFeatures).catch(() => {})
    api.brand().then(setBrand).catch(() => {})
    refreshStatus()
    const onHash = () => setRoute(readRoute())
    addEventListener('hashchange', onHash)
    const off = events((event) => {
      if (event.type === 'project') setProjects((list) => [event.project, ...list.filter((p) => p.id !== event.project.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
      if (event.type === 'deleted') setProjects((list) => list.filter((p) => p.id !== event.id))
      if (event.type === 'job') setJobs((map) => new Map(map).set(event.job.projectId, event.job))
      if (event.type === 'brand') setBrand(event.brand)
      if (event.type === 'features') api.features().then(setFeatures).catch(() => {})
    })
    return () => { removeEventListener('hashchange', onHash); off() }
  }, [refreshStatus])

  const create = async () => {
    setCreating(true)
    try {
      const project = await api.create(`Video ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`)
      location.hash = `#/p/${project.id}`
    } catch (e) { setError((e as Error).message) } finally { setCreating(false) }
  }

  const shared: Shared = useMemo(() => ({ features, status, brand, jobs, refreshStatus }), [features, status, brand, jobs, refreshStatus])
  const open = route.page === 'project' ? projects.find((p) => p.id === route.id) : undefined

  return (
    <div className="cm">
      <aside className="cm-rail">
        <div className="cm-brandmark"><span className="cm-logo"><Icon name="film" /></span><div><b>Content Machine</b><small>one recording in, a month of posts out</small></div></div>
        <button className="cm-btn primary wide" onClick={create} disabled={creating}><Icon name="plus" /> New video</button>
        <nav className="cm-projects" aria-label="Videos">
          {projects.length === 0 && <p className="cm-muted small">No videos yet.</p>}
          {projects.map((p) => {
            const job = jobs.get(p.id)
            return (
              <a key={p.id} href={`#/p/${p.id}`} className={route.page === 'project' && route.id === p.id ? 'on' : ''}>
                <span className="name">{p.name}</span>
                <span className="meta">{job?.status === 'running' ? <span className="cm-pill run">{job.title}</span> : <Stage project={p} />}</span>
              </a>
            )
          })}
        </nav>
        <nav className="cm-pages" aria-label="App">
          <a href="#/brand" className={route.page === 'brand' ? 'on' : ''}><Icon name="tag" /> Brand</a>
          <a href="#/library" className={route.page === 'library' ? 'on' : ''}><Icon name="music" /> Library</a>
          <a href="#/settings" className={route.page === 'settings' ? 'on' : ''}><Icon name="gear" /> Settings {status && (!status.tools.ffmpeg || !status.writer.configured) ? <span className="cm-dot warn" /> : null}</a>
        </nav>
      </aside>
      <main className="cm-main">
        {error && <div className="cm-banner err" role="alert">{error}<button className="cm-btn ghost small" onClick={() => setError('')}>Close</button></div>}
        {route.page === 'project' && open && <ProjectView key={open.id} project={open} shared={shared} />}
        {route.page === 'project' && !open && projects.length > 0 && <div className="cm-empty"><p>This video is not here any more.</p><a href="#/">Back</a></div>}
        {route.page === 'home' && <Home projects={projects} onCreate={create} creating={creating} status={status} />}
        {route.page === 'brand' && brand && <BrandPage brand={brand} />}
        {route.page === 'library' && <LibraryPage />}
        {route.page === 'settings' && <SettingsPage status={status} onSaved={refreshStatus} />}
      </main>
    </div>
  )
}

function Stage({ project }: { project: Project }) {
  if (project.posts) return <span className="cm-pill ok">posts ready</span>
  if (project.outputs.final) return <span className="cm-pill ok">finished</span>
  if (project.outputs.cut) return <span className="cm-pill">cut</span>
  if (project.transcript) return <span className="cm-pill">transcript</span>
  if (project.source) return <span className="cm-pill">video in</span>
  return <span className="cm-pill off">empty</span>
}

function Home({ projects, onCreate, creating, status }: { projects: Project[]; onCreate: () => void; creating: boolean; status: Status | undefined }) {
  return (
    <div className="cm-home">
      <h1>Turn one rough recording into everything you post</h1>
      <p className="cm-lead">Bring a phone video, a podcast or a YouTube link. The machine cuts the bad takes and the "ums", makes it sound like a studio, adds captions, music and a title, and writes the posts, the thumbnail and the shorts. You keep the final say on every cut.</p>
      <div className="cm-steps-intro">
        {[
          ['upload', 'Bring the video', 'a file, a link or YouTube'],
          ['text', 'Transcript and cut', 'fillers, retakes and pauses found for you'],
          ['wave', 'Sound', 'podcast-grade from a phone'],
          ['sparkle', 'Captions and visuals', 'captions, title, music, b-roll'],
          ['phone', 'Shorts and thumbnail', 'vertical clips of the best moments'],
          ['send', 'Posts', 'YouTube, LinkedIn, Instagram, X'],
        ].map(([icon, title, sub], i) => (
          <div key={title} className="cm-card"><span className="n">{i + 1}</span><Icon name={icon!} /><b>{title}</b><small>{sub}</small></div>
        ))}
      </div>
      <div className="cm-row"><button className="cm-btn primary" onClick={onCreate} disabled={creating}><Icon name="plus" /> New video</button>{projects[0] && <a className="cm-btn" href={`#/p/${projects[0].id}`}>Open {projects[0].name}</a>}</div>
      {status && !status.tools.ffmpeg && <div className="cm-banner warn">ffmpeg is not installed: the machine needs it to cut and render. Install it (brew install ffmpeg, winget install ffmpeg, or apt install ffmpeg) and reload.</div>}
    </div>
  )
}

createRoot(document.getElementById('content-studio')!).render(<Studio />)
