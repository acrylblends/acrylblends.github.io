/** The app's own pages: the brand the posts speak for, the media library, and the outside services (the AI writer, speech-to-text). */
import { useEffect, useState } from 'react'
import { api, type Brand, bytes, type LibraryFile, type Status, upload } from './api.ts'
import { Field, Icon } from './ui.tsx'

export function BrandPage({ brand }: { brand: Brand }) {
  const [draft, setDraft] = useState(brand)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  useEffect(() => setDraft(brand), [brand])
  const set = (key: keyof Brand) => (e: { target: { value: string } }) => setDraft({ ...draft, [key]: e.target.value })
  const save = async () => {
    setError('')
    try { await api.setBrand(draft); setSaved('Saved'); setTimeout(() => setSaved(''), 1500) } catch (e) { setError((e as Error).message) }
  }
  return (
    <div className="cm-page">
      <h1>Brand</h1>
      <p className="cm-lead">What the machine knows about you. The posts, titles and thumbnails speak for this business; prices and dates are mentioned only as written here.</p>
      <div className="cm-form">
        <Field label="Name"><input className="cm-input" value={draft.name} onChange={set('name')} placeholder="e.g. Vienna AI Workshops" /></Field>
        <Field label="What you do"><textarea className="cm-input" rows={3} value={draft.about} onChange={set('about')} placeholder="One or two sentences" /></Field>
        <Field label="Who it is for"><input className="cm-input" value={draft.audience} onChange={set('audience')} placeholder="e.g. founders and freelancers who post on LinkedIn" /></Field>
        <Field label="Tone"><input className="cm-input" value={draft.tone} onChange={set('tone')} /></Field>
        <Field label="Offers and prices" hint="Mentioned only when they fit, and only as written here."><textarea className="cm-input" rows={3} value={draft.offers} onChange={set('offers')} placeholder="e.g. Workshop on 25 October, 9:00 to 20:00, 290 EUR" /></Field>
        <Field label="Call to action"><input className="cm-input" value={draft.callToAction} onChange={set('callToAction')} placeholder="e.g. Book your seat at example.com" /></Field>
        <Field label="Links"><textarea className="cm-input" rows={2} value={draft.links} onChange={set('links')} /></Field>
        <Field label="Accent color"><span className="cm-row"><input type="color" value={draft.color} onChange={set('color')} /><input className="cm-input mono" value={draft.color} onChange={set('color')} /></span></Field>
      </div>
      {error && <div className="cm-banner err">{error}</div>}
      <div className="cm-row"><button className="cm-btn primary" onClick={() => void save()}>Save the brand</button><span className="cm-ok small">{saved}</span></div>
    </div>
  )
}

export function LibraryPage() {
  const [files, setFiles] = useState<LibraryFile[]>([])
  const [progress, setProgress] = useState<number>()
  const [error, setError] = useState('')
  const load = () => { api.library().then(setFiles).catch((e: Error) => setError(e.message)) }
  useEffect(load, [])
  const add = async (list: FileList | null) => {
    setError('')
    for (const file of Array.from(list ?? [])) {
      setProgress(0)
      try { await upload('/library', file, setProgress) } catch (e) { setError((e as Error).message) }
    }
    setProgress(undefined)
    load()
  }
  return (
    <div className="cm-page">
      <h1>Library</h1>
      <p className="cm-lead">Music, sound effects, pictures and clips to use in any video: music goes under the voice, pictures and clips over the video.</p>
      <label className="cm-drop">
        <input type="file" multiple accept="audio/*,image/*,video/*" onChange={(e) => void add(e.target.files)} />
        <Icon name="upload" /><b>Add music, pictures or clips</b><small>MP3, WAV, M4A · PNG, JPG, WebP · MP4, MOV, WebM</small>
        {progress !== undefined && <div className="bar"><b style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
      </label>
      {error && <div className="cm-banner err">{error}</div>}
      <div className="cm-library">
        {files.length === 0 && <p className="cm-muted">The library is empty. A soft music bed can be made in a video's step 4.</p>}
        {files.map((f) => (
          <div key={f.file} className="cm-card flat item">
            {f.kind === 'image' && <img src={api.libraryFile(f.file)} alt="" />}
            {f.kind === 'video' && <video src={api.libraryFile(f.file)} muted preload="metadata" />}
            {f.kind === 'audio' && <audio controls src={api.libraryFile(f.file)} preload="none" />}
            <b>{f.file}</b><small className="cm-muted">{f.kind} · {bytes(f.bytes)}</small>
          </div>
        ))}
      </div>
    </div>
  )
}

function ServiceForm({ service, info, title, help, onSaved }: { service: 'writer' | 'transcriber'; info: Status['writer']; title: string; help: string; onSaved: () => void }) {
  const [baseUrl, setBaseUrl] = useState(info.baseUrl)
  const [model, setModel] = useState(info.model)
  const [apiKey, setApiKey] = useState('')
  const [message, setMessage] = useState('')
  const save = async () => {
    setMessage('')
    try { await api.saveService(service, { baseUrl, model, apiKey }); setApiKey(''); setMessage('Saved'); onSaved() } catch (e) { setMessage((e as Error).message) }
  }
  return (
    <div className="cm-card flat">
      <div className="cm-row between"><b>{title}</b><span className={`cm-pill ${info.configured ? 'ok' : 'off'}`}>{info.configured ? (info.from === 'environment' ? `from ${info.env}` : 'set') : 'not set'}</span></div>
      <p className="cm-muted small">{help}</p>
      <div className="cm-grid2">
        <Field label="Address"><input className="cm-input mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></Field>
        <Field label="Model"><input className="cm-input mono" value={model} onChange={(e) => setModel(e.target.value)} /></Field>
      </div>
      <Field label="Key" hint={info.keySet ? 'A key is saved. Leave empty to keep it.' : 'Saved on this computer only, readable by you only.'}><input className="cm-input mono" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></Field>
      <div className="cm-row"><button className="cm-btn primary" onClick={() => void save()}>Save</button><span className="small">{message}</span></div>
    </div>
  )
}

export function SettingsPage({ status, onSaved }: { status: Status | undefined; onSaved: () => void }) {
  if (!status) return <div className="cm-page"><h1>Settings</h1><p className="cm-muted">Loading…</p></div>
  return (
    <div className="cm-page">
      <h1>Settings</h1>
      <div className="cm-card flat">
        <b>Tools on this computer</b>
        <ul className="cm-tools">
          {Object.entries(status.tools).map(([tool, ok]) => (
            <li key={tool}><span className={`cm-dot ${ok ? 'ok' : 'warn'}`} /> <b>{tool}</b> <span className="cm-muted">{ok ? 'found' : tool === 'yt-dlp' ? 'not found: needed only for YouTube and similar links (brew install yt-dlp)' : 'not found: install ffmpeg (brew install ffmpeg, winget install ffmpeg, apt install ffmpeg)'}</span></li>
          ))}
        </ul>
      </div>
      <ServiceForm service="writer" info={status.writer} title="AI writer" onSaved={onSaved}
        help="Writes the posts, picks the moments for shorts and suggests thumbnail headlines. Any OpenAI-compatible chat API: DeepSeek (https://api.deepseek.com/v1, deepseek-chat), OpenAI, or a local server." />
      <ServiceForm service="transcriber" info={status.transcriber} title="Speech to text" onSaved={onSaved}
        help="Turns the recording into a transcript with word times. Any OpenAI-compatible /audio/transcriptions API (OpenAI whisper-1 gives word times). Without one, bring an SRT, VTT or JSON transcript." />
    </div>
  )
}
