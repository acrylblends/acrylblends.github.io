/** One project: its name and exports on top, the six steps, the step's controls on the left, the player and the timeline on the right. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, clock, type Project } from './api.ts'
import type { Shared } from './studio.tsx'
import { BringStep, CutStep, PostsStep, ShortsStep, SoundStep, VisualsStep } from './steps.tsx'
import { Icon, JobBar } from './ui.tsx'

export interface StepProps {
  readonly project: Project
  readonly shared: Shared
  readonly busy: boolean
  run(feature: string, action: string, input?: Record<string, unknown>): Promise<void>
  save(change: Record<string, unknown>): Promise<void>
  seek(t: number): void
  has(feature: string): boolean
}

const STEPS = [
  { key: 'bring', title: 'Bring the video', icon: 'upload', features: ['ingest'] },
  { key: 'cut', title: 'Transcript and cut', icon: 'scissors', features: ['transcribe', 'cut'] },
  { key: 'sound', title: 'Sound', icon: 'wave', features: ['sound'] },
  { key: 'visuals', title: 'Captions, music, visuals', icon: 'sparkle', features: ['visuals', 'music'] },
  { key: 'shorts', title: 'Shorts and thumbnail', icon: 'phone', features: ['shorts', 'thumbnail'] },
  { key: 'posts', title: 'Posts', icon: 'send', features: ['posts'] },
] as const

type View = 'final' | 'cut' | 'source'

/** The step to open: the first one with something left to do. */
function nextStep(project: Project): string {
  if (!project.source) return 'bring'
  if (!project.outputs.cut) return 'cut'
  if (!project.outputs.final) return 'visuals'
  if (project.shorts.length === 0) return 'shorts'
  return 'posts'
}

export function ProjectView({ project, shared }: { project: Project; shared: Shared }) {
  const [step, setStep] = useState(() => nextStep(project))
  const [error, setError] = useState('')
  const [name, setName] = useState(project.name)
  const [view, setView] = useState<View>()
  const video = useRef<HTMLVideoElement>(null)
  const job = shared.jobs.get(project.id)
  const busy = job?.status === 'running'
  const has = (feature: string) => shared.features.some((f) => f.id === feature)
  const steps = STEPS.filter((s) => s.features.some(has))

  useEffect(() => setName(project.name), [project.name])
  const available: View[] = [...(project.outputs.final ? ['final' as const] : []), ...(project.outputs.cut ? ['cut' as const] : []), ...(project.source ? ['source' as const] : [])]
  const shown: View | undefined = view && available.includes(view) ? view : available[0]
  const file = shown === 'final' ? project.outputs.final : shown === 'cut' ? project.outputs.cut : undefined
  const src = shown === undefined ? undefined : api.file(project.id, file?.file ?? project.source!.file, file?.at ?? project.updatedAt.slice(0, 10))

  const props: StepProps = {
    project, shared, busy,
    has,
    async run(feature, action, input = {}) {
      setError('')
      try { await api.run(project.id, feature, action, input) } catch (e) { setError((e as Error).message) }
    },
    async save(change) {
      setError('')
      try { await api.settings(project.id, change) } catch (e) { setError((e as Error).message) }
    },
    seek(t) {
      setView('source')
      requestAnimationFrame(() => { if (video.current) { video.current.currentTime = t; void video.current.play().catch(() => {}) } })
    },
  }

  const saveName = () => { if (name.trim() !== '' && name !== project.name) void props.save({ name }) }
  const exports = [
    project.outputs.final && { label: 'Finished video', file: project.outputs.final.file },
    project.outputs.cut && { label: 'Cut (no captions)', file: project.outputs.cut.file },
    project.outputs.captions && { label: 'Captions (SRT)', file: project.outputs.captions.file },
    project.outputs.thumbnail && { label: 'Thumbnail', file: project.outputs.thumbnail.file },
    project.posts && { label: 'Posts (Markdown)', file: 'posts.md' },
    ...project.shorts.filter((s) => s.output).map((s) => ({ label: `Short: ${s.title}`, file: s.output!.file })),
  ].filter((x): x is { label: string; file: string } => Boolean(x))

  return (
    <div className="cm-project">
      <header className="cm-head">
        <input className="cm-title" value={name} aria-label="Video name" onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
        <Summary project={project} />
        <span className="cm-grow" />
        <ExportMenu project={project} items={exports} />
      </header>
      <nav className="cm-steps" role="tablist" aria-label="Steps">
        {steps.map((s, i) => (
          <button key={s.key} role="tab" aria-selected={step === s.key} onClick={() => setStep(s.key)}>
            <span className="n">{i + 1}</span><Icon name={s.icon} /><span className="t">{s.title}</span><Done project={project} step={s.key} />
          </button>
        ))}
      </nav>
      {error && <div className="cm-banner err" role="alert">{error}<button className="cm-btn ghost small" onClick={() => setError('')}>Close</button></div>}
      <JobBar job={job} />
      <div className="cm-work">
        <section className="cm-panel" aria-label="Step">
          {step === 'bring' && <BringStep {...props} />}
          {step === 'cut' && <CutStep {...props} />}
          {step === 'sound' && <SoundStep {...props} />}
          {step === 'visuals' && <VisualsStep {...props} />}
          {step === 'shorts' && <ShortsStep {...props} />}
          {step === 'posts' && <PostsStep {...props} />}
        </section>
        <section className="cm-stage" aria-label="Preview">
          {src ? (
            <>
              <div className="cm-views" role="group" aria-label="Which video">
                {available.map((v) => <button key={v} aria-pressed={shown === v} onClick={() => setView(v)}>{v === 'final' ? 'Finished' : v === 'cut' ? 'Cut' : 'Original'}</button>)}
                <span className="cm-muted small">{clock(file?.duration ?? project.source?.duration)}</span>
              </div>
              <video ref={video} className="cm-video" src={src} controls preload="metadata" />
              {project.source && <Timeline project={project} onSeek={props.seek} />}
            </>
          ) : (
            <div className="cm-stage-empty"><Icon name="film" /><p>The video shows here once it is in.</p></div>
          )}
        </section>
      </div>
    </div>
  )
}

function Summary({ project }: { project: Project }) {
  const source = project.source
  if (!source) return <span className="cm-muted">No video yet</span>
  const cuts = project.removals.filter((r) => !r.kept)
  const removed = cuts.reduce((sum, r) => sum + (r.end - r.start), 0)
  return (
    <span className="cm-summary">
      {clock(source.duration)}
      {cuts.length > 0 && <> <span className="arrow">→</span> <b>{clock(Math.max(0, source.duration - removed))}</b> <span className="cm-muted">· {cuts.length} cuts</span></>}
    </span>
  )
}

function Done({ project, step }: { project: Project; step: string }) {
  const done =
    step === 'bring' ? !!project.source :
    step === 'cut' ? !!project.outputs.cut :
    step === 'sound' ? !!project.outputs.cut :
    step === 'visuals' ? !!project.outputs.final :
    step === 'shorts' ? project.shorts.some((s) => s.output) :
    !!project.posts
  return done ? <span className="done" aria-label="done"><Icon name="check" /></span> : null
}

function ExportMenu({ project, items }: { project: Project; items: { label: string; file: string }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="cm-menu-wrap">
      <button className="cm-btn primary" disabled={items.length === 0} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="download" /> Export</button>
      {open && (
        <div className="cm-menu" role="menu" onMouseLeave={() => setOpen(false)}>
          {items.map((item) => <a key={item.file} role="menuitem" href={api.download(project.id, item.file)}>{item.label}<small>{item.file}</small></a>)}
        </div>
      )}
    </div>
  )
}

const REASON_COLOR: Record<string, string> = { silence: 'var(--cm-pause)', filler: 'var(--cm-filler)', retake: 'var(--cm-retake)', manual: 'var(--cm-manual)' }

function Timeline({ project, onSeek }: { project: Project; onSeek: (t: number) => void }) {
  const [peaks, setPeaks] = useState<number[]>([])
  const duration = project.source!.duration
  useEffect(() => {
    fetch(api.file(project.id, 'peaks.json', project.source!.originalName)).then((r) => (r.ok ? r.json() : [])).then((p: number[]) => setPeaks(p)).catch(() => setPeaks([]))
  }, [project.id, project.source])
  const path = useMemo(() => {
    if (peaks.length === 0) return ''
    const step = 1000 / peaks.length
    return peaks.map((p, i) => `M${(i * step).toFixed(2)} ${(50 - p * 46).toFixed(1)}V${(50 + p * 46).toFixed(1)}`).join('')
  }, [peaks])
  return (
    <div className="cm-timeline">
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label="The recording's sound, with the stretches the cut removes"
        onClick={(e) => { const box = e.currentTarget.getBoundingClientRect(); onSeek(((e.clientX - box.left) / box.width) * duration) }}>
        {project.removals.map((r) => (
          <rect key={r.id} x={(r.start / duration) * 1000} width={Math.max(1.5, ((r.end - r.start) / duration) * 1000)} y="0" height="100"
            fill={r.kept ? 'transparent' : REASON_COLOR[r.reason]} stroke={r.kept ? REASON_COLOR[r.reason] : 'none'} strokeDasharray="3 3" opacity={r.kept ? 0.9 : 0.42} />
        ))}
        <path d={path} className="wave" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="cm-legend"><span><i style={{ background: 'var(--cm-pause)' }} />pause</span><span><i style={{ background: 'var(--cm-filler)' }} />filler</span><span><i style={{ background: 'var(--cm-retake)' }} />earlier take</span><span className="cm-muted">click to play from there</span></div>
    </div>
  )
}
