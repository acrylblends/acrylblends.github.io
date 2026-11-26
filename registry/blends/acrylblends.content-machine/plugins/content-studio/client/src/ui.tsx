/** Small parts of the screen: icons, a switch, a field, the running job's bar, and the copy button. */
import { useState, type ReactNode } from 'react'
import { api, type Job } from './api.ts'

const PATHS: Record<string, string> = {
  film: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4',
  plus: 'M12 5v14M5 12h14',
  tag: 'M3 12V4h8l9 9-8 8zM7.5 7.5h.01',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  text: 'M4 6h16M4 12h10M4 18h13',
  wave: 'M2 12h2M6 8v8M10 4v16M14 7v10M18 10v4M22 12h-2',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  phone: 'M7 2h10v20H7zM11 18h2',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  play: 'M7 4l13 8-13 8z',
  stop: 'M6 6h12v12H6z',
  check: 'M4 12l5 5L20 6',
  x: 'M6 6l12 12M18 6L6 18',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15 9h.01',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
}

export function Icon({ name }: { name: string }) {
  return <svg className="cm-ic" viewBox="0 0 24 24" aria-hidden="true"><path d={PATHS[name] ?? PATHS.plus} /></svg>
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="cm-toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true"><span className="knob" /></span>
      <span className="text">{label}{hint && <small>{hint}</small>}</span>
    </label>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="cm-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

export function JobBar({ job }: { job: Job | undefined }) {
  if (!job) return null
  if (job.status === 'running')
    return (
      <div className="cm-job" role="status">
        <div className="top"><b>{job.title}</b><span>{job.message}{job.progress !== undefined ? ` · ${Math.round(job.progress * 100)}%` : ''}</span><button className="cm-btn ghost small" onClick={() => { void api.stop(job.id) }}><Icon name="stop" /> Stop</button></div>
        <div className="bar"><b style={{ width: `${Math.round((job.progress ?? 0.03) * 100)}%` }} /></div>
      </div>
    )
  if (job.status === 'failed') return <div className="cm-banner err" role="alert"><b>{job.title} failed.</b> {job.message}</div>
  if (job.status === 'stopped') return <div className="cm-banner">{job.title} was stopped.</div>
  return null
}

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button className="cm-btn ghost small" onClick={() => { void navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }) }}>
      <Icon name={done ? 'check' : 'copy'} /> {done ? 'Copied' : 'Copy'}
    </button>
  )
}
