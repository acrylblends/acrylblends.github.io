/** The six steps' controls. Each calls a feature's action (a job) or saves a setting; the project comes back through the event stream. */
import { useEffect, useMemo, useState } from 'react'
import { api, clock, type LibraryFile, type Project, upload } from './api.ts'
import type { StepProps } from './project.tsx'
import { CopyButton, Field, Icon, Toggle } from './ui.tsx'

function Need({ what, href }: { what: string; href?: string }) {
  return <div className="cm-banner warn">{what}{href && <> <a href={href}>Open Settings</a></>}</div>
}

/** 1. Bring the video */
export function BringStep({ project, busy, run }: StepProps) {
  const [link, setLink] = useState('')
  const [progress, setProgress] = useState<number>()
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const send = async (file: File) => {
    setError('')
    setProgress(0)
    try {
      const { file: uploaded } = await upload(`/projects/${project.id}/upload`, file, setProgress)
      await run('ingest', 'upload', { file: uploaded })
    } catch (e) { setError((e as Error).message) } finally { setProgress(undefined) }
  }
  const source = project.source
  return (
    <div className="cm-stack">
      <h2>Bring the video</h2>
      <p className="cm-muted">A phone video, a screen recording, a podcast or a voice memo, or a link to one. Long takes and mistakes are fine: the next step cleans them up.</p>
      {source && (
        <div className="cm-card flat">
          <b>{source.originalName}</b>
          <span className="cm-muted small">{clock(source.duration)} · {source.hasVideo ? `${source.width}x${source.height}` : 'sound only (a waveform picture was made)'} · {source.from === 'url' ? 'from a link' : 'uploaded'}</span>
        </div>
      )}
      <label className={`cm-drop${drag ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void send(f) }}>
        <input type="file" accept="video/*,audio/*" disabled={busy || progress !== undefined} onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f) }} />
        <Icon name="upload" />
        <b>{source ? 'Replace with another file' : 'Drop a video or audio file here'}</b>
        <small>or click to choose · MP4, MOV, WebM, MP3, WAV, M4A</small>
        {progress !== undefined && <div className="bar"><b style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
      </label>
      <form className="cm-row" onSubmit={(e) => { e.preventDefault(); if (link.trim()) void run('ingest', 'link', { url: link.trim() }) }}>
        <input className="cm-input grow" type="url" placeholder="https://youtube.com/watch?v=… or a link to a file" value={link} onChange={(e) => setLink(e.target.value)} aria-label="Link" />
        <button className="cm-btn" disabled={busy || link.trim() === ''}><Icon name="link" /> Get it</button>
      </form>
      {error && <div className="cm-banner err">{error}</div>}
      {source && <p className="cm-muted small">Bringing another video starts the project over: its transcript, cuts and outputs are replaced.</p>}
    </div>
  )
}

/** The transcript with what the cut removes struck through and each pause marked; click a word to play from it. */
function TranscriptView({ project, seek }: { project: Project; seek: (t: number) => void }) {
  const words = project.transcript?.words ?? []
  const cut = project.removals.filter((r) => !r.kept)
  const removedAt = (start: number, end: number) => cut.find((r) => (start + end) / 2 >= r.start && (start + end) / 2 <= r.end)
  const pauses = cut.filter((r) => r.reason === 'silence')
  const items = useMemo(() => {
    const out: { kind: 'word' | 'pause'; t: number; text: string; reason?: string }[] = []
    let p = 0
    for (const w of words) {
      while (p < pauses.length && pauses[p]!.start <= w.start) { out.push({ kind: 'pause', t: pauses[p]!.start, text: `${(pauses[p]!.end - pauses[p]!.start).toFixed(1)}s` }); p++ }
      const r = removedAt(w.start, w.end)
      out.push({ kind: 'word', t: w.start, text: w.text, ...(r ? { reason: r.reason } : {}) })
    }
    return out
  }, [project.transcript, project.removals])
  return (
    <div className="cm-transcript" aria-label="Transcript">
      {items.map((item, i) => item.kind === 'pause'
        ? <span key={i} className="pause" title="pause shortened">⏸ {item.text}</span>
        : <span key={i} className={`w${item.reason ? ` cut ${item.reason}` : ''}`} onClick={() => seek(item.t)}>{item.text} </span>)}
    </div>
  )
}

/** 2. Transcript and cut */
export function CutStep({ project, shared, busy, run, save, seek, has }: StepProps) {
  const [progress, setProgress] = useState<number>()
  const [error, setError] = useState('')
  const transcriber = shared.status?.transcriber
  if (!project.source) return <div className="cm-stack"><h2>Transcript and cut</h2><p className="cm-muted">Bring the video first.</p></div>
  const importFile = async (file: File) => {
    setError('')
    setProgress(0)
    try {
      const { file: uploaded } = await upload(`/projects/${project.id}/upload`, file, setProgress)
      await run('transcribe', 'import', { file: uploaded })
    } catch (e) { setError((e as Error).message) } finally { setProgress(undefined) }
  }
  const groups = (['retake', 'filler', 'silence', 'manual'] as const).map((reason) => ({ reason, items: project.removals.filter((r) => r.reason === reason) })).filter((g) => g.items.length > 0)
  const label = { retake: 'Earlier takes', filler: 'Filler words', silence: 'Long pauses', manual: 'Your cuts' }
  return (
    <div className="cm-stack">
      <h2>Transcript and cut</h2>
      {has('transcribe') && (
        <div className="cm-card flat">
          <div className="cm-row between"><b>Transcript</b>{project.transcript && <span className="cm-pill ok">{project.transcript.words.length} words{project.transcript.language ? ` · ${project.transcript.language}` : ''}</span>}</div>
          {transcriber && !transcriber.configured && <p className="cm-muted small">No speech-to-text service is set. <a href="#/settings">Add one in Settings</a> (an OpenAI key works), or bring a transcript or subtitle file you have.</p>}
          <div className="cm-row">
            <button className="cm-btn primary" disabled={busy || !transcriber?.configured} onClick={() => void run('transcribe', 'transcribe')}><Icon name="text" /> {project.transcript ? 'Transcribe again' : 'Transcribe'}</button>
            <label className="cm-btn">
              <input type="file" accept=".srt,.vtt,.json,text/plain,application/json" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f) }} />
              <Icon name="upload" /> Use an SRT, VTT or JSON file
            </label>
          </div>
          {progress !== undefined && <div className="cm-bar"><b style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
          {error && <div className="cm-banner err">{error}</div>}
          {project.transcript?.estimatedWords && <p className="cm-muted small">The file has line times only, so word times are estimated: fillers inside a line cannot be cut exactly.</p>}
        </div>
      )}
      {has('cut') && (
        <div className="cm-card flat">
          <b>What to cut</b>
          <div className="cm-grid2">
            <Toggle checked={project.edit.cutFillers} onChange={(v) => void save({ edit: { cutFillers: v } })} label='Filler words' hint='"um", "uh", "erm"' />
            <Toggle checked={project.edit.cutRetakes} onChange={(v) => void save({ edit: { cutRetakes: v } })} label="Earlier takes" hint="a sentence said again: the last take stays" />
          </div>
          <Field label={`Shorten pauses longer than ${project.edit.silenceMin.toFixed(1)} s`}>
            <input type="range" min="0.3" max="3" step="0.1" value={project.edit.silenceMin} onChange={(e) => void save({ edit: { silenceMin: Number(e.target.value) } })} />
          </Field>
          <div className="cm-row">
            <button className="cm-btn" disabled={busy} onClick={() => void run('cut', 'suggest')}><Icon name="scissors" /> Find what to cut</button>
            <button className="cm-btn primary" disabled={busy} onClick={() => void run('cut', 'render')}><Icon name="play" /> Render the cut</button>
          </div>
          {project.outputs.cut && <p className="cm-ok small"><Icon name="check" /> The cut is rendered ({clock(project.outputs.cut.duration)}).</p>}
        </div>
      )}
      {groups.length > 0 && (
        <div className="cm-card flat">
          <b>Suggested cuts</b>
          <p className="cm-muted small">Everything listed is cut. Keep any of them with one click; click the time to hear it.</p>
          {groups.map((g) => (
            <details key={g.reason} open={g.reason !== 'silence'}>
              <summary>{label[g.reason]} <span className="cm-muted">({g.items.filter((r) => !r.kept).length} of {g.items.length} cut)</span></summary>
              <ul className="cm-cuts">
                {g.items.map((r) => (
                  <li key={r.id} className={r.kept ? 'kept' : ''}>
                    <button className="time" onClick={() => seek(Math.max(0, r.start - 1))}>{clock(r.start)}</button>
                    <span className="what">{r.text || `${(r.end - r.start).toFixed(1)} s pause`}</span>
                    <button className="cm-btn ghost small" onClick={() => void api.keep(project.id, r.id, !r.kept)}>{r.kept ? 'Cut it' : 'Keep'}</button>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
      {project.transcript && <TranscriptView project={project} seek={seek} />}
    </div>
  )
}

/** 3. Sound */
export function SoundStep({ project, busy, run, save }: StepProps) {
  const [version, setVersion] = useState(0)
  useEffect(() => setVersion((v) => v + 1), [project.updatedAt])
  if (!project.source) return <div className="cm-stack"><h2>Sound</h2><p className="cm-muted">Bring the video first.</p></div>
  const presets = [
    { id: 'off', title: 'As recorded', sub: 'no change' },
    { id: 'clean', title: 'Clean', sub: 'rumble and room noise away, level evened, -16 LUFS' },
    { id: 'podcast', title: 'Podcast', sub: 'clean, plus a warmer, closer voice' },
  ]
  return (
    <div className="cm-stack">
      <h2>Sound</h2>
      <p className="cm-muted">Your phone recording should sound like a podcast. The sound is applied when the cut is rendered.</p>
      <div className="cm-choices" role="radiogroup" aria-label="Sound">
        {presets.map((p) => (
          <label key={p.id} className={`cm-choice${project.sound.preset === p.id ? ' on' : ''}`}>
            <input type="radio" name="sound" checked={project.sound.preset === p.id} onChange={() => void save({ sound: { preset: p.id } })} />
            <b>{p.title}</b><small>{p.sub}</small>
          </label>
        ))}
      </div>
      <div className="cm-row"><button className="cm-btn" disabled={busy || !project.source.hasAudio} onClick={() => void run('sound', 'preview')}><Icon name="wave" /> Hear 20 seconds before and after</button></div>
      <AudioPair project={project} version={version} />
      {!project.outputs.cut && <p className="cm-muted small">Render the cut (step 2) to hear the whole video with this sound.</p>}
    </div>
  )
}

function AudioPair({ project, version }: { project: Project; version: number }) {
  const [have, setHave] = useState(false)
  useEffect(() => { fetch(api.file(project.id, 'preview-after.m4a'), { method: 'HEAD' }).then((r) => setHave(r.ok)).catch(() => setHave(false)) }, [project.id, version])
  if (!have) return null
  return (
    <div className="cm-grid2">
      <div className="cm-card flat"><b>Before</b><audio controls src={api.file(project.id, 'preview-before.m4a', String(version))} /></div>
      <div className="cm-card flat"><b>After</b><audio controls src={api.file(project.id, 'preview-after.m4a', String(version))} /></div>
    </div>
  )
}

function useLibrary(): [LibraryFile[], () => void] {
  const [files, setFiles] = useState<LibraryFile[]>([])
  const load = () => { api.library().then(setFiles).catch(() => {}) }
  useEffect(load, [])
  return [files, load]
}

/** 4. Captions, music and visuals */
export function VisualsStep({ project, shared, busy, run, save, has }: StepProps) {
  const [files, reload] = useLibrary()
  const [title, setTitle] = useState(project.visuals.title)
  const [subtitle, setSubtitle] = useState(project.visuals.subtitle)
  useEffect(() => { setTitle(project.visuals.title); setSubtitle(project.visuals.subtitle) }, [project.visuals.title, project.visuals.subtitle])
  if (!project.source) return <div className="cm-stack"><h2>Captions, music, visuals</h2><p className="cm-muted">Bring the video first.</p></div>
  const audio = files.filter((f) => f.kind === 'audio')
  const pictures = files.filter((f) => f.kind === 'image' || f.kind === 'video')
  const addOverlay = (file: LibraryFile) => {
    const at = project.visuals.overlays.reduce((max, o) => Math.max(max, o.at + o.duration), 4)
    void save({ visuals: { overlays: [...project.visuals.overlays, { id: `o${Date.now().toString(36)}`, file: file.file, kind: file.kind, at, duration: 4 }] } })
  }
  return (
    <div className="cm-stack">
      <h2>Captions, music, visuals</h2>
      {has('visuals') && (
        <div className="cm-card flat">
          <div className="cm-row between"><b>Captions</b><Toggle checked={project.captions.enabled} onChange={(v) => void save({ captions: { enabled: v } })} label="On" /></div>
          <div className="cm-choices three" role="radiogroup" aria-label="Caption style">
            {(['bold', 'karaoke', 'minimal'] as const).map((s) => (
              <label key={s} className={`cm-choice cap-${s}${project.captions.style === s ? ' on' : ''}`}>
                <input type="radio" name="capstyle" checked={project.captions.style === s} onChange={() => void save({ captions: { style: s } })} />
                <span className="sample">{s === 'karaoke' ? <>THE <em>WORD</em></> : 'The words'}</span><small>{s === 'bold' ? 'Bold on a box' : s === 'karaoke' ? 'Each word lights up' : 'Small and quiet'}</small>
              </label>
            ))}
          </div>
          {!project.transcript && <p className="cm-muted small">Captions come from the transcript (step 2).</p>}
        </div>
      )}
      {has('visuals') && (
        <div className="cm-card flat">
          <b>Title card</b>
          <Field label="Title (over the first seconds; empty for none)"><input className="cm-input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} onBlur={() => { if (title !== project.visuals.title) void save({ visuals: { title } }) }} /></Field>
          <Field label="Line under it"><input className="cm-input" value={subtitle} maxLength={160} onChange={(e) => setSubtitle(e.target.value)} onBlur={() => { if (subtitle !== project.visuals.subtitle) void save({ visuals: { subtitle } }) }} /></Field>
          <div className="cm-grid2">
            <Toggle checked={project.visuals.punchIns} onChange={(v) => void save({ visuals: { punchIns: v } })} label="Punch-in zooms" hint="a gentle zoom where a new thought starts" />
            <Toggle checked={project.visuals.progressBar} onChange={(v) => void save({ visuals: { progressBar: v } })} label="Progress bar" hint="a thin bar in your brand color" />
          </div>
          <p className="cm-muted small">Colors come from your <a href="#/brand">brand</a> ({shared.brand?.color}).</p>
        </div>
      )}
      {has('music') && (
        <div className="cm-card flat">
          <b>Music and sound effects</b>
          <Field label="Music under the voice">
            <select className="cm-input" value={project.music.track ?? ''} onChange={(e) => void save({ music: { track: e.target.value || null } })}>
              <option value="">No music</option>
              {audio.map((f) => <option key={f.file} value={f.file}>{f.file}</option>)}
            </select>
          </Field>
          {project.music.track && (
            <>
              <Field label={`Music level ${Math.round(project.music.volume * 100)}%`}><input type="range" min="0.02" max="0.6" step="0.01" value={project.music.volume} onChange={(e) => void save({ music: { volume: Number(e.target.value) } })} /></Field>
              <Toggle checked={project.music.duck} onChange={(v) => void save({ music: { duck: v } })} label="Lower the music while someone speaks" />
            </>
          )}
          <Toggle checked={project.music.whooshOnCuts} onChange={(v) => void save({ music: { whooshOnCuts: v } })} label="Whoosh on scene changes" hint="a soft sweep where the cut jumps" />
          <div className="cm-row">
            <button className="cm-btn" disabled={busy} onClick={() => { void run('music', 'make-bed').then(() => setTimeout(reload, 4000)) }}><Icon name="music" /> Make a soft music bed</button>
            <a className="cm-btn ghost" href="#/library">Add your own music</a>
          </div>
        </div>
      )}
      {has('visuals') && (
        <div className="cm-card flat">
          <b>Pictures and clips over the video</b>
          {project.visuals.overlays.length === 0 && <p className="cm-muted small">Stock footage, screenshots or generated pictures from your <a href="#/library">library</a>, laid over the video for a few seconds.</p>}
          <ul className="cm-overlays">
            {project.visuals.overlays.map((o) => (
              <li key={o.id}>
                <span className="file">{o.file}</span>
                <label>at <input type="number" min="0" step="0.5" value={o.at} onChange={(e) => void save({ visuals: { overlays: project.visuals.overlays.map((x) => (x.id === o.id ? { ...x, at: Number(e.target.value) } : x)) } })} /> s</label>
                <label>for <input type="number" min="0.5" max="60" step="0.5" value={o.duration} onChange={(e) => void save({ visuals: { overlays: project.visuals.overlays.map((x) => (x.id === o.id ? { ...x, duration: Number(e.target.value) } : x)) } })} /> s</label>
                <button className="cm-btn ghost small" aria-label="Remove" onClick={() => void save({ visuals: { overlays: project.visuals.overlays.filter((x) => x.id !== o.id) } })}><Icon name="x" /></button>
              </li>
            ))}
          </ul>
          {pictures.length > 0 && <div className="cm-row wrap">{pictures.map((f) => <button key={f.file} className="cm-chip" onClick={() => addOverlay(f)}><Icon name="plus" /> {f.file}</button>)}</div>}
        </div>
      )}
      {has('visuals') && (
        <div className="cm-row">
          <button className="cm-btn primary big" disabled={busy} onClick={() => void run('visuals', 'render')}><Icon name="sparkle" /> Render the finished video</button>
          {project.outputs.final && <span className="cm-ok small"><Icon name="check" /> Rendered</span>}
        </div>
      )}
    </div>
  )
}

/** 5. Shorts and thumbnail */
export function ShortsStep({ project, shared, busy, run, save, has }: StepProps) {
  const [count, setCount] = useState(4)
  const [headline, setHeadline] = useState('')
  if (!project.source) return <div className="cm-stack"><h2>Shorts and thumbnail</h2><p className="cm-muted">Bring the video first.</p></div>
  const writer = shared.status?.writer.configured
  return (
    <div className="cm-stack">
      <h2>Shorts and thumbnail</h2>
      {has('shorts') && (
        <div className="cm-card flat">
          <b>Shorts</b>
          <p className="cm-muted small">Vertical clips of the best moments, with big captions and a title. {writer ? 'The AI writer picks moments that stand alone.' : 'Without an AI writer, the densest stretches of speech are picked; add one in Settings for better picks.'}</p>
          {!project.transcript && <Need what="Shorts are picked from the transcript: make one in step 2." />}
          <div className="cm-row">
            <label className="cm-inline">How many <input className="cm-input num" type="number" min="1" max="10" value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
            <button className="cm-btn" disabled={busy || !project.transcript} onClick={() => void run('shorts', 'suggest', { count })}><Icon name="sparkle" /> Pick the moments</button>
            <button className="cm-btn primary" disabled={busy || project.shorts.length === 0} onClick={() => void run('shorts', 'render')}><Icon name="phone" /> Render the shorts</button>
          </div>
          <div className="cm-shorts">
            {project.shorts.map((s) => (
              <div key={s.id} className="cm-short">
                {s.output ? <video src={api.file(project.id, s.output.file, s.output.at)} controls preload="metadata" /> : <div className="ph"><Icon name="phone" /><small>not rendered</small></div>}
                <input className="cm-input" value={s.title} aria-label="Short title" onChange={(e) => void save({ shorts: project.shorts.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)) })} />
                <small className="cm-muted">{clock(s.start)} to {clock(s.end)} · {Math.round(s.end - s.start)} s</small>
              </div>
            ))}
          </div>
        </div>
      )}
      {has('thumbnail') && (
        <div className="cm-card flat">
          <b>Thumbnail</b>
          <div className="cm-row">
            <input className="cm-input grow" placeholder={project.posts?.thumbnailText || 'Headline (a few words); empty: suggested'} value={headline} onChange={(e) => setHeadline(e.target.value)} />
            <button className="cm-btn primary" disabled={busy} onClick={() => void run('thumbnail', 'make', headline.trim() ? { text: headline.trim() } : {})}><Icon name="image" /> Make it</button>
          </div>
          {project.outputs.thumbnail && <img className="cm-thumb" src={api.file(project.id, project.outputs.thumbnail.file, project.outputs.thumbnail.at)} alt="Thumbnail" />}
        </div>
      )}
    </div>
  )
}

/** 6. Posts */
export function PostsStep({ project, shared, busy, run }: StepProps) {
  const [note, setNote] = useState('')
  const writer = shared.status?.writer
  const posts = project.posts
  return (
    <div className="cm-stack">
      <h2>Posts</h2>
      <p className="cm-muted">Written from what you say and from your <a href="#/brand">brand</a>: the offers, prices and links you set there are mentioned where they fit, and nothing is invented. Nothing is posted for you.</p>
      {writer && !writer.configured && <Need what="No AI writer is set. Add one (DeepSeek works) in Settings." href="#/settings" />}
      {!project.transcript && <Need what="The posts are written from the transcript: make one in step 2." />}
      <Field label="Anything to stress (optional)"><input className="cm-input" value={note} placeholder="e.g. the workshop on 25 October, 9:00 to 20:00" onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="cm-row"><button className="cm-btn primary" disabled={busy || !writer?.configured || !project.transcript} onClick={() => void run('posts', 'write', note.trim() ? { note: note.trim() } : {})}><Icon name="send" /> {posts ? 'Write them again' : 'Write the posts'}</button></div>
      {posts && (
        <div className="cm-posts">
          <Post title="YouTube" text={`${posts.youtube.title}\n\n${posts.youtube.description}\n\n${posts.youtube.tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' ')}`} />
          <Post title="LinkedIn" text={posts.linkedin} />
          <Post title="Instagram" text={posts.instagram} />
          <Post title="X" text={posts.x} />
        </div>
      )}
    </div>
  )
}

function Post({ title, text }: { title: string; text: string }) {
  return (
    <div className="cm-card flat post">
      <div className="cm-row between"><b>{title}</b><CopyButton text={text} /></div>
      <pre>{text}</pre>
    </div>
  )
}
